import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import { Activity, Server, Lock, Network, ArrowDown } from "lucide-react";

let persistentSNMPState = null;

const defaultState = {
  activeSNMPTab:     "agent",
  systemName:        "",
  location:          "",
  snmpVersion:       "v3 (Recommended)",
  contact:           "",
  agentEnabled:      true,
  readCommunity:     "",
  writeCommunity:    "",
  managerACL:        "",
  securityLevel:     "authPriv (Recommended)",
  accessLogging:     true,
  restrictTrusted:   false,
  trapReceiver:      "",
  trapPort:          "",
  trapLinkUpDown:    true,
  trapCpuMemory:     false,
  trapAnomaly:       false,
};

function dispatchLog(deviceName, deviceLocation, message) {
  window.dispatchEvent(
    new CustomEvent("add-system-log", {
      detail: { device: "Router", deviceName, message, location: deviceLocation, italic: true },
    })
  );
}

export default function SNMPModal({ onClose, deviceName = "Router-Core-01", deviceLocation = "Data Center" }) {
  const [state, setState] = useState(persistentSNMPState || defaultState);
  const prevState = useRef(persistentSNMPState || defaultState);
  const set = (field, value) => setState((s) => ({ ...s, [field]: value }));

  const now = () => new Date().toISOString().replace("T", " ").slice(0, 19);

  const handleApply = () => {
    const logs = [];

    // Agent
    if (state.systemName)                              logs.push(`[SNMP Agent] System Name: ${state.systemName}`);
    if (state.location)                                logs.push(`[SNMP Agent] Location: ${state.location}`);
    if (state.snmpVersion && state.snmpVersion !== "Select") logs.push(`[SNMP Agent] Version: ${state.snmpVersion}`);
    if (state.contact)                                 logs.push(`[SNMP Agent] Contact: ${state.contact}`);
    if (!state.agentEnabled)                           logs.push(`[SNMP Agent] Global Agent: Disabled`);

    // Security
    if (state.readCommunity)                           logs.push(`[SNMP Security] Read Community: configured`);
    if (state.writeCommunity)                          logs.push(`[SNMP Security] Write Community: configured`);
    if (state.managerACL)                              logs.push(`[SNMP Security] Manager IP ACL: ${state.managerACL}`);
    if (state.securityLevel && state.securityLevel !== "Select") logs.push(`[SNMP Security] Security Level: ${state.securityLevel}`);
    if (state.accessLogging)                           logs.push(`[SNMP Security] Access Logging: Enabled`);
    if (state.restrictTrusted)                         logs.push(`[SNMP Security] Restrict to Trusted Networks: Enabled`);

    // Traps
    if (state.trapReceiver) logs.push(`[SNMP Traps] Receiver IP: ${state.trapReceiver}`);
    if (state.trapPort)     logs.push(`[SNMP Traps] Port: ${state.trapPort}`);
    if (state.trapLinkUpDown) logs.push(`[SNMP Traps] Link Up/Down Notifications: Enabled`);
    if (state.trapCpuMemory)  logs.push(`[SNMP Traps] CPU/Memory Alerts: Enabled`);
    if (state.trapAnomaly)    logs.push(`[SNMP Traps] Anomaly Detection: Enabled`);

    if (logs.length === 0) logs.push(`[SNMP] Applied — no parameters configured`);

    logs.forEach((message) => dispatchLog(deviceName, deviceLocation, message));
    onClose();
  };

  return createPortal(
    <div className="config-modal-overlay snmp-modal-layer">
      <div className="nat-sidebar-layout">

        {/* SIDEBAR */}
        <div className="nat-sidebar">
          <div className="sidebar-header">
            <Activity size={18} />
            <span>SNMP Configuration</span>
          </div>
          <div className="nav-list">
            <button className={`nav-item ${state.activeSNMPTab === "agent" ? "active" : ""}`} onClick={() => set("activeSNMPTab", "agent")}>
              <div className="nav-icon"><Server size={16} /></div>
              <div className="nav-text"><strong>SNMP Agent</strong><p>Identity & versioning</p></div>
            </button>
            <button className={`nav-item ${state.activeSNMPTab === "security" ? "active" : ""}`} onClick={() => set("activeSNMPTab", "security")}>
              <div className="nav-icon"><Lock size={16} /></div>
              <div className="nav-text"><strong>Security</strong><p>v1/v2c/v3 access control</p></div>
            </button>
            <button className={`nav-item ${state.activeSNMPTab === "mib" ? "active" : ""}`} onClick={() => set("activeSNMPTab", "mib")}>
              <div className="nav-icon"><Network size={16} /></div>
              <div className="nav-text"><strong>MIB Monitoring</strong><p>OID tracking & thresholds</p></div>
            </button>
            <button className={`nav-item ${state.activeSNMPTab === "traps" ? "active" : ""}`} onClick={() => set("activeSNMPTab", "traps")}>
              <div className="nav-icon"><ArrowDown size={16} /></div>
              <div className="nav-text"><strong>Traps & Alerts</strong><p>Event notification system</p></div>
            </button>
          </div>
        </div>

        {/* MAIN */}
        <div className="nat-main-content">
          <div className="modal-header-clean">
            <h3>{state.activeSNMPTab.toUpperCase()} Settings</h3>
            <button className="close-btn-mono" onClick={onClose}>×</button>
          </div>

          <div className="config-body">

            {state.activeSNMPTab === "agent" && (
              <div className="config-group-mono">
                <label>SNMP Agent Identity</label>
                <div className="inline-fields">
                  <div className="input-wrap">
                    <span>System Name</span>
                    <input placeholder="e.g. Router-Core-01" value={state.systemName} onChange={(e) => set("systemName", e.target.value)} />
                  </div>
                  <div className="input-wrap">
                    <span>Location</span>
                    <input placeholder="e.g. Data Center - Manila" value={state.location} onChange={(e) => set("location", e.target.value)} />
                  </div>
                </div>
                <div className="inline-fields">
                  <div className="input-wrap">
                    <span>SNMP Version</span>
                    <select value={state.snmpVersion} onChange={(e) => set("snmpVersion", e.target.value)}>
                      <option>Select</option>
                      <option>v3 (Recommended)</option>
                      <option>v2c</option>
                      <option>v1 (Legacy)</option>
                    </select>
                  </div>
                  <div className="input-wrap">
                    <span>Contact</span>
                    <input placeholder="e.g. admin@network.local" value={state.contact} onChange={(e) => set("contact", e.target.value)} />
                  </div>
                </div>
                <div className="checkbox-wrap">
                  <input type="checkbox" checked={state.agentEnabled} onChange={(e) => set("agentEnabled", e.target.checked)} />
                  <span>Enable SNMP agent globally</span>
                </div>
              </div>
            )}

            {state.activeSNMPTab === "security" && (
              <div className="config-group-mono">
                <label>SNMP Security Configuration</label>
                <div className="inline-fields">
                  <div className="input-wrap">
                    <span>Read Community</span>
                    <input placeholder="e.g. public" value={state.readCommunity} onChange={(e) => set("readCommunity", e.target.value)} />
                  </div>
                  <div className="input-wrap">
                    <span>Write Community</span>
                    <input placeholder="e.g. private" value={state.writeCommunity} onChange={(e) => set("writeCommunity", e.target.value)} />
                  </div>
                </div>
                <div className="inline-fields">
                  <div className="input-wrap">
                    <span>Manager IP ACL</span>
                    <input placeholder="e.g. 192.168.1.10/32" value={state.managerACL} onChange={(e) => set("managerACL", e.target.value)} />
                  </div>
                  <div className="input-wrap">
                    <span>SNMPv3 Security Level</span>
                    <select value={state.securityLevel} onChange={(e) => set("securityLevel", e.target.value)}>
                      <option>Select</option>
                      <option>authPriv (Recommended)</option>
                      <option>authNoPriv</option>
                      <option>noAuthNoPriv</option>
                    </select>
                  </div>
                </div>
                <div className="checkbox-wrap">
                  <input type="checkbox" checked={state.accessLogging} onChange={(e) => set("accessLogging", e.target.checked)} />
                  <span>Enable access logging</span>
                </div>
                <div className="checkbox-wrap">
                  <input type="checkbox" checked={state.restrictTrusted} onChange={(e) => set("restrictTrusted", e.target.checked)} />
                  <span>Restrict SNMP to trusted networks only</span>
                </div>
              </div>
            )}

            {state.activeSNMPTab === "mib" && (
              <div className="config-group-mono">
                <label>MIB / OID Monitoring Engine</label>
                <table className="acl-table">
                  <thead>
                    <tr><th>OID</th><th>Metric</th><th>Threshold</th><th>Alert</th></tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>.1.3.6.1.2.1.1.3</td><td>System Uptime</td>
                      <td><input placeholder="e.g. &gt; 99.9%" /></td>
                      <td><input type="checkbox" defaultChecked /></td>
                    </tr>
                    <tr>
                      <td>.1.3.6.1.2.1.2.2</td><td>Interface Utilization</td>
                      <td><input placeholder="e.g. &gt; 80%" /></td>
                      <td><input type="checkbox" /></td>
                    </tr>
                    <tr>
                      <td>.1.3.6.1.4.1</td><td>CPU Load</td>
                      <td><input placeholder="e.g. &gt; 75%" /></td>
                      <td><input type="checkbox" defaultChecked /></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {state.activeSNMPTab === "traps" && (
              <div className="config-group-mono">
                <label>Trap & Alert System</label>
                <div className="inline-fields">
                  <div className="input-wrap">
                    <span>Trap Receiver IP</span>
                    <input placeholder="e.g. 192.168.1.100" value={state.trapReceiver} onChange={(e) => set("trapReceiver", e.target.value)} />
                  </div>
                  <div className="input-wrap">
                    <span>Port</span>
                    <input placeholder="e.g. 162" value={state.trapPort} onChange={(e) => set("trapPort", e.target.value)} />
                  </div>
                </div>
                <div className="checkbox-wrap">
                  <input type="checkbox" checked={state.trapLinkUpDown} onChange={(e) => set("trapLinkUpDown", e.target.checked)} />
                  <span>Link up/down notifications</span>
                </div>
                <div className="checkbox-wrap">
                  <input type="checkbox" checked={state.trapCpuMemory} onChange={(e) => set("trapCpuMemory", e.target.checked)} />
                  <span>CPU / Memory threshold alerts</span>
                </div>
                <div className="checkbox-wrap">
                  <input type="checkbox" checked={state.trapAnomaly} onChange={(e) => set("trapAnomaly", e.target.checked)} />
                  <span>Anomaly detection engine</span>
                </div>
              </div>
            )}

          </div>

          <div className="modal-footer-clean">
            <button className="btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn-primary" onClick={handleApply}>Apply SNMP</button>
          </div>
        </div>

      </div>
    </div>,
    document.body
  );
}