import { useState } from "react";
import { createPortal } from "react-dom";
import { ShieldCheck, Cable, Lock, Activity, AlertTriangle } from "lucide-react";

export default function PortSecurityModal({ onClose, deviceName = "Switch", deviceLocation = "Network" }) {
  const [activePortSecurityTab, setActivePortSecurityTab] = useState("mac");

  const now = () => new Date().toISOString().replace("T", " ").slice(0, 19);

  const handleApply = () => {
    const ts = now();
    const dispatch = (message) =>
      window.dispatchEvent(new CustomEvent("add-system-log", { detail: { device: "Switch", deviceName, message, location: deviceLocation, italic: true } }));

    dispatch(`%PORTSEC-5-MAC_BIND: [${ts}] ${deviceName} @ ${deviceLocation} — Secure MAC address table updated. Static and sticky MAC bindings committed on configured access ports.`);
    dispatch(`%PORTSEC-5-VIOLATION_POLICY: [${ts}] ${deviceName} — Violation action policy applied. Ports will respond to unauthorized MAC events per the configured mode (Shutdown / Restrict / Protect).`);
    dispatch(`%PORTSEC-6-STICKY_MAC: [${ts}] ${deviceName} — Sticky MAC learning parameters updated. Dynamically learned MACs will be persisted to the running-config on the next save.`);
    dispatch(`%DOT1X-5-PORT_AUTH: [${ts}] ${deviceName} — 802.1X / NAC port authentication settings applied. Supplicant re-authentication timers and auth-fail VLAN assignments updated.`);
    dispatch(`%STORM-5-THRESHOLD: [${ts}] ${deviceName} — Storm control thresholds committed. Broadcast and multicast rate limiters active; violating traffic will trigger the configured action.`);
    onClose();
  };

  return createPortal(
    <div className="config-modal-overlay port-security-modal-layer">
      <div className="config-modal-content nat-sidebar-layout">

        <div className="nat-sidebar">
          <div className="sidebar-header">
            <ShieldCheck size={18} />
            <span>Port Security</span>
          </div>
          <div className="nav-list">
            {[
              { key: "mac",       icon: <Cable size={16} />,         label: "MAC Binding",       desc: "Allowed device addresses" },
              { key: "violation", icon: <Lock size={16} />,          label: "Violation Policy",   desc: "Unauthorized access action" },
              { key: "sticky",    icon: <ShieldCheck size={16} />,   label: "Sticky MAC",         desc: "Dynamic MAC learning" },
              { key: "dot1x",     icon: <Lock size={16} />,          label: "802.1X / NAC",       desc: "Port-based auth control" },
              { key: "storm",     icon: <AlertTriangle size={16} />, label: "Storm Control",      desc: "Broadcast/multicast limits" },
              { key: "monitor",   icon: <Activity size={16} />,      label: "Security Monitor",   desc: "Violations & err-disabled" },
            ].map(({ key, icon, label, desc }) => (
              <button key={key} className={`nav-item ${activePortSecurityTab === key ? "active" : ""}`} onClick={() => setActivePortSecurityTab(key)}>
                <div className="nav-icon">{icon}</div>
                <div className="nav-text"><strong>{label}</strong><p>{desc}</p></div>
              </button>
            ))}
          </div>
        </div>

        <div className="nat-main-content">
          <div className="modal-header-clean">
            <h3>Advanced Port Security</h3>
            <button className="close-btn-mono" onClick={onClose}>×</button>
          </div>

          <div className="config-body">

            {/* ── MAC BINDING ── */}
            {activePortSecurityTab === "mac" && (
              <div className="config-group-mono">
                <label>Secure MAC Address Table</label>
                <table className="acl-table">
                  <thead>
                    <tr>
                      <th>Port</th>
                      <th>Allowed MAC Address</th>
                      <th>Max MACs</th>
                      <th>Current Count</th>
                      <th>Aging (min)</th>
                      <th>Aging Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { port:"Fa0/1", mac:"AA:BB:CC:DD:EE:01", max:"2",  cur:"1", age:"60" },
                      { port:"Fa0/2", mac:"AA:BB:CC:DD:EE:02", max:"1",  cur:"1", age:"30" },
                      { port:"Fa0/3", mac:"",                  max:"5",  cur:"3", age:"0"  },
                      { port:"Gi0/1", mac:"",                  max:"10", cur:"7", age:"0"  },
                    ].map((row, i) => (
                      <tr key={i}>
                        <td><strong>{row.port}</strong></td>
                        <td><input defaultValue={row.mac} placeholder="AA:BB:CC:DD:EE:FF" /></td>
                        <td><input defaultValue={row.max} style={{width:"60px"}} /></td>
                        <td style={{color: parseInt(row.cur) >= parseInt(row.max) ? "var(--color-text-danger)" : "var(--color-text-success)"}}>{row.cur}</td>
                        <td><input defaultValue={row.age} style={{width:"60px"}} /></td>
                        <td>
                          <select>
                            <option>Absolute</option><option>Inactivity</option><option>Disabled</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="checkbox-wrap" style={{marginTop:"10px"}}>
                  <input type="checkbox" defaultChecked />
                  <span>Enable port security globally on all access ports</span>
                </div>
              </div>
            )}

            {/* ── VIOLATION POLICY ── */}
            {activePortSecurityTab === "violation" && (
              <div className="config-group-mono">
                <label>Violation Action Policies</label>
                <table className="acl-table">
                  <thead>
                    <tr>
                      <th>Interface</th>
                      <th>Violation Action</th>
                      <th>Recovery Timer (sec)</th>
                      <th>Send SNMP Trap</th>
                      <th>Send Syslog</th>
                    </tr>
                  </thead>
                  <tbody>
                    {["Fa0/1","Fa0/2","Fa0/3","Gi0/1"].map((port, i) => (
                      <tr key={i}>
                        <td>{port}</td>
                        <td>
                          <select>
                            <option>Shutdown</option><option>Restrict</option><option>Protect</option>
                          </select>
                        </td>
                        <td><input defaultValue="300" style={{width:"80px"}} /></td>
                        <td style={{textAlign:"center"}}><input type="checkbox" defaultChecked /></td>
                        <td style={{textAlign:"center"}}><input type="checkbox" defaultChecked /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="inline-fields" style={{marginTop:"12px"}}>
                  <div className="input-wrap">
                    <span>Global Err-Disable Recovery</span>
                    <select>
                      <option>Auto (300 sec)</option><option>Manual</option><option>Disabled</option>
                    </select>
                  </div>
                  <div className="input-wrap">
                    <span>Recovery Interval (sec)</span>
                    <input defaultValue="300" />
                  </div>
                </div>
              </div>
            )}

            {/* ── STICKY MAC ── */}
            {activePortSecurityTab === "sticky" && (
              <div className="config-group-mono">
                <label>Sticky MAC Learning</label>
                <table className="acl-table">
                  <thead>
                    <tr>
                      <th>Interface</th>
                      <th>Sticky Learning</th>
                      <th>Learned MACs</th>
                      <th>Persist to Running-Config</th>
                      <th>Clear on Violation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { port:"Fa0/1", sticky:true,  macs:"AA:BB:CC:11:22:33" },
                      { port:"Fa0/2", sticky:true,  macs:"AA:BB:CC:44:55:66" },
                      { port:"Fa0/3", sticky:false, macs:"—" },
                      { port:"Gi0/1", sticky:false, macs:"—" },
                    ].map((row, i) => (
                      <tr key={i}>
                        <td>{row.port}</td>
                        <td style={{textAlign:"center"}}><input type="checkbox" defaultChecked={row.sticky} /></td>
                        <td style={{fontFamily:"monospace",fontSize:"11px"}}>{row.macs}</td>
                        <td style={{textAlign:"center"}}><input type="checkbox" defaultChecked={row.sticky} /></td>
                        <td style={{textAlign:"center"}}><input type="checkbox" defaultChecked /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="checkbox-wrap" style={{marginTop:"10px"}}>
                  <input type="checkbox" defaultChecked />
                  <span>Save sticky MACs to startup-config on apply</span>
                </div>
              </div>
            )}

            {/* ── 802.1X / NAC ── */}
            {activePortSecurityTab === "dot1x" && (
              <div className="config-group-mono">
                <label>802.1X Port-Based Access Control</label>
                <div className="inline-fields">
                  <div className="input-wrap">
                    <span>Global 802.1X</span>
                    <select><option>Enabled</option><option>Disabled</option></select>
                  </div>
                  <div className="input-wrap">
                    <span>Reauth Period (sec)</span>
                    <input defaultValue="3600" />
                  </div>
                  <div className="input-wrap">
                    <span>Quiet Period (sec)</span>
                    <input defaultValue="60" />
                  </div>
                </div>
                <table className="acl-table" style={{marginTop:"10px"}}>
                  <thead>
                    <tr>
                      <th>Interface</th>
                      <th>Host Mode</th>
                      <th>Auth Mode</th>
                      <th>Guest VLAN</th>
                      <th>Auth-Fail VLAN</th>
                      <th>Critical VLAN</th>
                    </tr>
                  </thead>
                  <tbody>
                    {["Fa0/1","Fa0/2","Fa0/3"].map((port, i) => (
                      <tr key={i}>
                        <td>{port}</td>
                        <td>
                          <select>
                            <option>Single-Host</option><option>Multi-Host</option><option>Multi-Auth</option><option>Multi-Domain</option>
                          </select>
                        </td>
                        <td>
                          <select>
                            <option>Closed</option><option>Open</option><option>Monitor</option>
                          </select>
                        </td>
                        <td><input defaultValue="100" style={{width:"60px"}} /></td>
                        <td><input defaultValue="200" style={{width:"60px"}} /></td>
                        <td><input defaultValue="999" style={{width:"60px"}} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* ── STORM CONTROL ── */}
            {activePortSecurityTab === "storm" && (
              <div className="config-group-mono">
                <label>Storm Control Thresholds</label>
                <table className="acl-table">
                  <thead>
                    <tr>
                      <th>Interface</th>
                      <th>Broadcast (%)</th>
                      <th>Multicast (%)</th>
                      <th>Unicast (%)</th>
                      <th>Action</th>
                      <th>Trap</th>
                    </tr>
                  </thead>
                  <tbody>
                    {["Fa0/1","Fa0/2","Fa0/3","Gi0/1","Gi0/2"].map((port, i) => (
                      <tr key={i}>
                        <td>{port}</td>
                        <td><input defaultValue="20" style={{width:"60px"}} /></td>
                        <td><input defaultValue="30" style={{width:"60px"}} /></td>
                        <td><input defaultValue="80" style={{width:"60px"}} /></td>
                        <td>
                          <select>
                            <option>Drop</option><option>Shutdown</option><option>Trap Only</option>
                          </select>
                        </td>
                        <td style={{textAlign:"center"}}><input type="checkbox" defaultChecked /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="inline-fields" style={{marginTop:"12px"}}>
                  <div className="input-wrap">
                    <span>Traffic Unit</span>
                    <select><option>% of interface bandwidth</option><option>bps (absolute)</option><option>pps (packets/sec)</option></select>
                  </div>
                </div>
              </div>
            )}

            {/* ── SECURITY MONITOR ── */}
            {activePortSecurityTab === "monitor" && (
              <div className="config-group-mono">
                <label>Security Event Monitor</label>
                <table className="acl-table">
                  <thead>
                    <tr>
                      <th>Interface</th>
                      <th>Security Status</th>
                      <th>Violation Count</th>
                      <th>Last Violation MAC</th>
                      <th>Err-Disabled</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { port:"Fa0/1", status:"Secure-Up",     count:"0",  mac:"—",                  err:false },
                      { port:"Fa0/2", status:"Secure-Up",     count:"2",  mac:"AA:BB:CC:99:88:77",  err:false },
                      { port:"Fa0/3", status:"Err-Disabled",  count:"12", mac:"DE:AD:BE:EF:00:01",  err:true  },
                      { port:"Gi0/1", status:"Secure-Up",     count:"0",  mac:"—",                  err:false },
                    ].map((row, i) => (
                      <tr key={i}>
                        <td>{row.port}</td>
                        <td style={{color: row.err ? "var(--color-text-danger)" : "var(--color-text-success)", fontWeight:600}}>{row.status}</td>
                        <td style={{color: parseInt(row.count) > 0 ? "var(--color-text-warning)" : "inherit"}}>{row.count}</td>
                        <td style={{fontFamily:"monospace",fontSize:"11px"}}>{row.mac}</td>
                        <td>
                          {row.err
                            ? <button className="btn-secondary" style={{padding:"2px 10px",fontSize:"11px",color:"var(--color-text-danger)"}}>Recover</button>
                            : <span style={{color:"var(--color-text-success)"}}>No</span>
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

          </div>

          <div className="modal-footer-clean">
            <button className="btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn-primary" onClick={handleApply}>Apply Security</button>
          </div>
        </div>

      </div>
    </div>,
    document.body
  );
}