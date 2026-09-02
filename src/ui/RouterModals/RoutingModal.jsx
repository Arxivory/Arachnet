import { useState } from "react";
import { createPortal } from "react-dom";
import { Network, Activity, ArrowLeftRight, Map, Server, Trash2 } from "lucide-react";

// Helper function to convert prefix length to subnet mask
const _prefixLengthToMask = (prefixLen) => {
  if (prefixLen <= 0) return "255.255.255.255";
  if (prefixLen >= 32) return "0.0.0.0";
  
  const bits = (0xffffffff << (32 - prefixLen)) >>> 0;
  return [
    (bits >>> 24) & 0xff,
    (bits >>> 16) & 0xff,
    (bits >>> 8) & 0xff,
    bits & 0xff
  ].join('.');
};

export default function RoutingModal({ onClose, deviceName = "Router", deviceLocation = "Network", device = null }) {
  const [activeRoutingTab, setActiveRoutingTab] = useState("ospf");

  // ── Global ─────────────────────────────────────────────────────────────────
  const [routerId,     setRouterId]     = useState("");
  const [defaultRoute, setDefaultRoute] = useState("");

  // ── OSPF ───────────────────────────────────────────────────────────────────
  const [ospfProcessId,  setOspfProcessId]  = useState("");
  const [ospfAreaType,   setOspfAreaType]   = useState("");
  const [ospfNetworks,   setOspfNetworks]   = useState("");
  const [ospfHello,      setOspfHello]      = useState("");
  const [ospfDead,       setOspfDead]       = useState("");
  const [ospfAuthEnable, setOspfAuthEnable] = useState(false);

  // ── BGP ────────────────────────────────────────────────────────────────────
  const [bgpLocalAS,    setBgpLocalAS]    = useState("");
  const [bgpKeepalive,  setBgpKeepalive]  = useState("");
  const [bgpNeighborIP, setBgpNeighborIP] = useState("");
  const [bgpRemoteAS,   setBgpRemoteAS]   = useState("");
  const [bgpNetworks,   setBgpNetworks]   = useState("");
  const [bgpReflector,  setBgpReflector]  = useState(false);

  // ── Static Route ───────────────────────────────────────────────────────────
  const [staticDest,     setStaticDest]     = useState("");
  const [staticNextHop,  setStaticNextHop]  = useState("");
  const [staticMetric,   setStaticMetric]   = useState("");
  const [staticIface,    setStaticIface]    = useState("G0/0");
  const [staticFloating, setStaticFloating] = useState(false);
  const [staticRoutes,   setStaticRoutes]   = useState([]);

  // ── Route Control ──────────────────────────────────────────────────────────
  const [ctrlRedist,    setCtrlRedist]    = useState("None");
  const [ctrlFilter,    setCtrlFilter]    = useState("");
  const [ctrlMaxRoutes, setCtrlMaxRoutes] = useState("");
  const [ctrlLogging,   setCtrlLogging]   = useState(false);

   const handleAddStaticRoute = () => {
    if (!staticDest || !staticNextHop) return;

    // Add to UI state
    setStaticRoutes((currentRoutes) => [
      ...currentRoutes,
      {
        id: `static-${Date.now()}`,
        destination: staticDest,
        nextHop: staticNextHop,
        metric: staticMetric || "-",
        interface: staticIface,
        floating: staticFloating ? "Yes" : "No",
      },
    ]);

    // Add to routing table immediately
    if (device && device.routingTable) {
      const [destNet, prefixLen] = staticDest.includes('/') 
        ? staticDest.split('/') 
        : [staticDest, '24'];
      
      const subnetMask = _prefixLengthToMask(parseInt(prefixLen) || 24);

      device.routingTable.addRoute({
        destination: destNet,
        mask: subnetMask,
        nextHop: staticNextHop,
        egressInterface: staticIface,
        metric: parseInt(staticMetric) || 1,
        protocol: 'static',
        active: true,
      });
    }

    const staticSummary = `[Static] ${staticDest} -> ${staticNextHop}`;
    window.dispatchEvent(
      new CustomEvent("add-system-log", {
        detail: {
          device: "Router",
          deviceName,
          message: staticSummary,
          location: deviceLocation,
        },
      })
    );
  };

  const handleDeleteStaticRoute = (routeId) => {
    // Find the route to get destination and mask for deletion
    setStaticRoutes((currentRoutes) => {
      const routeToDelete = currentRoutes.find((route) => route.id === routeId);
      
      if (routeToDelete && device && device.routingTable) {
        const [destNet, prefixLen] = routeToDelete.destination.includes('/') 
          ? routeToDelete.destination.split('/') 
          : [routeToDelete.destination, '24'];
        
        const subnetMask = _prefixLengthToMask(parseInt(prefixLen) || 24);

        // Remove from routing table
        device.routingTable.removeRoute(destNet, subnetMask, routeToDelete.nextHop);
      }

      return currentRoutes.filter((route) => route.id !== routeId);
    });
  };

  // ── Apply: collect only what was configured and dispatch to ConsolePanel ───
  const handleApply = () => {
  const logs = [];

  // Global
  if (routerId)     logs.push(`[Global] Router ID: ${routerId}`);
  if (defaultRoute) logs.push(`[Global] Default Route: ${defaultRoute}`);

  // OSPF
  if (ospfProcessId)  logs.push(`[OSPF] Process ID: ${ospfProcessId}`);
  if (ospfAreaType)   logs.push(`[OSPF] Area: ${ospfAreaType}`);
  if (ospfNetworks)   logs.push(`[OSPF] Networks: ${ospfNetworks}`);
  if (ospfHello)      logs.push(`[OSPF] Hello Timer: ${ospfHello}`);
  if (ospfDead)       logs.push(`[OSPF] Dead Timer: ${ospfDead}`);
  if (ospfAuthEnable) logs.push(`[OSPF] Authentication: Enabled`);

  // BGP
  if (bgpLocalAS)    logs.push(`[BGP] Local AS: ${bgpLocalAS}`);
  if (bgpKeepalive)  logs.push(`[BGP] Keepalive: ${bgpKeepalive}`);
  if (bgpNeighborIP) logs.push(`[BGP] Neighbor IP: ${bgpNeighborIP}`);
  if (bgpRemoteAS)   logs.push(`[BGP] Remote AS: ${bgpRemoteAS}`);
  if (bgpNetworks)   logs.push(`[BGP] Advertised Networks: ${bgpNetworks}`);
  if (bgpReflector)  logs.push(`[BGP] Route Reflector: Enabled`);

  // Static Routes - Already added to routing table when "Add Static Route" was clicked
  staticRoutes.forEach((route) => {
    logs.push(`[Static] ${route.destination} -> ${route.nextHop} (metric: ${route.metric}, interface: ${route.interface})`);
  });

  // Route Control
  if (ctrlRedist !== "None") logs.push(`[Route Control] Redistribution: ${ctrlRedist}`);
  if (ctrlFilter)            logs.push(`[Route Control] Filter: ${ctrlFilter}`);
  if (ctrlMaxRoutes)         logs.push(`[Route Control] Max Routes: ${ctrlMaxRoutes}`);
  if (ctrlLogging)           logs.push(`[Route Control] Logging: Enabled`);

  if (logs.length === 0) logs.push(`[Routing] Applied — no parameters configured`);

  // One event per line → one row per log in ConsolePanel
  logs.forEach((message) => {
    window.dispatchEvent(
      new CustomEvent("add-system-log", {
        detail: {
          device:     "Router",
          deviceName: deviceName,
          message,
          location:   deviceLocation,
        },
      })
    );
  });

  onClose();
};

  return createPortal(
    <div className="config-modal-overlay nat-modal-layer">
      <div className="config-modal-content nat-sidebar-layout">

        {/* ── SIDEBAR ─────────────────────────────────────────────────────── */}
        <div className="nat-sidebar">
          <div className="sidebar-header">
            <Network size={20} />
            <span>Routing Protocol Configuration</span>
          </div>

          <div className="nav-list">

            <button
              className={`nav-item ${activeRoutingTab === "ospf" ? "active" : ""}`}
              onClick={() => setActiveRoutingTab("ospf")}
            >
              <div className="nav-icon"><Activity size={16} /></div>
              <div className="nav-text"><strong>OSPF</strong><p>Dynamic internal routing</p></div>
            </button>

            <button
              className={`nav-item ${activeRoutingTab === "bgp" ? "active" : ""}`}
              onClick={() => setActiveRoutingTab("bgp")}
            >
              <div className="nav-icon"><ArrowLeftRight size={16} /></div>
              <div className="nav-text"><strong>BGP</strong><p>External / ISP routing</p></div>
            </button>

            <button
              className={`nav-item ${activeRoutingTab === "static" ? "active" : ""}`}
              onClick={() => setActiveRoutingTab("static")}
            >
              <div className="nav-icon"><Map size={16} /></div>
              <div className="nav-text"><strong>Static Routes</strong><p>Manual control</p></div>
            </button>

            <button
              className={`nav-item ${activeRoutingTab === "control" ? "active" : ""}`}
              onClick={() => setActiveRoutingTab("control")}
            >
              <div className="nav-icon"><Server size={16} /></div>
              <div className="nav-text"><strong>Route Control</strong><p>Filters & redistribution</p></div>
            </button>

          </div>
        </div>

        {/* ── MAIN ────────────────────────────────────────────────────────── */}
        <div className="nat-main-content">
          <div className="modal-header-clean">
            <h3>{activeRoutingTab.toUpperCase()} SETTINGS</h3>
            <button className="close-btn-mono" onClick={onClose}>×</button>
          </div>

          <div className="config-body">
            
            <div className="config-group-mono">
              {/* <label>Global Routing Settings</label> */}
              <div className="inline-fields">
                <div className="input-wrap">
                  {/* <span>Router ID</span> */}
                </div>
                <div className="input-wrap">
                  {/* <span>Default Route</span> */}
                  
                </div>
              </div>
            </div>

            {/* DYNAMIC CONTENT */}
            <div className="config-group-mono highlight-area">

              {/* ── OSPF ── */}
              {activeRoutingTab === "ospf" && (
                <>
                  <label>OSPF Configuration</label>

                  <div className="inline-fields">
                    <div className="input-wrap">
                      <span>Process ID</span>
                      <input
                        placeholder="1"
                        value={ospfProcessId}
                        onChange={(e) => setOspfProcessId(e.target.value)}
                      />
                    </div>
                    <div className="input-wrap">
                      <span>Area Type</span>
                      <select
                        value={ospfAreaType}
                        onChange={(e) => setOspfAreaType(e.target.value)}
                      >
                        <option value="">Select</option>
                        <option>Backbone (Area 0)</option>
                        <option>Stub Area</option>
                        <option>NSSA</option>
                      </select>
                    </div>
                  </div>

                  <div className="input-wrap">
                    <span>Networks (CIDR)</span>
                    <input
                      placeholder="192.168.1.0/24, 10.0.0.0/8"
                      value={ospfNetworks}
                      onChange={(e) => setOspfNetworks(e.target.value)}
                    />
                  </div>

                  <div className="inline-fields">
                    <div className="input-wrap">
                      <span>Hello Timer</span>
                      <input
                        placeholder="10s"
                        value={ospfHello}
                        onChange={(e) => setOspfHello(e.target.value)}
                      />
                    </div>
                    <div className="input-wrap">
                      <span>Dead Timer</span>
                      <input
                        placeholder="40s"
                        value={ospfDead}
                        onChange={(e) => setOspfDead(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="checkbox-wrap">
                    <input
                      type="checkbox"
                      checked={ospfAuthEnable}
                      onChange={(e) => setOspfAuthEnable(e.target.checked)}
                    />
                    <span>Enable OSPF Authentication</span>
                  </div>
                </>
              )}

              {/* ── BGP ── */}
              {activeRoutingTab === "bgp" && (
                <>
                  <label>BGP Configuration</label>

                  <div className="inline-fields">
                    <div className="input-wrap">
                      <span>Local AS</span>
                      <input
                        placeholder="65001"
                        value={bgpLocalAS}
                        onChange={(e) => setBgpLocalAS(e.target.value)}
                      />
                    </div>
                    <div className="input-wrap">
                      <span>Keepalive Timer</span>
                      <input
                        placeholder="60s"
                        value={bgpKeepalive}
                        onChange={(e) => setBgpKeepalive(e.target.value)}
                      />
                    </div>
                  </div>

                  <label>Neighbors</label>

                  <div className="inline-fields">
                    <div className="input-wrap">
                      <span>Neighbor IP</span>
                      <input
                        placeholder="203.0.113.1"
                        value={bgpNeighborIP}
                        onChange={(e) => setBgpNeighborIP(e.target.value)}
                      />
                    </div>
                    <div className="input-wrap">
                      <span>Remote AS</span>
                      <input
                        placeholder="65002"
                        value={bgpRemoteAS}
                        onChange={(e) => setBgpRemoteAS(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="input-wrap">
                    <span>Advertised Networks</span>
                    <input
                      placeholder="10.0.0.0/8"
                      value={bgpNetworks}
                      onChange={(e) => setBgpNetworks(e.target.value)}
                    />
                  </div>

                  <div className="checkbox-wrap">
                    <input
                      type="checkbox"
                      checked={bgpReflector}
                      onChange={(e) => setBgpReflector(e.target.checked)}
                    />
                    <span>Enable Route Reflector</span>
                  </div>
                </>
              )}

              {/* ── STATIC ── */}
              {activeRoutingTab === "static" && (
                <>
                  <label>Static Route</label>

                  <div className="inline-fields">
                    <div className="input-wrap">
                      <span>Destination</span>
                      <input
                        placeholder="10.0.0.0/8"
                        value={staticDest}
                        onChange={(e) => setStaticDest(e.target.value)}
                      />
                    </div>
                    <div className="input-wrap">
                      <span>Next Hop</span>
                      <input
                        placeholder="192.168.1.1"
                        value={staticNextHop}
                        onChange={(e) => setStaticNextHop(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="inline-fields">
                    <div className="input-wrap">
                      <span>Metric</span>
                      <input
                        placeholder="1"
                        value={staticMetric}
                        onChange={(e) => setStaticMetric(e.target.value)}
                      />
                    </div>
                    <div className="input-wrap">
                      <span>Interface</span>
                      <select
                        value={staticIface}
                        onChange={(e) => setStaticIface(e.target.value)}
                      >
                        <option>G0/0</option>
                        <option>G0/1</option>
                      </select>
                    </div>
                  </div>

                  <div className="checkbox-wrap">
                    <input
                      type="checkbox"
                      checked={staticFloating}
                      onChange={(e) => setStaticFloating(e.target.checked)}
                    />
                    <span>Floating Route (backup)</span>
                  </div> 
                  <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "12px" }}>
                    <button
                      className="btn-primary"
                      onClick={handleAddStaticRoute}
                      disabled={!staticDest || !staticNextHop}
                    >
                      Add Static Route
                    </button>
                  </div>

                  {staticRoutes.length > 0 && (
                    <div style={{ marginTop: '18px' }}>
                      <label>Configured Static Routes</label>
                      <div style={{ overflowX: 'auto', marginTop: '10px' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                          <thead>
                            <tr>
                              <th style={{ textAlign: 'left', padding: '10px', borderBottom: '1px solid #e5e7eb' }}>Destination</th>
                              <th style={{ textAlign: 'left', padding: '10px', borderBottom: '1px solid #e5e7eb' }}>Next Hop</th>
                              <th style={{ textAlign: 'left', padding: '10px', borderBottom: '1px solid #e5e7eb' }}>Metric</th>
                              <th style={{ textAlign: 'left', padding: '10px', borderBottom: '1px solid #e5e7eb' }}>Interface</th>
                              <th style={{ textAlign: 'left', padding: '10px', borderBottom: '1px solid #e5e7eb' }}>Floating</th>
                              <th style={{ textAlign: 'center', padding: '10px', borderBottom: '1px solid #e5e7eb' }}>Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {staticRoutes.map((route) => (
                              <tr key={route.id}>
                                <td style={{ padding: '10px', borderBottom: '1px solid #f1f5f9' }}>{route.destination}</td>
                                <td style={{ padding: '10px', borderBottom: '1px solid #f1f5f9' }}>{route.nextHop}</td>
                                <td style={{ padding: '10px', borderBottom: '1px solid #f1f5f9' }}>{route.metric}</td>
                                <td style={{ padding: '10px', borderBottom: '1px solid #f1f5f9' }}>{route.interface}</td>
                                <td style={{ padding: '10px', borderBottom: '1px solid #f1f5f9' }}>{route.floating}</td>
                                <td style={{ padding: '10px', borderBottom: '1px solid #f1f5f9', textAlign: 'center' }}>
                                  <button
                                    onClick={() => handleDeleteStaticRoute(route.id)}
                                    style={{
                                      background: 'transparent',
                                      border: 'none',
                                      cursor: 'pointer',
                                      color: '#ef4444',
                                      padding: '4px',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                    }}
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* ── ROUTE CONTROL ── */}
              {activeRoutingTab === "control" && (
                <>
                  <label>Route Control & Policies</label>

                  <div className="input-wrap">
                    <span>Route Redistribution</span>
                    <select
                      value={ctrlRedist}
                      onChange={(e) => setCtrlRedist(e.target.value)}
                    >
                      <option>None</option>
                      <option>OSPF → BGP</option>
                      <option>BGP → OSPF</option>
                    </select>
                  </div>

                  <div className="input-wrap">
                    <span>Route Filtering (ACL)</span>
                    <input
                      placeholder="Permit 192.168.0.0/16"
                      value={ctrlFilter}
                      onChange={(e) => setCtrlFilter(e.target.value)}
                    />
                  </div>

                  <div className="input-wrap">
                    <span>Max Routes</span>
                    <input
                      placeholder="1000"
                      value={ctrlMaxRoutes}
                      onChange={(e) => setCtrlMaxRoutes(e.target.value)}
                    />
                  </div>

                  <div className="checkbox-wrap">
                    <input
                      type="checkbox"
                      checked={ctrlLogging}
                      onChange={(e) => setCtrlLogging(e.target.checked)}
                    />
                    <span>Enable Route Logging</span>
                  </div>
                </>
              )}

            </div>
          </div>

          <div className="modal-footer-clean">
            <button className="btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn-primary" onClick={handleApply}>Apply Routing</button>
          </div>
        </div>

      </div>
    </div>,
    document.body
  );
}