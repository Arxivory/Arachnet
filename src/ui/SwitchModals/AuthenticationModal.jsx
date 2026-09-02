import { useState } from "react";
import { createPortal } from "react-dom";
import { Lock, Server, ShieldCheck, Users, Key } from "lucide-react";

export default function AuthenticationModal({ onClose, deviceName = "Switch", deviceLocation = "Network" }) {
  const [activeAuthTab, setActiveAuthTab] = useState("radius");

  const [radiusServerIP, setRadiusServerIP] = useState("");
  const [radiusPort, setRadiusPort] = useState("1812");
  const [radiusSecret, setRadiusSecret] = useState("");
  const [dot1xGlobal, setDot1xGlobal] = useState(true);
  const [dot1xForce, setDot1xForce] = useState(true);

  const now = () => new Date().toISOString().replace("T", " ").slice(0, 19);

  const handleApply = () => {
    const ts = now();
    const dispatch = (message) =>
      window.dispatchEvent(new CustomEvent("add-system-log", { detail: { device: "Switch", deviceName, message, location: deviceLocation, italic: true } }));

    if (radiusServerIP) dispatch(`%RADIUS-5-SERVER_SET: [${ts}] ${deviceName} @ ${deviceLocation} — RADIUS server configured: ${radiusServerIP}:${radiusPort}. Shared secret updated; test authentication recommended.`);
    if (radiusSecret)   dispatch(`%RADIUS-6-SECRET_SET: [${ts}] ${deviceName} — RADIUS shared secret committed. New key will be used for all subsequent AAA requests to the configured server.`);
    dispatch(`%DOT1X-5-GLOBAL_SET: [${ts}] ${deviceName} — 802.1X global state: ${dot1xGlobal ? "ENABLED" : "DISABLED"}. EAP processing on dot1x-enabled ports will ${dot1xGlobal ? "now proceed" : "be suspended"}.`);
    if (dot1xForce) dispatch(`%DOT1X-6-FORCE_AUTH: [${ts}] ${deviceName} — Force-authorized mode applied to access ports. Ports will require EAP authentication before passing traffic.`);
    dispatch(`%AAA-5-TACACS_CONFIG: [${ts}] ${deviceName} — TACACS+ server parameters and privilege-level command authorization settings committed.`);
    dispatch(`%AAA-6-LOCAL_FALLBACK: [${ts}] ${deviceName} — Local user database fallback policy updated. Device will use local credentials when AAA servers are unreachable.`);
    onClose();
  };

  return createPortal(
    <div className="config-modal-overlay auth-modal-layer">
      <div className="config-modal-content nat-sidebar-layout">

        <div className="nat-sidebar">
          <div className="sidebar-header">
            <Lock size={18} />
            <span>User Authentication</span>
          </div>
          <div className="nav-list">
            {[
              { key:"radius",  icon:<Server size={16} />,      label:"RADIUS",         desc:"AAA authentication server" },
              { key:"tacacs",  icon:<Key size={16} />,         label:"TACACS+",         desc:"Cisco AAA fallback" },
              { key:"dot1x",   icon:<ShieldCheck size={16} />, label:"802.1X / NAC",    desc:"Port-based access control" },
              { key:"aaa",     icon:<Users size={16} />,       label:"AAA Policy",      desc:"Auth, authz & accounting" },
              { key:"local",   icon:<Lock size={16} />,        label:"Local Users",     desc:"Fallback local accounts" },
            ].map(({ key, icon, label, desc }) => (
              <button key={key} className={`nav-item ${activeAuthTab === key ? "active" : ""}`} onClick={() => setActiveAuthTab(key)}>
                <div className="nav-icon">{icon}</div>
                <div className="nav-text"><strong>{label}</strong><p>{desc}</p></div>
              </button>
            ))}
          </div>
        </div>

        <div className="nat-main-content">
          <div className="modal-header-clean">
            <h3>Advanced Authentication Settings</h3>
            <button className="close-btn-mono" onClick={onClose}>×</button>
          </div>

          <div className="config-body">

            {/* ── RADIUS ── */}
            {activeAuthTab === "radius" && (
              <div className="config-group-mono">
                <label>RADIUS Server Configuration</label>
                <table className="acl-table">
                  <thead>
                    <tr>
                      <th>Server IP</th><th>Auth Port</th><th>Acct Port</th>
                      <th>Shared Secret</th><th>Timeout (sec)</th><th>Retransmit</th><th>Priority</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { ip:"192.168.30.100", auth:"1812", acct:"1813", to:"5", retx:"3" },
                      { ip:"192.168.30.101", auth:"1812", acct:"1813", to:"5", retx:"3" },
                    ].map((row, i) => (
                      <tr key={i}>
                        <td><input defaultValue={row.ip} placeholder="192.168.1.200" /></td>
                        <td><input defaultValue={row.auth} style={{width:"60px"}} /></td>
                        <td><input defaultValue={row.acct} style={{width:"60px"}} /></td>
                        <td><input type="password" placeholder="••••••••" style={{width:"100px"}} /></td>
                        <td><input defaultValue={row.to} style={{width:"50px"}} /></td>
                        <td><input defaultValue={row.retx} style={{width:"50px"}} /></td>
                        <td>
                          <select>
                            <option>Primary</option><option>Secondary</option><option>Tertiary</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="inline-fields" style={{marginTop:"12px"}}>
                  <div className="input-wrap">
                    <span>RADIUS Source Interface</span>
                    <input defaultValue="Vlan30" />
                  </div>
                  <div className="input-wrap">
                    <span>Dead Criteria Time (sec)</span>
                    <input defaultValue="10" />
                  </div>
                  <div className="input-wrap">
                    <span>Dead Criteria Tries</span>
                    <input defaultValue="3" />
                  </div>
                </div>
                <div className="checkbox-wrap" style={{marginTop:"8px"}}>
                  <input type="checkbox" defaultChecked />
                  <span>Enable RADIUS server dead detection (automate failover)</span>
                </div>
              </div>
            )}

            {/* ── TACACS+ ── */}
            {activeAuthTab === "tacacs" && (
              <div className="config-group-mono">
                <label>TACACS+ Server Configuration</label>
                <table className="acl-table">
                  <thead>
                    <tr>
                      <th>Server IP</th><th>Port</th><th>Shared Secret</th>
                      <th>Timeout (sec)</th><th>Source Interface</th><th>Single Connection</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { ip:"192.168.30.110", port:"49" },
                      { ip:"192.168.30.111", port:"49" },
                    ].map((row, i) => (
                      <tr key={i}>
                        <td><input defaultValue={row.ip} /></td>
                        <td><input defaultValue={row.port} style={{width:"60px"}} /></td>
                        <td><input type="password" placeholder="••••••••" style={{width:"100px"}} /></td>
                        <td><input defaultValue="5" style={{width:"60px"}} /></td>
                        <td><input defaultValue="Vlan30" /></td>
                        <td style={{textAlign:"center"}}><input type="checkbox" defaultChecked /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="inline-fields" style={{marginTop:"12px"}}>
                  <div className="input-wrap">
                    <span>TACACS+ Group Name</span>
                    <input defaultValue="TACACS_SERVERS" />
                  </div>
                  <div className="input-wrap">
                    <span>Command Auth Level</span>
                    <select><option>Level 15</option><option>Level 1</option><option>All Levels</option></select>
                  </div>
                </div>
                <div className="checkbox-wrap" style={{marginTop:"8px"}}>
                  <input type="checkbox" defaultChecked />
                  <span>Use TACACS+ for exec command authorization</span>
                </div>
              </div>
            )}

            {/* ── 802.1X ── */}
            {activeAuthTab === "dot1x" && (
              <div className="config-group-mono">
                <label>802.1X Port-Based Network Access Control</label>
                <div className="inline-fields">
                  <div className="input-wrap">
                    <span>Global 802.1X</span>
                    <select><option>Enabled</option><option>Disabled</option></select>
                  </div>
                  <div className="input-wrap">
                    <span>System Auth Control</span>
                    <select><option>Enabled</option><option>Disabled</option></select>
                  </div>
                  <div className="input-wrap">
                    <span>Reauth Period (sec)</span>
                    <input defaultValue="3600" />
                  </div>
                </div>
                <table className="acl-table" style={{marginTop:"10px"}}>
                  <thead>
                    <tr>
                      <th>Interface</th><th>Host Mode</th><th>Auth Mode</th>
                      <th>Guest VLAN</th><th>Auth-Fail VLAN</th><th>Critical VLAN</th><th>MAB Fallback</th>
                    </tr>
                  </thead>
                  <tbody>
                    {["Fa0/1","Fa0/2","Fa0/3","Gi0/1"].map((port, i) => (
                      <tr key={i}>
                        <td>{port}</td>
                        <td>
                          <select>
                            <option>Single-Host</option><option>Multi-Host</option>
                            <option>Multi-Auth</option><option>Multi-Domain</option>
                          </select>
                        </td>
                        <td>
                          <select>
                            <option>Closed</option><option>Open</option><option>Monitor</option>
                          </select>
                        </td>
                        <td><input defaultValue="100" style={{width:"55px"}} /></td>
                        <td><input defaultValue="200" style={{width:"55px"}} /></td>
                        <td><input defaultValue="999" style={{width:"55px"}} /></td>
                        <td style={{textAlign:"center"}}><input type="checkbox" defaultChecked={i < 3} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="checkbox-wrap" style={{marginTop:"8px"}}>
                  <input type="checkbox" checked={dot1xGlobal} onChange={e => setDot1xGlobal(e.target.checked)} />
                  <span>Enable 802.1X globally</span>
                </div>
                <div className="checkbox-wrap">
                  <input type="checkbox" checked={dot1xForce} onChange={e => setDot1xForce(e.target.checked)} />
                  <span>Force authentication on all access ports</span>
                </div>
              </div>
            )}

            {/* ── AAA POLICY ── */}
            {activeAuthTab === "aaa" && (
              <div className="config-group-mono">
                <label>AAA Authentication, Authorization & Accounting</label>
                <table className="acl-table">
                  <thead>
                    <tr><th>AAA Service</th><th>Method List</th><th>Primary</th><th>Secondary</th><th>Fallback</th></tr>
                  </thead>
                  <tbody>
                    {[
                      { svc:"Authentication — Login",  ml:"default",    p:"RADIUS group", s:"TACACS+ group", fb:"Local" },
                      { svc:"Authentication — Enable", ml:"default",    p:"TACACS+ group",s:"RADIUS group",  fb:"Enable password" },
                      { svc:"Authorization — Exec",    ml:"default",    p:"TACACS+ group",s:"None",          fb:"Local" },
                      { svc:"Authorization — Commands",ml:"default",    p:"TACACS+ group",s:"None",          fb:"None" },
                      { svc:"Accounting — Exec",       ml:"default",    p:"RADIUS group", s:"TACACS+ group", fb:"None" },
                      { svc:"Accounting — Commands",   ml:"default",    p:"TACACS+ group",s:"None",          fb:"None" },
                    ].map((row, i) => (
                      <tr key={i}>
                        <td style={{fontSize:"12px"}}>{row.svc}</td>
                        <td><input defaultValue={row.ml} style={{width:"80px"}} /></td>
                        <td>
                          <select defaultValue={row.p}>
                            <option>RADIUS group</option><option>TACACS+ group</option><option>Local</option><option>None</option>
                          </select>
                        </td>
                        <td>
                          <select defaultValue={row.s}>
                            <option>RADIUS group</option><option>TACACS+ group</option><option>Local</option><option>None</option>
                          </select>
                        </td>
                        <td>
                          <select defaultValue={row.fb}>
                            <option>Local</option><option>Enable password</option><option>None</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="checkbox-wrap" style={{marginTop:"10px"}}>
                  <input type="checkbox" defaultChecked />
                  <span>Enable AAA new-model globally</span>
                </div>
              </div>
            )}

            {/* ── LOCAL USERS ── */}
            {activeAuthTab === "local" && (
              <div className="config-group-mono">
                <label>Local User Database (AAA Fallback)</label>
                <table className="acl-table">
                  <thead>
                    <tr>
                      <th>Username</th><th>Privilege Level</th><th>Password Type</th>
                      <th>Password</th><th>Role</th><th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { user:"admin",    priv:"15", type:"Secret (SHA256)", role:"Network-Admin" },
                      { user:"readonly", priv:"1",  type:"Secret (SHA256)", role:"Network-Operator" },
                      { user:"backup",   priv:"15", type:"Secret (SHA256)", role:"Network-Admin" },
                    ].map((row, i) => (
                      <tr key={i}>
                        <td><input defaultValue={row.user} /></td>
                        <td>
                          <select defaultValue={row.priv}>
                            {["0","1","2","7","15"].map(p => <option key={p}>{p}</option>)}
                          </select>
                        </td>
                        <td>
                          <select defaultValue={row.type}>
                            <option>Secret (SHA256)</option><option>Secret (MD5)</option><option>Password (clear)</option>
                          </select>
                        </td>
                        <td><input type="password" placeholder="••••••••" /></td>
                        <td><input defaultValue={row.role} /></td>
                        <td><select><option>Active</option><option>Disabled</option></select></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="checkbox-wrap" style={{marginTop:"10px"}}>
                  <input type="checkbox" defaultChecked />
                  <span>Enforce minimum password length of 12 characters</span>
                </div>
                <div className="checkbox-wrap">
                  <input type="checkbox" defaultChecked />
                  <span>Enable SSH login only (disable Telnet)</span>
                </div>
              </div>
            )}

          </div>

          <div className="modal-footer-clean">
            <button className="btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn-primary" onClick={handleApply}>Apply Authentication</button>
          </div>
        </div>

      </div>
    </div>,
    document.body
  );
}