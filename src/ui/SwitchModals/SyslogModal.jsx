import { useState } from "react";
import { createPortal } from "react-dom";
import { ServerIcon, Server, Activity, Filter, Radio, Eye } from "lucide-react";

export default function SyslogModal({ onClose, deviceName = "Switch", deviceLocation = "Network" }) {
  const [activeSyslogTab, setActiveSyslogTab] = useState("servers");

  const now = () => new Date().toISOString().replace("T", " ").slice(0, 19);

  const handleApply = () => {
    const ts = now();
    const dispatch = (message) =>
      window.dispatchEvent(new CustomEvent("add-system-log", { detail: { device: "Switch", deviceName, message, location: deviceLocation, italic: true } }));

    dispatch(`%SYSLOG-5-SERVER_CONFIG: [${ts}] ${deviceName} @ ${deviceLocation} — Remote syslog server destinations updated. UDP/TCP transport and target IPs committed to logging subsystem.`);
    dispatch(`%SYSLOG-6-SEVERITY_SET: [${ts}] ${deviceName} — Severity level filtering applied. Only messages at or above the configured level will be forwarded to remote collectors.`);
    dispatch(`%SPAN-5-SESSION_UPDATE: [${ts}] ${deviceName} — SPAN/RSPAN session configuration updated. Source and destination port mirror assignments re-evaluated.`);
    dispatch(`%SYSLOG-6-VLAN_FILTER: [${ts}] ${deviceName} — Per-VLAN event log filter rules applied. VLAN-specific log suppression and forwarding policies are now active.`);
    onClose();
  };

  return createPortal(
    <div className="config-modal-overlay syslog-modal-layer">
      <div className="config-modal-content nat-sidebar-layout">

        <div className="nat-sidebar">
          <div className="sidebar-header">
            <ServerIcon size={18} />
            <span>Logs / Syslog</span>
          </div>
          <div className="nav-list">
            {[
              { key:"servers",  icon:<Server size={16} />,   label:"Syslog Servers",   desc:"Remote logging endpoints" },
              { key:"severity", icon:<Filter size={16} />,   label:"Severity & Buffer", desc:"Level filtering & storage" },
              { key:"span",     icon:<Radio size={16} />,    label:"SPAN / RSPAN",      desc:"Port mirroring sessions" },
              { key:"filter",   icon:<Activity size={16} />, label:"VLAN Event Filter",  desc:"Per-VLAN log rules" },
              { key:"viewer",   icon:<Eye size={16} />,      label:"Log Viewer",        desc:"Live & buffered logs" },
            ].map(({ key, icon, label, desc }) => (
              <button key={key} className={`nav-item ${activeSyslogTab === key ? "active" : ""}`} onClick={() => setActiveSyslogTab(key)}>
                <div className="nav-icon">{icon}</div>
                <div className="nav-text"><strong>{label}</strong><p>{desc}</p></div>
              </button>
            ))}
          </div>
        </div>

        <div className="nat-main-content">
          <div className="modal-header-clean">
            <h3>Advanced Syslog Configuration</h3>
            <button className="close-btn-mono" onClick={onClose}>×</button>
          </div>

          <div className="config-body">

            {/* ── SYSLOG SERVERS ── */}
            {activeSyslogTab === "servers" && (
              <div className="config-group-mono">
                <label>Remote Syslog Servers</label>
                <table className="acl-table">
                  <thead>
                    <tr>
                      <th>Server IP</th><th>Port</th><th>Protocol</th>
                      <th>Severity Level</th><th>Format</th><th>VRF</th><th>Enabled</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { ip:"192.168.30.200", port:"514",  proto:"UDP", sev:"Informational", fmt:"CEF",  vrf:"default" },
                      { ip:"192.168.30.201", port:"6514", proto:"TCP", sev:"Warnings",      fmt:"JSON", vrf:"MGMT"    },
                    ].map((row, i) => (
                      <tr key={i}>
                        <td><input defaultValue={row.ip} /></td>
                        <td><input defaultValue={row.port} style={{width:"60px"}} /></td>
                        <td>
                          <select defaultValue={row.proto}>
                            <option>UDP</option><option>TCP</option><option>TLS</option>
                          </select>
                        </td>
                        <td>
                          <select defaultValue={row.sev}>
                            {["Emergencies (0)","Alerts (1)","Critical (2)","Errors (3)","Warnings (4)","Notifications (5)","Informational (6)","Debugging (7)"].map(s => <option key={s}>{s}</option>)}
                          </select>
                        </td>
                        <td>
                          <select defaultValue={row.fmt}>
                            <option>Plain Text</option><option>CEF</option><option>JSON</option><option>LEEF</option>
                          </select>
                        </td>
                        <td><input defaultValue={row.vrf} style={{width:"70px"}} /></td>
                        <td style={{textAlign:"center"}}><input type="checkbox" defaultChecked /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="inline-fields" style={{marginTop:"12px"}}>
                  <div className="input-wrap">
                    <span>Source Interface</span>
                    <input defaultValue="Vlan30" />
                  </div>
                  <div className="input-wrap">
                    <span>Rate Limit (msgs/sec)</span>
                    <input defaultValue="500" />
                  </div>
                  <div className="input-wrap">
                    <span>Syslog Facility</span>
                    <select>
                      <option>Local7 (default)</option><option>Local6</option><option>Local5</option>
                      <option>Local4</option><option>Daemon</option><option>Kern</option>
                    </select>
                  </div>
                </div>
                <div className="checkbox-wrap" style={{marginTop:"8px"}}>
                  <input type="checkbox" defaultChecked />
                  <span>Enable logging timestamps (datetime msec)</span>
                </div>
                <div className="checkbox-wrap">
                  <input type="checkbox" defaultChecked />
                  <span>Include sequence numbers in log messages</span>
                </div>
              </div>
            )}

            {/* ── SEVERITY & BUFFER ── */}
            {activeSyslogTab === "severity" && (
              <div className="config-group-mono">
                <label>Logging Destination Severity Levels</label>
                <table className="acl-table">
                  <thead>
                    <tr><th>Destination</th><th>Severity Level</th><th>Enabled</th></tr>
                  </thead>
                  <tbody>
                    {[
                      { dest:"Console",         sev:"Critical (2)"       },
                      { dest:"VTY (Telnet/SSH)", sev:"Warnings (4)"      },
                      { dest:"Buffer (RAM)",    sev:"Informational (6)"  },
                      { dest:"Monitor",         sev:"Debugging (7)"      },
                      { dest:"SNMP Trap",       sev:"Warnings (4)"       },
                    ].map((row, i) => (
                      <tr key={i}>
                        <td>{row.dest}</td>
                        <td>
                          <select defaultValue={row.sev}>
                            {["Emergencies (0)","Alerts (1)","Critical (2)","Errors (3)","Warnings (4)","Notifications (5)","Informational (6)","Debugging (7)"].map(s => <option key={s}>{s}</option>)}
                          </select>
                        </td>
                        <td style={{textAlign:"center"}}><input type="checkbox" defaultChecked /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="inline-fields" style={{marginTop:"12px"}}>
                  <div className="input-wrap">
                    <span>Buffer Size (bytes)</span>
                    <input defaultValue="8192" />
                  </div>
                  <div className="input-wrap">
                    <span>Buffer Severity</span>
                    <select>
                      {["Informational (6)","Warnings (4)","Debugging (7)"].map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="input-wrap">
                    <span>History Size (messages)</span>
                    <input defaultValue="200" />
                  </div>
                </div>
                <div className="checkbox-wrap" style={{marginTop:"8px"}}>
                  <input type="checkbox" defaultChecked />
                  <span>Enable logging on (global logging active)</span>
                </div>
                <div className="checkbox-wrap">
                  <input type="checkbox" />
                  <span>Enable logging buffered (RAM storage)</span>
                </div>
              </div>
            )}

            {/* ── SPAN / RSPAN ── */}
            {activeSyslogTab === "span" && (
              <div className="config-group-mono">
                <label>SPAN / RSPAN Port Mirroring Sessions</label>
                <table className="acl-table">
                  <thead>
                    <tr>
                      <th>Session</th><th>Type</th><th>Source Port / VLAN</th>
                      <th>Direction</th><th>Destination Port</th><th>RSPAN VLAN</th><th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { sess:"1", type:"SPAN",  src:"Fa0/1",   dir:"Both",    dst:"Fa0/24", rvlan:"—"   },
                      { sess:"2", type:"SPAN",  src:"VLAN 10", dir:"Rx Only", dst:"Fa0/23", rvlan:"—"   },
                      { sess:"3", type:"RSPAN", src:"Gi0/1",   dir:"Both",    dst:"—",      rvlan:"900" },
                    ].map((row, i) => (
                      <tr key={i}>
                        <td>{row.sess}</td>
                        <td>
                          <select defaultValue={row.type}>
                            <option>SPAN</option><option>RSPAN</option><option>ERSPAN</option>
                          </select>
                        </td>
                        <td><input defaultValue={row.src} /></td>
                        <td>
                          <select defaultValue={row.dir}>
                            <option>Both</option><option>Rx Only</option><option>Tx Only</option>
                          </select>
                        </td>
                        <td><input defaultValue={row.dst} /></td>
                        <td><input defaultValue={row.rvlan} style={{width:"60px"}} /></td>
                        <td><select><option>Active</option><option>Inactive</option></select></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="inline-fields" style={{marginTop:"12px"}}>
                  <div className="input-wrap">
                    <span>ERSPAN Destination IP</span>
                    <input placeholder="192.168.1.50" />
                  </div>
                  <div className="input-wrap">
                    <span>ERSPAN Session ID</span>
                    <input placeholder="1" />
                  </div>
                </div>
                <div className="checkbox-wrap" style={{marginTop:"8px"}}>
                  <input type="checkbox" defaultChecked />
                  <span>Allow ingress traffic on SPAN destination port</span>
                </div>
              </div>
            )}

            {/* ── VLAN EVENT FILTER ── */}
            {activeSyslogTab === "filter" && (
              <div className="config-group-mono">
                <label>Per-VLAN & Per-Feature Log Event Filter</label>
                <table className="acl-table">
                  <thead>
                    <tr>
                      <th>VLAN / Feature</th><th>STP Events</th><th>MAC Events</th>
                      <th>DHCP Events</th><th>Security Events</th><th>Severity Min</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { scope:"VLAN 10",       stp:true,  mac:true,  dhcp:true,  sec:true,  sev:"Informational (6)" },
                      { scope:"VLAN 20",       stp:true,  mac:false, dhcp:true,  sec:true,  sev:"Warnings (4)"      },
                      { scope:"VLAN 30",       stp:true,  mac:false, dhcp:false, sec:true,  sev:"Errors (3)"        },
                      { scope:"Port Security", stp:false, mac:true,  dhcp:false, sec:true,  sev:"Warnings (4)"      },
                      { scope:"DAI / IPSG",    stp:false, mac:false, dhcp:false, sec:true,  sev:"Errors (3)"        },
                    ].map((row, i) => (
                      <tr key={i}>
                        <td style={{fontSize:"12px"}}>{row.scope}</td>
                        <td style={{textAlign:"center"}}><input type="checkbox" defaultChecked={row.stp} /></td>
                        <td style={{textAlign:"center"}}><input type="checkbox" defaultChecked={row.mac} /></td>
                        <td style={{textAlign:"center"}}><input type="checkbox" defaultChecked={row.dhcp} /></td>
                        <td style={{textAlign:"center"}}><input type="checkbox" defaultChecked={row.sec} /></td>
                        <td>
                          <select defaultValue={row.sev}>
                            {["Emergencies (0)","Alerts (1)","Critical (2)","Errors (3)","Warnings (4)","Notifications (5)","Informational (6)","Debugging (7)"].map(s => <option key={s}>{s}</option>)}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="inline-fields" style={{marginTop:"12px"}}>
                  <div className="input-wrap">
                    <span>Export Format</span>
                    <select><option>CEF</option><option>JSON</option><option>Plain Text</option><option>LEEF</option></select>
                  </div>
                  <div className="input-wrap">
                    <span>Syslog Rate Limit (msg/sec)</span>
                    <input defaultValue="500" />
                  </div>
                </div>
              </div>
            )}

            {/* ── LOG VIEWER ── */}
            {activeSyslogTab === "viewer" && (
              <div className="config-group-mono">
                <label>Buffered Log Viewer</label>
                <table className="acl-table">
                  <thead>
                    <tr><th>Timestamp</th><th>Severity</th><th>Facility</th><th>Message</th></tr>
                  </thead>
                  <tbody>
                    {[
                      { ts:"May 04 09:12:03", sev:"WARN",  svc:"%LINK-3-UPDOWN",     msg:"Interface Gi0/3, changed state to down",          sc:"var(--color-text-warning)" },
                      { ts:"May 04 09:11:52", sev:"INFO",  svc:"%SYS-5-CONFIG_I",    msg:"Configured from console by admin",                 sc:"var(--color-text-secondary)" },
                      { ts:"May 04 09:10:41", sev:"ERROR", svc:"%PORT_SECURITY-2-PSECURE_VIOLATION", msg:"Violation on Fa0/3 by 00:DE:AD:BE:EF:00", sc:"var(--color-text-danger)" },
                      { ts:"May 04 09:09:30", sev:"INFO",  svc:"%DHCP_SNOOPING-4-DROP_REASON", msg:"DHCP packet dropped: untrusted port Fa0/2", sc:"var(--color-text-secondary)" },
                      { ts:"May 04 09:08:15", sev:"WARN",  svc:"%SPANTREE-2-RECV_PVID_ERR", msg:"Received 802.1Q BPDU on port Fa0/1 PVID 10", sc:"var(--color-text-warning)" },
                      { ts:"May 04 09:07:02", sev:"INFO",  svc:"%DOT1X-5-SUCCESS",   msg:"Authentication successful for 00:AA:BB:CC:DD:EE on Fa0/1", sc:"var(--color-text-success)" },
                    ].map((row, i) => (
                      <tr key={i}>
                        <td style={{fontFamily:"monospace",fontSize:"11px",whiteSpace:"nowrap"}}>{row.ts}</td>
                        <td style={{color:row.sc,fontWeight:600,fontSize:"11px"}}>{row.sev}</td>
                        <td style={{fontFamily:"monospace",fontSize:"10px",color:"var(--color-text-tertiary)"}}>{row.svc}</td>
                        <td style={{fontSize:"12px"}}>{row.msg}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="inline-fields" style={{marginTop:"12px"}}>
                  <div className="input-wrap">
                    <span>Filter Severity</span>
                    <select><option>All</option><option>Errors+</option><option>Warnings+</option><option>Info+</option></select>
                  </div>
                  <div className="input-wrap">
                    <span>Filter VLAN</span>
                    <input placeholder="10" />
                  </div>
                  <div className="input-wrap">
                    <span>Filter Keyword</span>
                    <input placeholder="Search logs..." />
                  </div>
                </div>
              </div>
            )}

          </div>

          <div className="modal-footer-clean">
            <button className="btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn-primary" onClick={handleApply}>Apply Syslog</button>
          </div>
        </div>

      </div>
    </div>,
    document.body
  );
}