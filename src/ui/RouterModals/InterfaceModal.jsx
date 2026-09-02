import { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { Network, ChevronDown, ChevronRight, Layers } from "lucide-react";
import appState from "../../state/AppState";

// ---------------------------------------------------------------------------
// Fallback interfaces shown when a device has no interfaces registered yet.
// These mirror common Cisco router defaults so the modal is never empty.
// ---------------------------------------------------------------------------
const FALLBACK_INTERFACES = [
  { id: "g0/0",   name: "GigabitEthernet0/0", description: "LAN-facing port"       },
  { id: "g0/1",   name: "GigabitEthernet0/1", description: "WAN-facing port"       },
  { id: "g0/2",   name: "GigabitEthernet0/2", description: "DMZ / uplink"          },
  { id: "s0/0/0", name: "Serial0/0/0",         description: "WAN serial link"       },
  { id: "lo0",    name: "Loopback0",            description: "Management / BGP RID" },
];

// ---------------------------------------------------------------------------
// Normalise a raw interface object (from Device.js or aain data object)
// into a consistent shape that InterfaceRow can consume.
// ---------------------------------------------------------------------------
function normaliseInterface(raw, index) {
  if (!raw) return null;

  // Support both Device.js Interface instances and plain JS objects
  const id   = raw.id   ?? raw.name ?? `iface-${index}`;
  const name = raw.name ?? raw.label ?? raw.id ?? `Interface ${index}`;
  const desc = raw.description ?? raw.desc ?? "";

  // IP — accept both class instances (ipv4.address) and plain objects
  const address    = raw.ipv4?.address    ?? raw.ipAddress  ?? raw.ip   ?? "";
  const subnetMask = raw.ipv4?.subnetMask ?? raw.subnetMask ?? raw.mask ?? "";
  const ipv6Addr   = raw.ipv6?.address    ?? raw.ipv6Address ?? "";
  const ipv6Prefix = raw.ipv6?.prefixLength ?? raw.ipv6Prefix ?? "";

  // Operational status — Device.js exposes isUp / lineStatus
  const isUp =
    raw.isUp !== undefined ? raw.isUp :
    raw.status === "up"   ? true      : null;   // null = unknown

  return { id, name, desc, address, subnetMask, ipv6Addr, ipv6Prefix, isUp };
}

// ---------------------------------------------------------------------------
// InterfaceRow
// ---------------------------------------------------------------------------
function InterfaceRow({ iface, deviceId, deviceName, deviceLocation, deviceType }) {
  const [open,    setOpen]    = useState(false);
  const [ip,      setIp]      = useState(iface.address);
  const [mask,    setMask]    = useState(iface.subnetMask);
  const [ipv6,    setIpv6]    = useState(iface.ipv6Addr);
  const [prefix,  setPrefix]  = useState(iface.ipv6Prefix);
  const [applied, setApplied] = useState(false);
  const isLayer3Device = deviceType === "router" || deviceType === "switch";

  const handleApply = () => {
    // 1. Persist into NetworkStore so the data survives modal close
    if (deviceId && appState?.network) {
      const device = appState.network.getDevice(deviceId);
      if (device) {
        // Try the Device.js class method first, fall back to plain object mutation
        const rawIface =
          device._interfaces?.get?.(iface.name) ??
          device._interfaces?.get?.(iface.id)   ??
          (Array.isArray(device.interfaces)
            ? device.interfaces.find(
                i => (i.id ?? i.name) === iface.id || i.name === iface.name
              )
            : null);

        if (rawIface) {
          if (typeof rawIface.configureIPv4 === "function") {
            rawIface.configureIPv4(ip, mask);
          } else {
            rawIface.ipv4 = {
              ...(rawIface.ipv4 ?? {}),
              address:    ip,
              subnetMask: mask,
            };
          }
          
          // Maintain legacy flat fields for compatibility across older UI/state integrations.
          rawIface.ipAddress = ip;
          rawIface.subnetMask = mask;

          // Configure IPv6 for Layer 3 devices (routers/switches)
          const parsedPrefix = Number.parseInt(prefix, 10);
          const hasValidPrefix = Number.isInteger(parsedPrefix) && parsedPrefix >= 1 && parsedPrefix <= 128;
          if (isLayer3Device && (ipv6 || hasValidPrefix)) {
            if (typeof rawIface.configureIPv6 === "function") {
              rawIface.configureIPv6(ipv6, hasValidPrefix ? parsedPrefix : null);
            } else {
              rawIface.ipv6 = {
                ...(rawIface.ipv6 ?? {}),
                address: ipv6,
                prefixLength: hasValidPrefix ? parsedPrefix : null,
              };
            }
            rawIface.ipv6Address = ipv6;
            rawIface.ipv6Prefix = hasValidPrefix ? parsedPrefix : "";
          } else if (isLayer3Device && !ipv6 && !prefix) {
            if (typeof rawIface.clearIPConfig === "function") {
              // Preserve IPv4 while clearing IPv6 on class-based interfaces.
              rawIface.ipv6 = null;
            } else {
              rawIface.ipv6 = null;
            }
            rawIface.ipv6Address = "";
            rawIface.ipv6Prefix = "";
          }
        }

        // Trigger store notification so rest of app stays in sync
        appState.network.updateModified?.();
        appState.network.notify?.();
      }
    }

    // 2. Fire system log events (existing pattern)
    const logs = [];
    if (ip)      logs.push(`[Interface ${iface.name}] IP Address: ${ip}`);
    if (mask)    logs.push(`[Interface ${iface.name}] Subnet Mask: ${mask}`);
    if (isLayer3Device && ipv6) logs.push(`[Interface ${iface.name}] IPv6 Address: ${ipv6}/${prefix}`);
    if (!logs.length) logs.push(`[Interface ${iface.name}] Applied — no parameters configured`);

    logs.forEach((message) =>
      window.dispatchEvent(
        new CustomEvent("add-system-log", {
          detail: {
            device: deviceType === "switch" ? "Switch" : "Router",
            deviceName,
            message,
            location: deviceLocation,
          },
        })
      )
    );

    setApplied(true);
    setTimeout(() => setApplied(false), 2000);
  };

  const isConfigured = ip || mask || (isLayer3Device && (ipv6 || prefix));

  // Status dot colour
  const statusColor =
    iface.isUp === true  ? "#22c55e" :
    iface.isUp === false ? "#ef4444" : "#6b7280";

  return (
    <div className={`iface-row ${open ? "iface-row--open" : ""}`}>

      {/* ── Row header ── */}
      <button className="iface-header" onClick={() => setOpen((v) => !v)}>
        <span className="iface-chevron">
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </span>
        <span className="iface-icon">
          <Network size={14} />
        </span>
        <span
          title={iface.isUp === true ? "Up" : iface.isUp === false ? "Down" : "Status unknown"}
          style={{
            display:      "inline-block",
            width:        8,
            height:       8,
            borderRadius: "50%",
            background:   statusColor,
            marginRight:  6,
            flexShrink:   0,
          }}
        />
        <span className="iface-label">{iface.name}</span>
        {iface.desc && <span className="iface-desc">{iface.desc}</span>}
        {isConfigured && <span className="iface-badge">configured</span>}
      </button>

      {/* ── Expanded config ── */}
      {open && (
        <div className="iface-body">
          <div className="iface-fields" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            {/* IPv4 Configuration - Row 1 */}
            <div className="iface-field">
              <span className="iface-field-label">IP Address</span>
              <input
                className="iface-input"
                placeholder="192.168.1.1"
                value={ip}
                onChange={(e) => setIp(e.target.value)}
              />
            </div>
            <div className="iface-field">
              <span className="iface-field-label">Subnet Mask</span>
              <input
                className="iface-input"
                placeholder="255.255.255.0"
                value={mask}
                onChange={(e) => setMask(e.target.value)}
              />
            </div>
            {/* IPv6 Configuration - Row 2 (Routers / Switches) */}
            {isLayer3Device && (
              <>
                <div className="iface-field">
                  <span className="iface-field-label">IPv6 Address</span>
                  <input
                    className="iface-input"
                    placeholder="2001:db8::1"
                    value={ipv6}
                    onChange={(e) => setIpv6(e.target.value)}
                  />
                </div>
                <div className="iface-field">
                  <span className="iface-field-label">IPv6 Prefix Length</span>
                  <input
                    className="iface-input"
                    type="number"
                    placeholder="64"
                    value={prefix}
                    onChange={(e) => setPrefix(e.target.value)}
                    min="1"
                    max="128"
                  />
                </div>
              </>
            )}
          </div>
          <div className="iface-apply-row">
            <button
              className={`iface-apply-btn ${applied ? "iface-apply-btn--ok" : ""}`}
              onClick={handleApply}
            >
              {applied ? "✓ Applied" : "Apply Interface"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// InterfaceModal
// ---------------------------------------------------------------------------
export default function InterfaceModal({
  onClose,
  deviceName     = "Router",
  deviceLocation = "Network",
  device         = null,          // ← the selectedEntity passed from PropertiesPanel
  deviceType     = "router",      // ← device type (router, switch, etc.)
}) {
  // Derive the canonical interface list from the live device object.
  // Priority:
  //   1. device._interfaces  (Device.js Map — most authoritative)
  //   2. device.interfaces   (plain Array on serialised/store objects)
  //   3. FALLBACK_INTERFACES (sensible defaults when nothing is registered)
  const interfaces = useMemo(() => {
    if (!device) return FALLBACK_INTERFACES.map(normaliseInterface);

    // Device.js class instances expose ._interfaces as a Map
    if (device._interfaces instanceof Map && device._interfaces.size > 0) {
      return [...device._interfaces.values()].map(normaliseInterface).filter(Boolean);
    }

    // Plain array (store objects, serialised JSON)
    if (Array.isArray(device.interfaces) && device.interfaces.length > 0) {
      return device.interfaces.map(normaliseInterface).filter(Boolean);
    }

    // No interfaces found — use fallback defaults
    return FALLBACK_INTERFACES.map(normaliseInterface);
  }, [device]);

  const deviceId = device?.id ?? null;

  return createPortal(
    <div className="config-modal-overlay nat-modal-layer">
      <div className="config-modal-content nat-sidebar-layout">

        {/* ── SIDEBAR ─────────────────────────────────────────────────── */}
        <div className="nat-sidebar">
          <div className="sidebar-header">
            <Layers size={20} />
            <span>Interface Configuration</span>
          </div>

          <div className="nav-list">
            <button className="nav-item active">
              <div className="nav-icon"><Network size={16} /></div>
              <div className="nav-text">
                <strong>Interfaces</strong>
                <p>IP, mask &amp; gateway</p>
              </div>
            </button>
          </div>
        </div>

        {/* ── MAIN ────────────────────────────────────────────────────── */}
        <div className="nat-main-content">
          <div className="modal-header-clean">
            <h3>INTERFACE SETTINGS</h3>
            <button className="close-btn-mono" onClick={onClose}>×</button>
          </div>

          <div className="config-body">
            <div className="iface-list-group">
              <p className="iface-section-label">
                {deviceName} — {interfaces.length} Interface{interfaces.length !== 1 ? "s" : ""}
              </p>
              <p className="iface-hint">
                Select an interface to configure its network parameters.
              </p>

              <div className="iface-list">
                {interfaces.map((iface) => (
                  <InterfaceRow
                    key={iface.id}
                    iface={iface}
                    deviceId={deviceId}
                    deviceName={deviceName}
                    deviceLocation={deviceLocation}
                    deviceType={deviceType}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="modal-footer-clean">
            <button className="btn-secondary" onClick={onClose}>Close</button>
          </div>
        </div>

      </div>
    </div>,
    document.body
  );
}