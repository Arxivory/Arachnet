import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

const TABS = {
  interfaces: "Interfaces",
  switching: "Switching",
  routes: "Static routes",
  ping: "Ping",
};

function getPortMode(device, portId) {
  return device.portModes?.get(portId) ?? { mode: "access", accessVlan: 1 };
}

function splitAddress(address) {
  const [ipv4Address = "", prefixLength = "24"] = address?.split("/") ?? [];
  return { ipv4Address, prefixLength };
}

function subnetMask(prefixValue) {
  const prefix = Number(prefixValue);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return "";
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return [24, 16, 8, 0].map((shift) => (mask >>> shift) & 255).join(".");
}

export default function DeviceConfigurationModal({
  device,
  pingResults = [],
  onClose,
  onApplyInterface,
  onApplySwitch,
  onApplyRoutes,
  onPing,
}) {
  const [activeTab, setActiveTab] = useState("interfaces");
  const [interfaceDrafts, setInterfaceDrafts] = useState({});
  const [vlans, setVlans] = useState([]);
  const [sviAddresses, setSviAddresses] = useState([]);
  const [portModes, setPortModes] = useState([]);
  const [stpPriority, setStpPriority] = useState(32768);
  const [routes, setRoutes] = useState([]);
  const [routeDraft, setRouteDraft] = useState({ destination: "", nextHop: "", interfaceId: "" });
  const [pingDraft, setPingDraft] = useState({ interfaceId: "", destinationIp: "", count: "4", ttl: "64" });
  const [error, setError] = useState("");
  const [results, setResults] = useState([]);

  const tabs = useMemo(() => {
    const available = [];
    if (device.kind !== "switch" && device.interfaces.size) available.push("interfaces");
    if (device.kind === "switch") available.push("switching");
    if (device.kind === "router") available.push("routes");
    if (device.kind !== "switch" && device.interfaces.size) available.push("ping");
    return available;
  }, [device]);

  useEffect(() => {
    setActiveTab(tabs[0] ?? "ping");
    setInterfaceDrafts(Object.fromEntries([...device.interfaces.values()].map((networkInterface) => [
      networkInterface.id,
      {
        ...splitAddress(networkInterface.ipv4Addresses[0] ?? ""),
        secondaryAddresses: networkInterface.ipv4Addresses.slice(1).join("\n"),
        defaultGateway: networkInterface.defaultGateway ?? "",
      },
    ])));
    setVlans([...device.vlans?.values?.() ?? []].map((vlan) => ({ ...vlan })));
    setSviAddresses([...device.vlanInterfaces?.values?.() ?? []].map((networkInterface) => ({
      vlanId: networkInterface.vlanId,
      ...splitAddress(networkInterface.ipv4Addresses[0] ?? ""),
    })));
    setPortModes([...device.ports.values()].map((port) => ({
      portId: port.id,
      ...getPortMode(device, port.id),
    })));
    setStpPriority(device.spanningTree?.priority ?? 32768);
    setRoutes((device.staticRoutes ?? []).map((route) => ({ ...route })));
    setRouteDraft({
      destination: "",
      nextHop: "",
      interfaceId: [...device.interfaces.keys()][0] ?? "",
    });
    setPingDraft((previous) => ({
      ...previous,
      interfaceId: [...device.interfaces.keys()][0] ?? "",
      destinationIp: "",
    }));
    setError("");
    setResults([]);
  }, [device, tabs]);

  function updateInterfaceDraft(interfaceId, field, value) {
    setInterfaceDrafts((current) => ({
      ...current,
      [interfaceId]: { ...current[interfaceId], [field]: value },
    }));
  }

  function applyInterface(networkInterface) {
    try {
      const draft = interfaceDrafts[networkInterface.id];
      const ipv4Addresses = draft.ipv4Address.trim()
        ? [`${draft.ipv4Address.trim()}/${Number(draft.prefixLength)}`]
        : [];
      ipv4Addresses.push(...draft.secondaryAddresses.split(/[\s,]+/).filter(Boolean));
      onApplyInterface?.(device.id, networkInterface.id, {
        ipv4Addresses,
        defaultGateway: draft.defaultGateway,
      });
      setError("");
    } catch (applyError) {
      setError(applyError.message);
    }
  }

  function updatePortMode(portId, field, value) {
    setPortModes((current) => current.map((setting) => {
      if (setting.portId !== portId) return setting;
      if (field === "mode" && value === "trunk") {
        const allowedVlans = setting.allowedVlans ?? vlans.map(({ id }) => id);
        return { portId, mode: value, allowedVlans, nativeVlan: setting.nativeVlan ?? 1 };
      }
      if (field === "mode") return { portId, mode: value, accessVlan: setting.accessVlan ?? 1 };
      if (field === "allowedText") {
        return {
          ...setting,
          allowedVlans: value.split(",").map((id) => Number(id.trim())),
        };
      }
      return { ...setting, [field]: value };
    }));
  }

  function applySwitch() {
    try {
      onApplySwitch?.(device.id, {
        vlans,
        portModes,
        sviAddresses: sviAddresses.map(({ vlanId, ipv4Address, prefixLength }) => ({
          vlanId,
          address: ipv4Address.trim() ? `${ipv4Address.trim()}/${Number(prefixLength)}` : "",
        })),
        stpPriority: Number(stpPriority),
      });
      setError("");
    } catch (applyError) {
      setError(applyError.message);
    }
  }

  function saveRoutes(nextRoutes) {
    try {
      onApplyRoutes?.(device.id, nextRoutes);
      setRoutes(nextRoutes);
      setError("");
      return true;
    } catch (applyError) {
      setError(applyError.message);
      return false;
    }
  }

  function addRoute(event) {
    event.preventDefault();
    const added = saveRoutes([...routes, {
      destination: routeDraft.destination.trim(),
      nextHop: routeDraft.nextHop.trim() || null,
      interfaceId: routeDraft.interfaceId || null,
    }]);
    if (added) setRouteDraft((current) => ({ ...current, destination: "", nextHop: "" }));
  }

  function sendPing(event) {
    event.preventDefault();
    try {
      const sent = onPing?.(device.id, pingDraft.interfaceId, pingDraft.destinationIp.trim(), {
        count: Number(pingDraft.count),
        ttl: Number(pingDraft.ttl),
      });
      setResults(sent ?? []);
      setError("");
    } catch (pingError) {
      setResults([]);
      setError(pingError.message);
    }
  }

  return createPortal(
    <div
      className="device-config-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <section
        className="device-config-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="device-config-title"
      >
        <header className="device-config-header">
          <div>
            <h2 id="device-config-title">Configure device</h2>
            <p>{device.name} · {device.model}</p>
          </div>
          <button type="button" className="device-config-close" aria-label="Close configuration" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <nav className="device-config-tabs" aria-label="Device configuration">
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              className={activeTab === tab ? "is-active" : ""}
              aria-pressed={activeTab === tab}
              onClick={() => {
                setActiveTab(tab);
                setError("");
              }}
            >
              {TABS[tab]}
            </button>
          ))}
        </nav>
        <div className="device-config-body">
          {activeTab === "interfaces" && (
            <div className="device-config-section">
              <p className="device-config-help">
                {device.kind === "router"
                  ? "Configure interface IPv4 addresses. Router next hops and default routes are set in Static routes."
                  : "Configure static IPv4 addresses and the on-link default gateway used by packet forwarding."}
              </p>
              {[...device.interfaces.values()].map((networkInterface) => {
                const draft = interfaceDrafts[networkInterface.id] ?? {
                  ipv4Address: "",
                  prefixLength: "24",
                  secondaryAddresses: "",
                  defaultGateway: "",
                };
                return (
                  <form
                    className="device-config-card"
                    key={networkInterface.id}
                    onSubmit={(event) => {
                      event.preventDefault();
                      applyInterface(networkInterface);
                    }}
                  >
                    <h3>{networkInterface.name}</h3>
                    <span className="device-config-help">
                      {networkInterface.lineStatus} · {networkInterface.macAddress ?? "No MAC address"}
                    </span>
                    <div className="device-config-address-row">
                      <label>
                        IPv4 address
                        <input
                          inputMode="decimal"
                          value={draft.ipv4Address}
                          placeholder="192.168.10.10"
                          onChange={(event) => updateInterfaceDraft(networkInterface.id, "ipv4Address", event.target.value)}
                        />
                      </label>
                      <label>
                        Prefix length
                        <input
                          type="number"
                          min="1"
                          max="32"
                          value={draft.prefixLength}
                          onChange={(event) => updateInterfaceDraft(networkInterface.id, "prefixLength", event.target.value)}
                        />
                      </label>
                      <label>
                        Subnet mask
                        <input value={subnetMask(draft.prefixLength)} readOnly aria-label={`${networkInterface.name} subnet mask`} />
                      </label>
                    </div>
                    <label>
                      Secondary IPv4 addresses (CIDR, optional)
                      <textarea
                        rows={2}
                        value={draft.secondaryAddresses}
                        placeholder={"192.168.11.10/24"}
                        onChange={(event) => updateInterfaceDraft(networkInterface.id, "secondaryAddresses", event.target.value)}
                      />
                    </label>
                    {device.kind !== "router" && (
                      <label>
                        Default gateway
                        <input
                          value={draft.defaultGateway}
                          placeholder="192.168.10.1"
                          onChange={(event) => updateInterfaceDraft(networkInterface.id, "defaultGateway", event.target.value)}
                        />
                      </label>
                    )}
                    <button type="submit" className="device-config-primary">Apply interface</button>
                  </form>
                );
              })}
            </div>
          )}

          {activeTab === "switching" && (
            <div className="device-config-section">
              <p className="device-config-help">VLAN membership and port mode are enforced by the 802.1Q forwarding engine. STP priority is used during BPDU root elections.</p>
              <div className="device-config-card">
                <h3>VLAN database</h3>
                {vlans.map((vlan, index) => (
                  <div className="device-config-vlan-block" key={`${vlan.id}-${index}`}>
                    <div className="device-config-vlan-row">
                      <label>
                        VLAN ID
                        <input
                          type="number"
                          min="1"
                          max="4094"
                          value={vlan.id}
                          onChange={(event) => {
                            const nextId = Number(event.target.value);
                            setVlans((current) => current.map((item, itemIndex) =>
                              itemIndex === index ? { ...item, id: nextId } : item
                            ));
                            setSviAddresses((current) => current.map((item) =>
                              item.vlanId === vlan.id ? { ...item, vlanId: nextId } : item
                            ));
                          }}
                        />
                      </label>
                      <label>
                        Name
                        <input
                          value={vlan.name}
                          onChange={(event) => setVlans((current) => current.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, name: event.target.value } : item
                          ))}
                        />
                      </label>
                      <button
                        type="button"
                        aria-label={`Remove VLAN ${vlan.id}`}
                        disabled={vlan.id === 1}
                        onClick={() => {
                          setVlans((current) => current.filter((_, itemIndex) => itemIndex !== index));
                          setSviAddresses((current) => current.filter((item) => item.vlanId !== vlan.id));
                        }}
                      >
                        Remove
                      </button>
                    </div>
                    <div className="device-config-address-row">
                      <label>
                        SVI IPv4 address
                        <input
                          inputMode="decimal"
                          value={sviAddresses.find((item) => item.vlanId === vlan.id)?.ipv4Address ?? ""}
                          placeholder="192.168.10.1"
                          onChange={(event) => setSviAddresses((current) => current.map((item) =>
                            item.vlanId === vlan.id ? { ...item, ipv4Address: event.target.value } : item
                          ))}
                        />
                      </label>
                      <label>
                        Prefix length
                        <input
                          type="number"
                          min="1"
                          max="32"
                          value={sviAddresses.find((item) => item.vlanId === vlan.id)?.prefixLength ?? "24"}
                          onChange={(event) => setSviAddresses((current) => current.map((item) =>
                            item.vlanId === vlan.id ? { ...item, prefixLength: event.target.value } : item
                          ))}
                        />
                      </label>
                      <label>
                        Subnet mask
                        <input
                          value={subnetMask(sviAddresses.find((item) => item.vlanId === vlan.id)?.prefixLength ?? 24)}
                          readOnly
                          aria-label={`VLAN ${vlan.id} subnet mask`}
                        />
                      </label>
                    </div>
                  </div>
                ))}
                <button type="button" onClick={() => {
                  const usedIds = new Set(vlans.map(({ id }) => id));
                  let id = 2;
                  while (usedIds.has(id) && id <= 4094) id += 1;
                  if (id <= 4094) {
                    setVlans((current) => [...current, { id, name: `VLAN ${id}` }]);
                    setSviAddresses((current) => [...current, { vlanId: id, ipv4Address: "", prefixLength: "24" }]);
                  }
                }}>
                  Add VLAN
                </button>
              </div>
              <div className="device-config-card">
                <h3>Port configuration</h3>
                {portModes.map((setting) => {
                  const port = device.ports.get(setting.portId);
                  return (
                    <div className="device-config-port-row" key={setting.portId}>
                      <strong>{port.name}</strong>
                      <select
                        aria-label={`${port.name} mode`}
                        value={setting.mode}
                        onChange={(event) => updatePortMode(setting.portId, "mode", event.target.value)}
                      >
                        <option value="access">Access</option>
                        <option value="trunk">Trunk</option>
                      </select>
                      {setting.mode === "access" ? (
                        <select
                          aria-label={`${port.name} access VLAN`}
                          value={setting.accessVlan ?? 1}
                          onChange={(event) => updatePortMode(setting.portId, "accessVlan", Number(event.target.value))}
                        >
                          {vlans.map(({ id, name }) => <option key={id} value={id}>{id} · {name}</option>)}
                        </select>
                      ) : (
                        <>
                          <input
                            aria-label={`${port.name} allowed VLANs`}
                            value={(setting.allowedVlans ?? []).join(",")}
                            placeholder="Allowed VLANs"
                            onChange={(event) => updatePortMode(setting.portId, "allowedText", event.target.value)}
                          />
                          <select
                            aria-label={`${port.name} native VLAN`}
                            value={setting.nativeVlan ?? 1}
                            onChange={(event) => updatePortMode(setting.portId, "nativeVlan", Number(event.target.value))}
                          >
                            {vlans.map(({ id, name }) => <option key={id} value={id}>{id} · {name}</option>)}
                          </select>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="device-config-card">
                <label>
                  STP bridge priority
                  <select value={stpPriority} onChange={(event) => setStpPriority(Number(event.target.value))}>
                    {Array.from({ length: 16 }, (_, index) => index * 4096)
                      .map((priority) => <option key={priority} value={priority}>{priority}</option>)}
                  </select>
                </label>
                <button type="button" className="device-config-primary" onClick={applySwitch}>Apply switch settings</button>
              </div>
            </div>
          )}

          {activeTab === "routes" && (
            <div className="device-config-section">
              <p className="device-config-help">Static routes are installed in the router RIB/FIB and used by the forwarding pipeline.</p>
              <form className="device-config-card" onSubmit={addRoute}>
                <h3>Add static route</h3>
                <label>
                  Destination prefix
                  <input
                    required
                    value={routeDraft.destination}
                    placeholder="192.0.2.0/24"
                    onChange={(event) => setRouteDraft((current) => ({ ...current, destination: event.target.value }))}
                  />
                </label>
                <label>
                  Next hop (otherwise must be directly connected)
                  <input
                    value={routeDraft.nextHop}
                    placeholder="10.0.0.2"
                    onChange={(event) => setRouteDraft((current) => ({ ...current, nextHop: event.target.value }))}
                  />
                </label>
                <label>
                  Egress interface
                  <select
                    value={routeDraft.interfaceId}
                    onChange={(event) => setRouteDraft((current) => ({ ...current, interfaceId: event.target.value }))}
                  >
                    <option value="">Not specified</option>
                    {[...device.interfaces.values()].map((networkInterface) => (
                      <option key={networkInterface.id} value={networkInterface.id}>{networkInterface.name}</option>
                    ))}
                  </select>
                </label>
                <button type="submit" className="device-config-primary">Install route</button>
              </form>
              <ul className="device-config-route-list">
                {routes.map((route, index) => (
                  <li key={`${route.destination}-${index}`}>
                    <span>{route.destination} → {route.nextHop ?? "connected"}{route.interfaceId ? ` · ${device.interfaces.get(route.interfaceId)?.name ?? route.interfaceId}` : ""}</span>
                    <button
                      type="button"
                      onClick={() => saveRoutes(routes.filter((_, routeIndex) => routeIndex !== index))}
                    >
                      Remove
                    </button>
                  </li>
                ))}
                {!routes.length && <li>No static routes configured.</li>}
              </ul>
            </div>
          )}

          {activeTab === "ping" && (
            <div className="device-config-section">
              <p className="device-config-help">ICMP probes traverse configured links, VLANs, interfaces, gateways, and router routes. No response is reported as a timeout.</p>
              <form className="device-config-card" onSubmit={sendPing}>
                <h3>ICMP echo</h3>
                <label>
                  Source interface
                  <select
                    value={pingDraft.interfaceId}
                    onChange={(event) => setPingDraft((current) => ({ ...current, interfaceId: event.target.value }))}
                  >
                    {[...device.interfaces.values()].map((networkInterface) => (
                      <option key={networkInterface.id} value={networkInterface.id}>{networkInterface.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Destination IPv4
                  <input
                    required
                    value={pingDraft.destinationIp}
                    placeholder="192.168.10.20"
                    onChange={(event) => setPingDraft((current) => ({ ...current, destinationIp: event.target.value }))}
                  />
                </label>
                <div className="device-config-inline-fields">
                  <label>
                    Count
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={pingDraft.count}
                      onChange={(event) => setPingDraft((current) => ({ ...current, count: event.target.value }))}
                    />
                  </label>
                  <label>
                    TTL
                    <input
                      type="number"
                      min="1"
                      max="255"
                      value={pingDraft.ttl}
                      onChange={(event) => setPingDraft((current) => ({ ...current, ttl: event.target.value }))}
                    />
                  </label>
                </div>
                <button type="submit" className="device-config-primary">Send ping</button>
              </form>
              <div className="device-config-results" aria-live="polite">
                {results.map((result) => (
                  <p key={result.sequence} className={`ping-result ping-${result.status}`}>
                    {result.status === "reply"
                      ? `Reply from ${result.responderIp}: seq=${result.sequence} time=${result.roundTripTimeMs.toFixed(3)} ms`
                      : result.status === "timeout"
                        ? `Request timed out: seq=${result.sequence} (${result.reason})`
                        : result.status === "time-exceeded"
                          ? `Time exceeded from ${result.responderIp}: seq=${result.sequence}`
                          : `Destination unreachable from ${result.responderIp ?? "source"}: seq=${result.sequence} (${result.reason ?? `ICMP code ${result.code}`})`}
                  </p>
                ))}
                {!results.length && pingResults.slice(0, 4).map((result) => (
                  <p key={`history-${result.sequence}`} className={`ping-result ping-${result.status}`}>
                    {result.status}: {result.sourceIp ?? "?"} → {result.destinationIp} · seq {result.sequence}
                  </p>
                ))}
              </div>
            </div>
          )}
          {error && <p className="device-config-error" role="alert">{error}</p>}
        </div>
      </section>
    </div>,
    document.body
  );
}
