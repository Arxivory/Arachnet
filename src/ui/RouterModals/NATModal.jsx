import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import { ArrowLeftRight, Activity, Server, Network } from "lucide-react";

// Global persistent state so inputs survive close/reopen (requirement #3)
let persistentNATState = null;

function dispatchLog(deviceName, deviceLocation, message) {
  window.dispatchEvent(
    new CustomEvent("add-system-log", {
      detail: { device: "Router", deviceName, message, location: deviceLocation, italic: true },
    })
  );
}

export default function NATModal({ onClose, deviceName = "Router-Core-01", deviceLocation = "Data Center" }) {
  const defaultState = {
    activeNatType: "pat",
    insideIface:       "G0/0 (LAN)",
    outsideIface:      "G0/1 (WAN)",
    aclId:             "",
    srcNetwork:        "",
    wildcardMask:      "",
    patMode:           "Use Interface IP",
    patOverload:       true,
    staticPrivateIP:   "",
    staticPublicIP:    "",
    staticPrivatePort: "",
    staticPublicPort:  "",
    poolName:          "",
    poolStartIP:       "",
    poolEndIP:         "",
    poolNetmask:       "",
    poolBindACL:       "",
  };

  // Load from persistent store or defaults (requirement #3)
  const [state, setState] = useState(persistentNATState || defaultState);

  // Track previous values so we can detect changes (requirement #6)
  const prevState = useRef(persistentNATState || defaultState);

  const set = (field, value) => setState((s) => ({ ...s, [field]: value }));

  const now = () => {
    const d = new Date();
    return d.toISOString().replace("T", " ").slice(0, 19);
  };

  const handleApply = () => {
    const logs = [];

    // Interface Assignment
    if (state.insideIface)   logs.push(`[NAT] Inside Interface: ${state.insideIface}`);
    if (state.outsideIface)  logs.push(`[NAT] Outside Interface: ${state.outsideIface}`);

    // ACL
    if (state.aclId)        logs.push(`[NAT] ACL ID: ${state.aclId}`);
    if (state.srcNetwork)   logs.push(`[NAT] Source Network: ${state.srcNetwork}`);
    if (state.wildcardMask) logs.push(`[NAT] Wildcard Mask: ${state.wildcardMask}`);

    // PAT
    if (state.activeNatType === "pat") {
      if (state.patMode)    logs.push(`[PAT] Translation Mode: ${state.patMode}`);
      if (state.patOverload) logs.push(`[PAT] Overload (Port Translation): Enabled`);
    }

    // Static NAT
    if (state.activeNatType === "static") {
      if (state.staticPrivateIP)   logs.push(`[Static NAT] Private IP: ${state.staticPrivateIP}`);
      if (state.staticPublicIP)    logs.push(`[Static NAT] Public IP: ${state.staticPublicIP}`);
      if (state.staticPrivatePort) logs.push(`[Static NAT] Private Port: ${state.staticPrivatePort}`);
      if (state.staticPublicPort)  logs.push(`[Static NAT] Public Port: ${state.staticPublicPort}`);
    }

    // Dynamic NAT
    if (state.activeNatType === "dynamic") {
      if (state.poolName)    logs.push(`[Dynamic NAT] Pool Name: ${state.poolName}`);
      if (state.poolStartIP) logs.push(`[Dynamic NAT] Pool Start IP: ${state.poolStartIP}`);
      if (state.poolEndIP)   logs.push(`[Dynamic NAT] Pool End IP: ${state.poolEndIP}`);
      if (state.poolNetmask) logs.push(`[Dynamic NAT] Pool Netmask: ${state.poolNetmask}`);
      if (state.poolBindACL) logs.push(`[Dynamic NAT] Bind ACL ID: ${state.poolBindACL}`);
    }

    if (logs.length === 0) logs.push(`[NAT] Applied — no parameters configured`);

    logs.forEach((message) => dispatchLog(deviceName, deviceLocation, message));
    onClose();
  };

  return createPortal(
    <div className="config-modal-overlay nat-modal-layer">
      <div className="config-modal-content nat-sidebar-layout">

        {/* SIDEBAR */}
        <div className="nat-sidebar">
          <div className="sidebar-header">
            <ArrowLeftRight size={20} />
            <span>NAT Configuration</span>
          </div>

          <div className="nav-list">
            <button className={`nav-item ${state.activeNatType === "pat" ? "active" : ""}`} onClick={() => set("activeNatType", "pat")}>
              <div className="nav-icon"><Activity size={16} /></div>
              <div className="nav-text"><strong>PAT (Overload)</strong><p>Many-to-One</p></div>
            </button>
            <button className={`nav-item ${state.activeNatType === "static" ? "active" : ""}`} onClick={() => set("activeNatType", "static")}>
              <div className="nav-icon"><Server size={16} /></div>
              <div className="nav-text"><strong>Static NAT</strong><p>One-to-One / Port</p></div>
            </button>
            <button className={`nav-item ${state.activeNatType === "dynamic" ? "active" : ""}`} onClick={() => set("activeNatType", "dynamic")}>
              <div className="nav-icon"><Network size={16} /></div>
              <div className="nav-text"><strong>Dynamic NAT</strong><p>Pool Mapping</p></div>
            </button>
          </div>
        </div>

        {/* MAIN */}
        <div className="nat-main-content">
          <div className="modal-header-clean">
            <h3>{state.activeNatType.toUpperCase()} Settings</h3>
            <button className="close-btn-mono" onClick={onClose}>×</button>
          </div>

          <div className="config-body">

            {/* INTERFACES */}
            <div className="config-group-mono">
              <label>Interface Assignment</label>
              <div className="inline-fields">
                <div className="input-wrap">
                  <span>Inside</span>
                  <select value={state.insideIface} onChange={(e) => set("insideIface", e.target.value)}>
                    <option>Select</option>
                    <option>G0/0 (LAN)</option>
                    <option>G0/1 (WAN)</option>
                    <option>Loopback0</option>
                  </select>
                </div>
                <div className="input-wrap">
                  <span>Outside</span>
                  <select value={state.outsideIface} onChange={(e) => set("outsideIface", e.target.value)}>
                    <option>Select</option>
                    <option>G0/1 (WAN)</option>
                    <option>G0/0 (LAN)</option>
                    <option>Serial0/0</option>
                  </select>
                </div>
              </div>
            </div>

            {/* ACL */}
            <div className="config-group-mono">
              <label>Access Control List (ACL)</label>
              <div className="inline-fields">
                <div className="input-wrap">
                  <span>ACL ID</span>
                  <input type="text" placeholder="e.g. 1" value={state.aclId} onChange={(e) => set("aclId", e.target.value)} />
                </div>
                <div className="input-wrap">
                  <span>Source Network</span>
                  <input type="text" placeholder="e.g. 192.168.1.0" value={state.srcNetwork} onChange={(e) => set("srcNetwork", e.target.value)} />
                </div>
                <div className="input-wrap">
                  <span>Wildcard Mask</span>
                  <input type="text" placeholder="e.g. 0.0.0.255" value={state.wildcardMask} onChange={(e) => set("wildcardMask", e.target.value)} />
                </div>
              </div>
            </div>

            {/* DYNAMIC CONTENT */}
            <div className="config-group-mono highlight-area">

              {state.activeNatType === "pat" && (
                <>
                  <label>PAT Configuration</label>
                  <div className="input-wrap">
                    <span>Translation Mode</span>
                    <select value={state.patMode} onChange={(e) => set("patMode", e.target.value)}>
                      <option>Select</option>
                      <option>Use Interface IP</option>
                      <option>Use NAT Pool</option>
                    </select>
                  </div>
                  <div className="checkbox-wrap">
                    <input type="checkbox" checked={state.patOverload} onChange={(e) => set("patOverload", e.target.checked)} />
                    <span>Enable Overload (Port Translation)</span>
                  </div>
                </>
              )}

              {state.activeNatType === "static" && (
                <>
                  <label>Static Mapping</label>
                  <div className="inline-fields">
                    <div className="input-wrap">
                      <span>Private IP</span>
                      <input placeholder="e.g. 192.168.1.10" value={state.staticPrivateIP} onChange={(e) => set("staticPrivateIP", e.target.value)} />
                    </div>
                    <div className="input-wrap">
                      <span>Public IP</span>
                      <input placeholder="e.g. 203.0.113.5" value={state.staticPublicIP} onChange={(e) => set("staticPublicIP", e.target.value)} />
                    </div>
                  </div>
                  <label style={{ marginTop: "15px" }}>Port Forwarding (Static PAT)</label>
                  <div className="inline-fields">
                    <div className="input-wrap">
                      <span>Private Port</span>
                      <input placeholder="e.g. 80" value={state.staticPrivatePort} onChange={(e) => set("staticPrivatePort", e.target.value)} />
                    </div>
                    <div className="input-wrap">
                      <span>Public Port</span>
                      <input placeholder="e.g. 8080" value={state.staticPublicPort} onChange={(e) => set("staticPublicPort", e.target.value)} />
                    </div>
                  </div>
                </>
              )}

              {state.activeNatType === "dynamic" && (
                <>
                  <label>NAT Pool</label>
                  <div className="input-wrap">
                    <span>Pool Name</span>
                    <input placeholder="e.g. POOL-WAN-01" value={state.poolName} onChange={(e) => set("poolName", e.target.value)} />
                  </div>
                  <div className="inline-fields">
                    <div className="input-wrap">
                      <span>Start IP</span>
                      <input placeholder="e.g. 203.0.113.10" value={state.poolStartIP} onChange={(e) => set("poolStartIP", e.target.value)} />
                    </div>
                    <div className="input-wrap">
                      <span>End IP</span>
                      <input placeholder="e.g. 203.0.113.20" value={state.poolEndIP} onChange={(e) => set("poolEndIP", e.target.value)} />
                    </div>
                    <div className="input-wrap">
                      <span>Netmask</span>
                      <input placeholder="e.g. 255.255.255.224" value={state.poolNetmask} onChange={(e) => set("poolNetmask", e.target.value)} />
                    </div>
                  </div>
                  <div className="input-wrap">
                    <span>Bind ACL ID</span>
                    <input placeholder="e.g. 1" value={state.poolBindACL} onChange={(e) => set("poolBindACL", e.target.value)} />
                  </div>
                </>
              )}

            </div>
          </div>

          <div className="modal-footer-clean">
            <button className="btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn-primary" onClick={handleApply}>Apply Changes</button>
          </div>
        </div>

      </div>
    </div>,
    document.body
  );
}