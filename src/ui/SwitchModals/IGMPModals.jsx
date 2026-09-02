import { useState } from "react";
import { createPortal } from "react-dom";
import { Layers, Network, Server, Activity, Radio } from "lucide-react";

export default function IGMPModals({ onClose, deviceName = "Switch", deviceLocation = "Network" }) {
  const [activeIGMPTab, setActiveIGMPTab] = useState("snooping");

  const [igmpEnabled, setIgmpEnabled] = useState(true);
  const [fastLeave, setFastLeave] = useState(false);
  const [querierIP, setQuerierIP] = useState("192.168.10.1");
  const [queryInterval, setQueryInterval] = useState("125");

  const now = () => new Date().toISOString().replace("T", " ").slice(0, 19);

  const handleApply = () => {
    const ts = now();
    const dispatch = (message) =>
      window.dispatchEvent(new CustomEvent("add-system-log", { detail: { device: "Switch", deviceName, message, location: deviceLocation, italic: true } }));

    dispatch(`%IGMP-5-SNOOP_GLOBAL: [${ts}] ${deviceName} @ ${deviceLocation} — IGMP Snooping global state: ${igmpEnabled ? "ENABLED" : "DISABLED"}. Per-VLAN multicast forwarding tables will be ${igmpEnabled ? "maintained" : "cleared"}.`);
    dispatch(`%IGMP-6-FAST_LEAVE: [${ts}] ${deviceName} — Fast Leave processing: ${fastLeave ? "ENABLED" : "DISABLED"}. ${fastLeave ? "Ports will be immediately removed from multicast groups on IGMP Leave receipt." : "Leave latency governed by last-member query interval."}`);
    dispatch(`%IGMP-5-QUERIER_SET: [${ts}] ${deviceName} — IGMP Querier configured at ${querierIP}. General query interval: ${queryInterval}s. Querier will send membership queries to maintain group state.`);
    dispatch(`%IGMP-6-MROUTER_PORT: [${ts}] ${deviceName} — Multicast router port designations updated. Static and dynamic mrouter ports will forward all IGMP reports upstream.`);
    dispatch(`%IGMP-6-GROUP_LIMITS: [${ts}] ${deviceName} — Per-port group limits and membership timeout values committed. Excess group join attempts beyond the configured maximum will be dropped.`);
    onClose();
  };

  return createPortal(
    <div className="config-modal-overlay igmp-modal-layer">
      <div className="config-modal-content nat-sidebar-layout">

        <div className="nat-sidebar">
          <div className="sidebar-header">
            <Layers size={18} />
            <span>IGMP Snooping</span>
          </div>
          <div className="nav-list">
            {[
              { key:"snooping",  icon:<Network size={16} />,  label:"Snooping",        desc:"Multicast optimization" },
              { key:"querier",   icon:<Server size={16} />,   label:"Querier",         desc:"IGMP query management" },
              { key:"mrouter",   icon:<Radio size={16} />,    label:"Mrouter Ports",   desc:"Multicast router uplinks" },
              { key:"groups",    icon:<Layers size={16} />,   label:"Group Table",     desc:"Active multicast groups" },
              { key:"stats",     icon:<Activity size={16} />, label:"Statistics",      desc:"Snooping counters" },
            ].map(({ key, icon, label, desc }) => (
              <button key={key} className={`nav-item ${activeIGMPTab === key ? "active" : ""}`} onClick={() => setActiveIGMPTab(key)}>
                <div className="nav-icon">{icon}</div>
                <div className="nav-text"><strong>{label}</strong><p>{desc}</p></div>
              </button>
            ))}
          </div>
        </div>

        <div className="nat-main-content">
          <div className="modal-header-clean">
            <h3>Advanced IGMP Snooping</h3>
            <button className="close-btn-mono" onClick={onClose}>×</button>
          </div>

          <div className="config-body">

            {/* ── SNOOPING ── */}
            {activeIGMPTab === "snooping" && (
              <div className="config-group-mono">
                <label>IGMP Snooping — Per-VLAN Configuration</label>
                <table className="acl-table">
                  <thead>
                    <tr>
                      <th>VLAN</th><th>Snooping</th><th>IGMP Version</th>
                      <th>Fast Leave</th><th>Report Suppression</th><th>TCN Flood</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { vlan:"10", enabled:true,  ver:"v2", fl:false, rs:true,  tcn:false },
                      { vlan:"20", enabled:true,  ver:"v3", fl:true,  rs:true,  tcn:false },
                      { vlan:"30", enabled:true,  ver:"v2", fl:false, rs:false, tcn:true  },
                      { vlan:"99", enabled:false, ver:"v2", fl:false, rs:false, tcn:false },
                    ].map((row, i) => (
                      <tr key={i}>
                        <td><strong>VLAN {row.vlan}</strong></td>
                        <td style={{textAlign:"center"}}>
                          <input type="checkbox" defaultChecked={row.enabled}
                            onChange={i===0 ? e => setIgmpEnabled(e.target.checked) : undefined} />
                        </td>
                        <td>
                          <select defaultValue={row.ver}>
                            <option>v1</option><option>v2</option><option>v3</option>
                          </select>
                        </td>
                        <td style={{textAlign:"center"}}>
                          <input type="checkbox" defaultChecked={row.fl}
                            onChange={i===0 ? e => setFastLeave(e.target.checked) : undefined} />
                        </td>
                        <td style={{textAlign:"center"}}><input type="checkbox" defaultChecked={row.rs} /></td>
                        <td style={{textAlign:"center"}}><input type="checkbox" defaultChecked={row.tcn} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="inline-fields" style={{marginTop:"12px"}}>
                  <div className="input-wrap">
                    <span>Max Groups per Port</span>
                    <input defaultValue="256" />
                  </div>
                  <div className="input-wrap">
                    <span>Group Membership Timeout (sec)</span>
                    <input defaultValue="260" />
                  </div>
                </div>
                <div className="checkbox-wrap" style={{marginTop:"8px"}}>
                  <input type="checkbox" defaultChecked />
                  <span>Enable IGMP snooping globally</span>
                </div>
              </div>
            )}

            {/* ── QUERIER ── */}
            {activeIGMPTab === "querier" && (
              <div className="config-group-mono">
                <label>IGMP Querier Configuration — Per-VLAN</label>
                <table className="acl-table">
                  <thead>
                    <tr>
                      <th>VLAN</th><th>Querier Enabled</th><th>Querier IP</th><th>IGMP Version</th>
                      <th>Query Interval (sec)</th><th>Max Response Time (sec)</th><th>Querier Timeout (sec)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { vlan:"10", en:true,  ip:"10.10.10.1", ver:"v2", qi:"125", mrt:"10", qt:"255" },
                      { vlan:"20", en:true,  ip:"10.10.20.1", ver:"v3", qi:"125", mrt:"10", qt:"255" },
                      { vlan:"30", en:false, ip:"",           ver:"v2", qi:"125", mrt:"10", qt:"255" },
                    ].map((row, i) => (
                      <tr key={i}>
                        <td><strong>VLAN {row.vlan}</strong></td>
                        <td style={{textAlign:"center"}}><input type="checkbox" defaultChecked={row.en} /></td>
                        <td>
                          <input defaultValue={row.ip || querierIP}
                            onChange={i===0 ? e => setQuerierIP(e.target.value) : undefined}
                            placeholder="192.168.x.1" />
                        </td>
                        <td>
                          <select defaultValue={row.ver}>
                            <option>v1</option><option>v2</option><option>v3</option>
                          </select>
                        </td>
                        <td>
                          <input defaultValue={row.qi}
                            onChange={i===0 ? e => setQueryInterval(e.target.value) : undefined}
                            style={{width:"60px"}} />
                        </td>
                        <td><input defaultValue={row.mrt} style={{width:"60px"}} /></td>
                        <td><input defaultValue={row.qt} style={{width:"60px"}} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="inline-fields" style={{marginTop:"12px"}}>
                  <div className="input-wrap">
                    <span>TCN Query Count</span>
                    <input defaultValue="2" />
                  </div>
                  <div className="input-wrap">
                    <span>TCN Query Interval (sec)</span>
                    <input defaultValue="10" />
                  </div>
                </div>
              </div>
            )}

            {/* ── MROUTER PORTS ── */}
            {activeIGMPTab === "mrouter" && (
              <div className="config-group-mono">
                <label>Multicast Router Port Designation</label>
                <table className="acl-table">
                  <thead>
                    <tr>
                      <th>VLAN</th><th>Interface</th><th>Type</th><th>Expires</th><th>Static</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { vlan:"10", iface:"Gi0/1", type:"Dynamic (PIMv2)", expires:"00:04:58", static:false },
                      { vlan:"10", iface:"Gi0/2", type:"Dynamic (PIMv2)", expires:"00:04:22", static:false },
                      { vlan:"20", iface:"Gi0/1", type:"Static",          expires:"Never",    static:true  },
                      { vlan:"30", iface:"Gi0/1", type:"Dynamic (PIMv2)", expires:"00:03:47", static:false },
                    ].map((row, i) => (
                      <tr key={i}>
                        <td>VLAN {row.vlan}</td>
                        <td>{row.iface}</td>
                        <td style={{fontSize:"12px"}}>{row.type}</td>
                        <td style={{fontFamily:"monospace",fontSize:"12px"}}>{row.expires}</td>
                        <td style={{textAlign:"center"}}><input type="checkbox" defaultChecked={row.static} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <label style={{marginTop:"14px"}}>Add Static Mrouter Port</label>
                <div className="inline-fields">
                  <div className="input-wrap"><span>VLAN</span><input placeholder="10" /></div>
                  <div className="input-wrap"><span>Interface</span><input placeholder="Gi0/1" /></div>
                </div>
              </div>
            )}

            {/* ── GROUP TABLE ── */}
            {activeIGMPTab === "groups" && (
              <div className="config-group-mono">
                <label>Active Multicast Group Table</label>
                <table className="acl-table">
                  <thead>
                    <tr>
                      <th>VLAN</th><th>Group Address</th><th>Source (SSM)</th>
                      <th>Member Ports</th><th>Expires</th><th>Filter Mode</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { vlan:"10", grp:"239.1.1.1",  src:"*",             ports:"Fa0/1, Fa0/2", exp:"00:02:46", mode:"EXCLUDE" },
                      { vlan:"10", grp:"239.1.1.2",  src:"10.10.10.50",   ports:"Fa0/1",        exp:"00:01:18", mode:"INCLUDE" },
                      { vlan:"20", grp:"239.2.1.1",  src:"*",             ports:"Fa0/3",        exp:"00:04:02", mode:"EXCLUDE" },
                      { vlan:"30", grp:"224.0.1.129",src:"*",             ports:"Gi0/1",        exp:"Never",    mode:"EXCLUDE" },
                    ].map((row, i) => (
                      <tr key={i}>
                        <td>VLAN {row.vlan}</td>
                        <td style={{fontFamily:"monospace",fontSize:"12px"}}>{row.grp}</td>
                        <td style={{fontFamily:"monospace",fontSize:"12px"}}>{row.src}</td>
                        <td style={{fontSize:"12px"}}>{row.ports}</td>
                        <td style={{fontFamily:"monospace",fontSize:"12px"}}>{row.exp}</td>
                        <td style={{color: row.mode==="INCLUDE" ? "var(--color-text-success)" : "var(--color-text-secondary)", fontSize:"12px"}}>{row.mode}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="inline-fields" style={{marginTop:"12px"}}>
                  <div className="input-wrap">
                    <span>Max Groups (global)</span>
                    <input defaultValue="1024" />
                  </div>
                  <div className="input-wrap">
                    <span>Max Sources per Group</span>
                    <input defaultValue="32" />
                  </div>
                </div>
              </div>
            )}

            {/* ── STATISTICS ── */}
            {activeIGMPTab === "stats" && (
              <div className="config-group-mono">
                <label>IGMP Snooping Statistics</label>
                <table className="acl-table">
                  <thead>
                    <tr>
                      <th>VLAN</th><th>Joins Rx</th><th>Leaves Rx</th><th>Queries Tx</th>
                      <th>Reports Suppressed</th><th>Active Groups</th><th>Mrouter Ports</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { vlan:"10", joins:"1,842", leaves:"324", qtx:"148", supp:"3,241", grps:"12", mrt:"2" },
                      { vlan:"20", joins:"541",   leaves:"87",  qtx:"148", supp:"801",   grps:"4",  mrt:"1" },
                      { vlan:"30", joins:"21",    leaves:"3",   qtx:"148", supp:"88",    grps:"1",  mrt:"1" },
                    ].map((row, i) => (
                      <tr key={i}>
                        <td>VLAN {row.vlan}</td>
                        <td>{row.joins}</td><td>{row.leaves}</td><td>{row.qtx}</td>
                        <td>{row.supp}</td>
                        <td style={{color:"var(--color-text-success)",fontWeight:600}}>{row.grps}</td>
                        <td>{row.mrt}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="inline-fields" style={{marginTop:"12px"}}>
                  <div className="input-wrap"><span>Total Active Groups</span><input readOnly defaultValue="17" /></div>
                  <div className="input-wrap"><span>Total Joins Received</span><input readOnly defaultValue="2,404" /></div>
                </div>
              </div>
            )}

          </div>

          <div className="modal-footer-clean">
            <button className="btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn-primary" onClick={handleApply}>Apply IGMP</button>
          </div>
        </div>

      </div>
    </div>,
    document.body
  );
}