import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import { Clock, Server, ArrowLeftRight, Lock, Activity } from "lucide-react";

let persistentNTPState = null;

const defaultServers = [
  { host: "", type: "Public", enabled: true },
  { host: "", type: "Pool",   enabled: true },
  { host: "", type: "Fallback", enabled: false },
];

const defaultState = {
  activeNTPTab:   "server",
  servers:        defaultServers,
  syncInterval:   "60 sec",
  syncMode:       "Client",
  autoDrift:      true,
  forceOnBoot:    false,
  fallback:       false,
  keyId:          "",
  algorithm:      "MD5",
  sharedKey:      "",
  requireAuth:    false,
};

function dispatchLog(deviceName, deviceLocation, message) {
  window.dispatchEvent(
    new CustomEvent("add-system-log", {
      detail: { device: "Router", deviceName, message, location: deviceLocation, italic: true },
    })
  );
}

export default function NTPModal({ onClose, deviceName = "Router-Core-01", deviceLocation = "Data Center" }) {
  const [state, setState] = useState(persistentNTPState || defaultState);
  const prevState = useRef(persistentNTPState || defaultState);
  const set = (field, value) => setState((s) => ({ ...s, [field]: value }));

  const updateServer = (i, field, value) => {
    const servers = [...state.servers];
    servers[i] = { ...servers[i], [field]: value };
    set("servers", servers);
  };

  const now = () => new Date().toISOString().replace("T", " ").slice(0, 19);

  const handleApply = () => {
    const logs = [];

    // NTP Servers
    state.servers.forEach((srv, i) => {
      if (srv.host) {
        logs.push(`[NTP Server #${i + 1}] Host: ${srv.host} | Type: ${srv.type} | Enabled: ${srv.enabled ? "Yes" : "No"}`);
      }
    });

    // Sync Engine
    if (state.syncInterval && state.syncInterval !== "Select") logs.push(`[NTP Sync] Interval: ${state.syncInterval}`);
    if (state.syncMode     && state.syncMode     !== "Select") logs.push(`[NTP Sync] Mode: ${state.syncMode}`);
    if (state.autoDrift)    logs.push(`[NTP Sync] Auto Drift Correction: Enabled`);
    if (state.forceOnBoot)  logs.push(`[NTP Sync] Force Sync on Boot: Enabled`);
    if (state.fallback)     logs.push(`[NTP Sync] Fallback to Secondary: Enabled`);

    // Authentication
    if (state.keyId)       logs.push(`[NTP Auth] Key ID: ${state.keyId}`);
    if (state.algorithm && state.algorithm !== "Select") logs.push(`[NTP Auth] Algorithm: ${state.algorithm}`);
    if (state.sharedKey)   logs.push(`[NTP Auth] Shared Key: configured`);
    if (state.requireAuth) logs.push(`[NTP Auth] Require Authentication: Enabled`);

    if (logs.length === 0) logs.push(`[NTP] Applied — no parameters configured`);

    logs.forEach((message) => dispatchLog(deviceName, deviceLocation, message));
    onClose();
  };

  return createPortal(
    <div className="config-modal-overlay ntp-modal-layer">
      <div className="nat-sidebar-layout">

        {/* SIDEBAR */}
        <div className="nat-sidebar">
          <div className="sidebar-header">
            <Clock size={18} />
            <span>NTP Configuration</span>
          </div>
          <div className="nav-list">
            <button className={`nav-item ${state.activeNTPTab === "server" ? "active" : ""}`} onClick={() => set("activeNTPTab", "server")}>
              <div className="nav-icon"><Server size={16} /></div>
              <div className="nav-text"><strong>NTP Servers</strong><p>Time source hierarchy</p></div>
            </button>
            <button className={`nav-item ${state.activeNTPTab === "sync" ? "active" : ""}`} onClick={() => set("activeNTPTab", "sync")}>
              <div className="nav-icon"><ArrowLeftRight size={16} /></div>
              <div className="nav-text"><strong>Sync Engine</strong><p>Intervals & behavior</p></div>
            </button>
            <button className={`nav-item ${state.activeNTPTab === "auth" ? "active" : ""}`} onClick={() => set("activeNTPTab", "auth")}>
              <div className="nav-icon"><Lock size={16} /></div>
              <div className="nav-text"><strong>Authentication</strong><p>Secure time validation</p></div>
            </button>
            <button className={`nav-item ${state.activeNTPTab === "status" ? "active" : ""}`} onClick={() => set("activeNTPTab", "status")}>
              <div className="nav-icon"><Activity size={16} /></div>
              <div className="nav-text"><strong>Monitoring</strong><p>Clock drift & sync health</p></div>
            </button>
          </div>
        </div>

        {/* MAIN */}
        <div className="nat-main-content">
          <div className="modal-header-clean">
            <h3>{state.activeNTPTab.toUpperCase()} Settings</h3>
            <button className="close-btn-mono" onClick={onClose}>×</button>
          </div>

          <div className="config-body">

            {state.activeNTPTab === "server" && (
              <div className="config-group-mono">
                <label>Time Source Hierarchy</label>
                <table className="acl-table">
                  <thead>
                    <tr><th>Priority</th><th>NTP Server</th><th>Type</th><th>Enabled</th></tr>
                  </thead>
                  <tbody>
                    {state.servers.map((srv, i) => (
                      <tr key={i}>
                        <td>{i + 1}</td>
                        <td><input placeholder="e.g. time.google.com" value={srv.host} onChange={(e) => updateServer(i, "host", e.target.value)} /></td>
                        <td>
                          <select value={srv.type} onChange={(e) => updateServer(i, "type", e.target.value)}>
                            <option>Select</option>
                            <option>Public</option>
                            <option>Pool</option>
                            <option>Internal</option>
                            <option>Fallback</option>
                          </select>
                        </td>
                        <td><input type="checkbox" checked={srv.enabled} onChange={(e) => updateServer(i, "enabled", e.target.checked)} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {state.activeNTPTab === "sync" && (
              <div className="config-group-mono">
                <label>Synchronization Engine</label>
                <div className="inline-fields">
                  <div className="input-wrap">
                    <span>Sync Interval</span>
                    <select value={state.syncInterval} onChange={(e) => set("syncInterval", e.target.value)}>
                      <option>Select</option>
                      <option>30 sec</option>
                      <option>60 sec</option>
                      <option>5 min</option>
                      <option>15 min</option>
                      <option>1 hour</option>
                    </select>
                  </div>
                  <div className="input-wrap">
                    <span>Mode</span>
                    <select value={state.syncMode} onChange={(e) => set("syncMode", e.target.value)}>
                      <option>Select</option>
                      <option>Client</option>
                      <option>Server</option>
                      <option>Peer</option>
                    </select>
                  </div>
                </div>
                <div className="checkbox-wrap">
                  <input type="checkbox" checked={state.autoDrift} onChange={(e) => set("autoDrift", e.target.checked)} />
                  <span>Auto drift correction (slew mode)</span>
                </div>
                <div className="checkbox-wrap">
                  <input type="checkbox" checked={state.forceOnBoot} onChange={(e) => set("forceOnBoot", e.target.checked)} />
                  <span>Force sync on boot</span>
                </div>
                <div className="checkbox-wrap">
                  <input type="checkbox" checked={state.fallback} onChange={(e) => set("fallback", e.target.checked)} />
                  <span>Fallback to secondary NTP source</span>
                </div>
              </div>
            )}

            {state.activeNTPTab === "auth" && (
              <div className="config-group-mono">
                <label>NTP Authentication Layer</label>
                <div className="inline-fields">
                  <div className="input-wrap">
                    <span>Key ID</span>
                    <input placeholder="e.g. 1" value={state.keyId} onChange={(e) => set("keyId", e.target.value)} />
                  </div>
                  <div className="input-wrap">
                    <span>Algorithm</span>
                    <select value={state.algorithm} onChange={(e) => set("algorithm", e.target.value)}>
                      <option>Select</option>
                      <option>MD5</option>
                      <option>SHA1</option>
                      <option>SHA256</option>
                    </select>
                  </div>
                </div>
                <div className="input-wrap">
                  <span>Shared Key</span>
                  <input type="password" placeholder="e.g. ••••••••••••" value={state.sharedKey} onChange={(e) => set("sharedKey", e.target.value)} />
                </div>
                <div className="checkbox-wrap">
                  <input type="checkbox" checked={state.requireAuth} onChange={(e) => set("requireAuth", e.target.checked)} />
                  <span>Require authentication for all NTP peers</span>
                </div>
              </div>
            )}

            {state.activeNTPTab === "status" && (
              <div className="config-group-mono">
                <label>Clock Synchronization Health</label>
                <table className="acl-table">
                  <thead>
                    <tr><th>Source</th><th>Status</th><th>Offset</th><th>Last Sync</th></tr>
                  </thead>
                  <tbody>
                    <tr><td>time.google.com</td><td style={{ color: "green" }}>SYNCED</td><td>+0.003s</td><td>12s ago</td></tr>
                    <tr><td>pool.ntp.org</td><td style={{ color: "green" }}>SYNCED</td><td>+0.007s</td><td>18s ago</td></tr>
                    <tr><td>Local Clock</td><td style={{ color: "orange" }}>STANDBY</td><td>—</td><td>—</td></tr>
                  </tbody>
                </table>
              </div>
            )}

          </div>

          <div className="modal-footer-clean">
            <button className="btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn-primary" onClick={handleApply}>Apply NTP</button>
          </div>
        </div>

      </div>
    </div>,
    document.body
  );
}