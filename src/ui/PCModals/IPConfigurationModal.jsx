import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import appState from "../../state/AppState";

// ─── Dispatch helper ──────────────────────────────────────────────────────────
function dispatchLog(deviceName, message, location = "Unknown") {
  window.dispatchEvent(
    new CustomEvent("add-system-log", {
      detail: { device: "PC", deviceName, message, location },
    })
  );
}

// ─── Generate EUI-64 link-local from interface name ───────────────────────────
function generateLinkLocal(ifaceName) {
  const seed = [...(ifaceName || "eth0")].reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const hex  = (n) => (n & 0xff).toString(16).padStart(2, "0").toUpperCase();
  return `FE80::${hex((seed >> 8) & 0xff)}${hex(seed & 0xff)}:${hex((seed * 3) & 0xff)}FF:FE${hex((seed * 7) & 0xff)}:${hex((seed * 13) & 0xff)}${hex((seed * 17) & 0xff)}`;
}

// ─── FastEthernet filter ──────────────────────────────────────────────────────
// Matches any FastEthernet interface (FastEthernet0, FastEthernet1, Fa0/1, etc.)
const isFastEthernet = (name = "") => /^fastethernet\d/i.test(name.trim());

// ─── Resolve configurable interfaces ─────────────────────────────────────────
// Strategy (in order):
//   1. FastEthernet interfaces from _interfaces Map  (Device class instance)
//   2. ALL interfaces from _interfaces Map           (fallback — catches any port name)
//   3. FastEthernet interfaces from interfaces array (NetworkStore plain object)
//   4. ALL interfaces from interfaces array          (fallback)
//   5. Hard stub — UI never breaks, but writes will be no-ops (warns to console)
function resolveInterfaces(device) {
  // ── Device class instance path (_interfaces is a Map) ─────────────────────
  if (device?._interfaces instanceof Map && device._interfaces.size > 0) {
    const all = [...device._interfaces.values()];

    // Prefer FastEthernet ports; fall back to everything the device exposes
    const candidates = all.filter((i) => isFastEthernet(i.name));
    const resolved   = candidates.length > 0 ? candidates : all;

    return resolved.map((i) => ({ id: i.name, name: i.name, ifaceRef: i }));
  }

  // ── NetworkStore plain-object path (interfaces is an array) ───────────────
  if (Array.isArray(device?.interfaces) && device.interfaces.length > 0) {
    const all = device.interfaces;

    const candidates = all.filter((i) => isFastEthernet(i.name || i.label || ""));
    const resolved   = candidates.length > 0 ? candidates : all;

    return resolved.map((i, idx) => ({
      id:       i.id    || i.name  || `iface-${idx}`,
      name:     i.name  || i.label || `Interface${idx}`,
      ifaceRef: i,
    }));
  }

  // ── Hard stub — device has no interfaces at all ────────────────────────────
  console.warn("[IPConfigurationModal] resolveInterfaces: device has no interfaces — writes will be no-ops.", device);
  return [{ id: "fa0", name: "FastEthernet0", ifaceRef: null }];
}

// ─── Read current IPv4 values from a live interface ref ───────────────────────
// Covers both the Interface class shape (ipv4.address / ipv4.subnetMask) and
// the plain NetworkStore shape (ipv4.ip / ipv4.mask).
// Falls back to device._ipv4 / device.ipv4 so values survive serialization
// round-trips where ifaceRef.ipv4 may not yet be re-hydrated.
function readIpv4(ifaceRef, device) {
  // Prefer the live interface ref, then the device-level persisted copy
  const v4 = ifaceRef?.ipv4 || device?._ipv4 || device?.ipv4 || {};
  return {
    address:    v4.address    || v4.ip      || "",
    subnetMask: v4.subnetMask || v4.mask    || "",
    gateway:    v4.gateway    || v4.gw      || "",
    dns:        v4.dns        || v4.dns1    || "",
    mode:       v4.mode === "dhcp" ? "dhcp" : "static",
  };
}

// ─── Read current IPv6 values from a live interface ref ───────────────────────
// Same fallback strategy as readIpv4.
function readIpv6(ifaceRef, device) {
  const v6 = ifaceRef?.ipv6 || device?._ipv6 || device?.ipv6 || {};
  return {
    address:   v6.address      || v6.ip            || "",
    prefix:    v6.prefix       || v6.prefixLength   || "",
    gateway:   v6.gateway      || v6.gw             || "",
    dns:       v6.dns          || v6.dns1           || "",
    mode:      v6.mode === "auto" ? "auto" : "static",
    linkLocal: v6.linkLocal    || "",
  };
}

// ─── Nav items ────────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  {
    id: "ipv4",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
      </svg>
    ),
    label: "IPv4",
    sub: "Static / DHCP",
  },
  {
    id: "ipv6",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10"/>
        <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
      </svg>
    ),
    label: "IPv6",
    sub: "Static / Auto",
  },
];

// ─── Component ────────────────────────────────────────────────────────────────
export default function IPConfigurationModal({
  onClose,
  device,                 // Device instance or NetworkStore plain object
  deviceName     = "PC",
  deviceLocation = "Unknown",
  networkStore,           // NetworkStore instance — notifies listeners on Apply
}) {
  const interfaces = resolveInterfaces(device);

  const [activeTab,       setActiveTab]       = useState("ipv4");
  const [selectedIfaceId, setSelectedIfaceId] = useState(interfaces[0]?.id ?? "fa0");

  const selectedEntry = interfaces.find((i) => i.id === selectedIfaceId) || interfaces[0];
  const ifaceRef      = selectedEntry?.ifaceRef ?? null;

  // ── IPv4 state ──────────────────────────────────────────────────────────────
  const [ipv4Mode,   setIpv4Mode]   = useState("static");
  const [ipv4Addr,   setIpv4Addr]   = useState("");
  const [subnetMask, setSubnetMask] = useState("");
  const [gateway4,   setGateway4]   = useState("");
  const [dns4,       setDns4]       = useState("");

  // ── IPv6 state ──────────────────────────────────────────────────────────────
  const [ipv6Mode,   setIpv6Mode]   = useState("static");
  const [ipv6Addr,   setIpv6Addr]   = useState("");
  const [ipv6Prefix, setIpv6Prefix] = useState("");
  const [gateway6,   setGateway6]   = useState("");
  const [dns6,       setDns6]       = useState("");
  const [linkLocal,  setLinkLocal]  = useState("");

  // ── Seed all fields from the live interface whenever selection changes ──────
  useEffect(() => {
    const entry = interfaces.find((i) => i.id === selectedIfaceId) || interfaces[0];
    const ref   = entry?.ifaceRef ?? null;

    // Pass device as fallback so persisted _ipv4/_ipv6 are read when ifaceRef.ipv4
    // hasn't been re-hydrated yet (e.g. after a serialization round-trip).
    const v4 = readIpv4(ref, device);
    setIpv4Addr(v4.address);
    setSubnetMask(v4.subnetMask);
    setGateway4(v4.gateway);
    setDns4(v4.dns);
    setIpv4Mode(v4.mode);

    const v6 = readIpv6(ref, device);
    setIpv6Addr(v6.address);
    setIpv6Prefix(v6.prefix);
    setGateway6(v6.gateway);
    setDns6(v6.dns);
    setIpv6Mode(v6.mode);
    setLinkLocal(v6.linkLocal || generateLinkLocal(entry?.name));
  }, [selectedIfaceId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Debounce logging ────────────────────────────────────────────────────────
  const timers    = useRef({});
  const originals = useRef({});

  const scheduleLog = (field, newVal, getOldVal, makeMsg) => {
    if (!timers.current[field]) originals.current[field] = getOldVal();
    clearTimeout(timers.current[field]);
    timers.current[field] = setTimeout(() => {
      const oldVal = originals.current[field];
      if (oldVal !== newVal && newVal !== "") {
        const stamp = new Date().toISOString().replace("T", " ").slice(0, 19);
        dispatchLog(deviceName, makeMsg(stamp, oldVal, newVal), deviceLocation);
        originals.current[field] = newVal;
      }
      delete timers.current[field];
    }, 1000);
  };

  // ── Field change handlers ───────────────────────────────────────────────────
  const onIpv4Change = (val) => {
    setIpv4Addr(val);
    scheduleLog("ipv4addr", val, () => ipv4Addr,
      (t, o, n) => `%SYS-5-IP_CHANGE: [${t}] ${deviceName} @ ${deviceLocation} — IPv4 Address updated: ${o || "unset"} → ${n}. ARP cache cleared for ${selectedEntry?.name}.`
    );
  };
  const onMaskChange = (val) => {
    setSubnetMask(val);
    scheduleLog("subnet", val, () => subnetMask,
      (t, o, n) => `%SYS-6-SUBNET_CHANGE: [${t}] ${deviceName} @ ${deviceLocation} — Subnet Mask updated: ${o || "unset"} → ${n}. Network boundary recalculated.`
    );
  };
  const onGateway4Change = (val) => {
    setGateway4(val);
    scheduleLog("gw4", val, () => gateway4,
      (t, o, n) => `%SYS-6-CONFIG: [${t}] ${deviceName} @ ${deviceLocation} — Default Gateway updated: ${o || "unset"} → ${n}.`
    );
  };
  const onDns4Change = (val) => {
    setDns4(val);
    scheduleLog("dns4", val, () => dns4,
      (t, o, n) => `%SYS-6-CONFIG: [${t}] ${deviceName} @ ${deviceLocation} — DNS Server updated: ${o || "unset"} → ${n}.`
    );
  };
  const onIpv6Change = (val) => {
    setIpv6Addr(val);
    scheduleLog("ipv6addr", val, () => ipv6Addr,
      (t, o, n) => `%SYS-5-IP_CHANGE: [${t}] ${deviceName} @ ${deviceLocation} — IPv6 Address updated: ${o || "unset"} → ${n}.`
    );
  };
  const onPrefixChange = (val) => {
    setIpv6Prefix(val);
    scheduleLog("prefix6", val, () => ipv6Prefix,
      (t, o, n) => `%SYS-6-CONFIG: [${t}] ${deviceName} @ ${deviceLocation} — IPv6 Prefix Length updated: ${o || "unset"} → ${n}.`
    );
  };
  const onGateway6Change = (val) => {
    setGateway6(val);
    scheduleLog("gw6", val, () => gateway6,
      (t, o, n) => `%SYS-6-CONFIG: [${t}] ${deviceName} @ ${deviceLocation} — IPv6 Default Gateway updated: ${o || "unset"} → ${n}.`
    );
  };
  const onDns6Change = (val) => {
    setDns6(val);
    scheduleLog("dns6", val, () => dns6,
      (t, o, n) => `%SYS-6-CONFIG: [${t}] ${deviceName} @ ${deviceLocation} — IPv6 DNS Server updated: ${o || "unset"} → ${n}.`
    );
  };

  // ── Mode toggles ────────────────────────────────────────────────────────────
  const handleIpv4ModeChange = (mode) => {
    setIpv4Mode(mode);
    const stamp = new Date().toISOString().replace("T", " ").slice(0, 19);
    if (mode === "dhcp") {
      dispatchLog(deviceName,
        `%SYS-6-CONFIG: [${stamp}] ${deviceName} @ ${deviceLocation} — IPv4 mode switched to DHCP on ${selectedEntry?.name}. Requesting address from DHCP server.`,
        deviceLocation
      );
      setIpv4Addr(""); setSubnetMask(""); setGateway4(""); setDns4("");
    } else {
      dispatchLog(deviceName,
        `%SYS-6-CONFIG: [${stamp}] ${deviceName} @ ${deviceLocation} — IPv4 mode switched to Static on ${selectedEntry?.name}.`,
        deviceLocation
      );
    }
  };

  const handleIpv6ModeChange = (mode) => {
    setIpv6Mode(mode);
    const stamp = new Date().toISOString().replace("T", " ").slice(0, 19);
    if (mode === "auto") {
      dispatchLog(deviceName,
        `%SYS-6-CONFIG: [${stamp}] ${deviceName} @ ${deviceLocation} — IPv6 mode switched to Automatic (SLAAC) on ${selectedEntry?.name}.`,
        deviceLocation
      );
      setIpv6Addr(""); setIpv6Prefix(""); setGateway6(""); setDns6("");
    } else {
      dispatchLog(deviceName,
        `%SYS-6-CONFIG: [${stamp}] ${deviceName} @ ${deviceLocation} — IPv6 mode switched to Static on ${selectedEntry?.name}.`,
        deviceLocation
      );
    }
  };

  // ── Apply — write back to live interface + notify NetworkStore ──────────────
  const handleApply = () => {
    const stamp = new Date().toISOString().replace("T", " ").slice(0, 19);

    // Build the complete IPv4 and IPv6 objects we want to persist.
    const nextIpv4 =
      ipv4Mode === "static"
        ? { address: ipv4Addr, subnetMask, gateway: gateway4, dns: dns4, mode: "static" }
        : { address: "", subnetMask: "", gateway: "", dns: "", mode: "dhcp" };

    const nextIpv6 = {
      address:   ipv6Mode === "static" ? ipv6Addr   : "",
      prefix:    ipv6Mode === "static" ? ipv6Prefix : "",
      gateway:   ipv6Mode === "static" ? gateway6   : "",
      dns:       ipv6Mode === "static" ? dns6       : "",
      linkLocal: linkLocal,
      mode:      ipv6Mode,
    };

    // 1. Write directly to the live Interface object so in-memory state is
    //    immediately consistent — no second configureIPv4() call will clobber this.
    if (ifaceRef) {
      // Always assign the full object so gateway/dns/mode are never orphaned.
      ifaceRef.ipv4 = nextIpv4;
      ifaceRef.ipv6 = nextIpv6;
    }

    // 2. Notify NetworkStore so Canvas + all listeners re-render.
    //    Pass the full ipv4/ipv6 objects directly — NetworkStore.updateDevice
    //    will call configureIPv4(address, subnetMask) on the primary interface,
    //    but since ifaceRef IS that primary interface the values are already set
    //    above; the call here is purely to trigger notify() + forceCanvasUpdate.
    //    We skip the ipAddress/subnetMask shortcut path to avoid a second write
    //    that would strip gateway and dns from the object.
    if (networkStore && device?.id) {
      networkStore.updateDevice(device.id, {
        _ipv4: nextIpv4,   // stored on the device object for serialisation
        _ipv6: nextIpv6,
      });
    }

    // 3. Audit log
    dispatchLog(
      deviceName,
      `%SYS-5-CONFIG_APPLIED: [${stamp}] ${deviceName} @ ${deviceLocation} — ` +
        `IP configuration applied on ${selectedEntry?.name}. ` +
        (ipv4Mode === "dhcp"
          ? "IPv4: DHCP."
          : `IPv4: ${ipv4Addr || "unset"}/${subnetMask || "unset"}, GW: ${gateway4 || "unset"}.`),
      deviceLocation
    );

    onClose();
  };

  const isIpv4Static = ipv4Mode === "static";
  const isIpv6Static = ipv6Mode === "static";

  return createPortal(
    <div
      className="acl-modal-layer"
      style={{
        position: "fixed", inset: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 9999,
      }}
    >
      <div className="acl-layout">

        {/* ── Sidebar ──────────────────────────────────────────────────── */}
        <aside className="acl-sidebar">
          <div className="acl-sidebar-header">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12.55a11 11 0 0 1 14.08 0"/>
              <path d="M1.42 9a16 16 0 0 1 21.16 0"/>
              <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
              <line x1="12" y1="20" x2="12.01" y2="20"/>
            </svg>
            IP Configuration
          </div>

          <nav className="acl-nav-list">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                className={`acl-nav-item${activeTab === item.id ? " active" : ""}`}
                onClick={() => setActiveTab(item.id)}
              >
                <span className="acl-nav-icon">{item.icon}</span>
                <span className="acl-nav-text">
                  <strong>{item.label}</strong>
                  <p>{item.sub}</p>
                </span>
              </button>
            ))}
          </nav>
        </aside>

        {/* ── Main panel ───────────────────────────────────────────────── */}
        <div className="acl-main">
          <div className="acl-header">
            <h3>
              {activeTab === "ipv4" ? "IPv4 Configuration" : "IPv6 Configuration"}
              {" — "}{deviceName}
            </h3>
            <button
              onClick={onClose}
              style={{
                background: "transparent", border: "none", cursor: "pointer",
                color: "#999", fontSize: 16, lineHeight: 1, padding: "2px 4px",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#111")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "#999")}
            >✕</button>
          </div>

          <div className="acl-body">

            {/* Interface selector */}
            <div className="acl-section">
              <label>Interface</label>
              <div className="acl-inline">
                <div className="acl-input">
                  <select
                    value={selectedIfaceId}
                    onChange={(e) => setSelectedIfaceId(e.target.value)}
                  >
                    {interfaces.map((iface) => (
                      <option key={iface.id} value={iface.id}>{iface.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* ── IPv4 tab ──────────────────────────────────────────────── */}
            {activeTab === "ipv4" && (
              <>
                <div className="acl-section">
                  <label>Address Mode</label>
                  <div style={{ display: "flex", gap: 20 }}>
                    {["dhcp", "static"].map((mode) => (
                      <label key={mode} className="acl-checkbox" style={{ marginTop: 0 }}>
                        <input
                          type="radio" name="ipv4mode" value={mode}
                          checked={ipv4Mode === mode}
                          onChange={() => handleIpv4ModeChange(mode)}
                        />
                        {mode === "dhcp" ? "DHCP" : "Static"}
                      </label>
                    ))}
                  </div>
                </div>

                <div className="acl-section">
                  <label>IPv4 Address</label>
                  <div className="acl-inline">
                    <div className="acl-input">
                      <input
                        value={ipv4Addr}
                        disabled={!isIpv4Static}
                        placeholder={isIpv4Static ? "e.g. 192.168.1.10" : "Assigned by DHCP"}
                        onChange={(e) => onIpv4Change(e.target.value)}
                        style={!isIpv4Static ? { background: "#f5f5f5", color: "#aaa" } : {}}
                      />
                    </div>
                    <div className="acl-input">
                      <input
                        value={subnetMask}
                        disabled={!isIpv4Static}
                        placeholder={isIpv4Static ? "e.g. 255.255.255.0" : "Assigned by DHCP"}
                        onChange={(e) => onMaskChange(e.target.value)}
                        style={!isIpv4Static ? { background: "#f5f5f5", color: "#aaa" } : {}}
                      />
                      <span>Subnet Mask</span>
                    </div>
                  </div>
                </div>

                <div className="acl-section">
                  <div className="acl-inline">
                    <div className="acl-input">
                      <input
                        value={gateway4}
                        placeholder="e.g. 192.168.1.1"
                        onChange={(e) => onGateway4Change(e.target.value)}
                      />
                      <span>Default Gateway</span>
                    </div>
                    <div className="acl-input">
                      <input
                        value={dns4}
                        placeholder="e.g. 8.8.8.8"
                        onChange={(e) => onDns4Change(e.target.value)}
                      />
                      <span>DNS Server</span>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* ── IPv6 tab ──────────────────────────────────────────────── */}
            {activeTab === "ipv6" && (
              <>
                <div className="acl-section">
                  <label>Address Mode</label>
                  <div style={{ display: "flex", gap: 20 }}>
                    {["auto", "static"].map((mode) => (
                      <label key={mode} className="acl-checkbox" style={{ marginTop: 0 }}>
                        <input
                          type="radio" name="ipv6mode" value={mode}
                          checked={ipv6Mode === mode}
                          onChange={() => handleIpv6ModeChange(mode)}
                        />
                        {mode === "auto" ? "Automatic (SLAAC)" : "Static"}
                      </label>
                    ))}
                  </div>
                </div>

                <div className="acl-section">
                  <label>IPv6 Address</label>
                  <div className="acl-inline">
                    <div className="acl-input" style={{ flex: 3 }}>
                      <input
                        value={ipv6Addr}
                        disabled={!isIpv6Static}
                        placeholder={isIpv6Static ? "e.g. 2001:db8::1" : "SLAAC"}
                        onChange={(e) => onIpv6Change(e.target.value)}
                        style={!isIpv6Static ? { background: "#f5f5f5", color: "#aaa" } : {}}
                      />
                    </div>
                    <div className="acl-input" style={{ flex: 1 }}>
                      <input
                        value={ipv6Prefix}
                        disabled={!isIpv6Static}
                        placeholder="64"
                        onChange={(e) => onPrefixChange(e.target.value)}
                        style={!isIpv6Static ? { background: "#f5f5f5", color: "#aaa" } : {}}
                      />
                      <span>Prefix Length</span>
                    </div>
                  </div>
                </div>

                <div className="acl-section">
                  <label>Link-Local Address</label>
                  <div className="acl-inline">
                    <div className="acl-input">
                      <input
                        value={linkLocal}
                        readOnly
                        style={{ background: "#f5f5f5", color: "#888", fontFamily: "monospace", fontSize: 12 }}
                      />
                    </div>
                  </div>
                </div>

                <div className="acl-section">
                  <div className="acl-inline">
                    <div className="acl-input">
                      <input
                        value={gateway6}
                        disabled={!isIpv6Static}
                        placeholder="e.g. fe80::1"
                        onChange={(e) => onGateway6Change(e.target.value)}
                        style={!isIpv6Static ? { background: "#f5f5f5", color: "#aaa" } : {}}
                      />
                      <span>Default Gateway</span>
                    </div>
                    <div className="acl-input">
                      <input
                        value={dns6}
                        disabled={!isIpv6Static}
                        placeholder="e.g. 2001:4860:4860::8888"
                        onChange={(e) => onDns6Change(e.target.value)}
                        style={!isIpv6Static ? { background: "#f5f5f5", color: "#aaa" } : {}}
                      />
                      <span>DNS Server</span>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="acl-footer">
            <button className="acl-btn-secondary" onClick={onClose}>Cancel</button>
            <button className="acl-btn-primary" onClick={handleApply}>Apply</button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}