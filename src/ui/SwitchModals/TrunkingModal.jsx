// import { useState } from "react";
// import { createPortal } from "react-dom";
// import { ArrowLeftRight, Network, Cable, GitBranch, Activity, Layers } from "lucide-react";

// export default function Trunking({ onClose, deviceName = "Switch", deviceLocation = "Network", device = null }) {
//   const [activeTrunkTab, setActiveTrunkTab] = useState("config");

//   const now = () => new Date().toISOString().replace("T", " ").slice(0, 19);

//   const handleApply = () => {
//     const ts = now();
//     const dispatch = (message) =>
//       window.dispatchEvent(new CustomEvent("add-system-log", { detail: { device: "Switch", deviceName, message, location: deviceLocation, italic: true } }));

//     if (device?.configureTrunkPort) {
//       ['Gi0/1', 'Gi0/2'].forEach(iface => {
//         device.configureTrunkPort(iface, {
//           nativeVlan: 99,
//           allowedVlans: [10, 20, 30, 99],
//           tagNativeFrames: true,
//         });
//       });
//     }

//     dispatch(`%TRUNK-5-8021Q_CONFIG: [${ts}] ${deviceName} @ ${deviceLocation} — 802.1Q trunk port configuration applied. Native VLAN, allowed VLAN list, and DTP mode updated on trunk interfaces.`);
//     dispatch(`%TRUNK-6-ETHERCHANNEL: [${ts}] ${deviceName} — EtherChannel (LACP/PAgP) bundle parameters committed. Port-channel load-balancing algorithm re-evaluated.`);
//     dispatch(`%VTP-5-DOMAIN_SET: [${ts}] ${deviceName} — VTP domain, mode, and pruning configuration applied. VTP summary advertisement will be sent on next hello interval.`);
//     dispatch(`%TRUNK-6-VLAN_TRANSLATE: [${ts}] ${deviceName} — VLAN translation and rewrite maps updated. Ingress/egress VLAN tag rewriting active on configured interfaces.`);
//     onClose();
//   };

//   return createPortal(
//     <div className="config-modal-overlay trunk-modal-layer">
//       <div className="config-modal-content nat-sidebar-layout">

//         <div className="nat-sidebar">
//           <div className="sidebar-header">
//             <ArrowLeftRight size={18} />
//             <span>VLAN Trunking</span>
//           </div>
//           <div className="nav-list">
//             {[
//               { key:"config",       icon:<Network size={16} />,      label:"Trunk Config",    desc:"802.1Q uplink settings" },
//               { key:"etherchannel", icon:<Cable size={16} />,        label:"EtherChannel",    desc:"LACP / PAgP bonding" },
//               { key:"vtp",          icon:<GitBranch size={16} />,    label:"VTP",             desc:"VLAN Trunking Protocol" },
//               { key:"vlantranslate",icon:<Layers size={16} />,       label:"VLAN Translation",desc:"VLAN mapping & rewrite" },
//               { key:"monitor",      icon:<Activity size={16} />,     label:"Trunk Monitor",   desc:"Uplink health & stats" },
//             ].map(({ key, icon, label, desc }) => (
//               <button key={key} className={`nav-item ${activeTrunkTab === key ? "active" : ""}`} onClick={() => setActiveTrunkTab(key)}>
//                 <div className="nav-icon">{icon}</div>
//                 <div className="nav-text"><strong>{label}</strong><p>{desc}</p></div>
//               </button>
//             ))}
//           </div>
//         </div>

//         <div className="nat-main-content">
//           <div className="modal-header-clean">
//             <h3>Advanced VLAN Trunking Configuration</h3>
//             <button className="close-btn-mono" onClick={onClose}>×</button>
//           </div>

//           <div className="config-body">

//             {/* ── TRUNK CONFIG ── */}
//             {activeTrunkTab === "config" && (
//               <div className="config-group-mono">
//                 <label>802.1Q Trunk Configuration</label>
//                 <div className="trunk-list">
//                   {["Gi0/1","Gi0/2","Po1 (Port-Channel)"].map((iface, i) => (
//                     <div key={i} className="trunk-card" style={{padding:12,border:"1px solid var(--color-border)",borderRadius:8,marginBottom:8}}>
//                       <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
//                         <strong>{iface}</strong>
//                         <div style={{display:"flex",gap:12,alignItems:"center"}}>
//                           <select>
//                             <option>802.1Q</option><option>ISL (Legacy)</option><option>Negotiate</option>
//                           </select>
//                           <input placeholder="99" defaultValue="99" />
//                           <input placeholder="10,20,30,99" defaultValue="10,20,30,99" style={{width:180}} />
//                           <select>
//                             <option>Trunk (Force)</option><option>Dynamic Auto</option>
//                             <option>Dynamic Desirable</option><option>Nonegotiate</option>
//                           </select>
//                           <select>
//                             <option>Up</option><option>Down</option><option>Shutdown</option>
//                           </select>
//                         </div>
//                       </div>
//                     </div>
//                   ))}
//                 </div>
//                 <div className="inline-fields" style={{marginTop:"12px"}}>
//                   <div className="input-wrap">
//                     <span>Pruning Eligible VLANs</span>
//                     <input defaultValue="2-1001" />
//                   </div>
//                   <div className="input-wrap">
//                     <span>Storm Control Threshold</span>
//                     <input defaultValue="10%" />
//                   </div>
//                   <div className="input-wrap">
//                     <span>Storm Control Action</span>
//                     <select><option>Drop</option><option>Shutdown</option><option>Trap</option></select>
//                   </div>
//                 </div>
//                 <div className="checkbox-wrap"><input type="checkbox" defaultChecked /><span>Enable DTP negotiation on uplinks</span></div>
//                 <div className="checkbox-wrap"><input type="checkbox" /><span>Restrict unused VLANs on trunk</span></div>
//                 <div className="checkbox-wrap"><input type="checkbox" defaultChecked /><span>Tag native VLAN frames (802.1Q strict mode)</span></div>
//                 <div className="checkbox-wrap"><input type="checkbox" /><span>Enable VLAN pruning on trunk interfaces</span></div>
//               </div>
//             )}

//             {/* ── ETHERCHANNEL ── */}
//             {activeTrunkTab === "etherchannel" && (
//               <div className="config-group-mono">
//                 <label>EtherChannel / Port-Channel Configuration</label>
//                 <div className="po-list">
//                   {[
//                     { po:"Po1", members:"Gi0/1, Gi0/2" },
//                     { po:"Po2", members:"Gi0/3, Gi0/4" },
//                   ].map((row, i) => (
//                     <div key={i} className="po-card" style={{padding:12,border:"1px solid var(--color-border)",borderRadius:8,marginBottom:8}}>
//                       <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
//                         <strong>{row.po}</strong>
//                         <div style={{display:"flex",gap:12,alignItems:"center"}}>
//                           <input defaultValue={row.members} style={{width:220}} />
//                           <select>
//                             <option>LACP (802.3ad)</option><option>PAgP (Cisco)</option><option>Static (On)</option>
//                           </select>
//                           <select>
//                             <option>Active (LACP)</option><option>Passive (LACP)</option>
//                             <option>Desirable (PAgP)</option><option>Auto (PAgP)</option><option>On (Static)</option>
//                           </select>
//                           <select>
//                             <option>src-dst-mac</option><option>src-dst-ip</option>
//                             <option>src-dst-port</option><option>src-mac</option><option>dst-mac</option>
//                           </select>
//                           <input defaultValue="1" style={{width:50}} />
//                           <select><option>Up</option><option>Down</option></select>
//                         </div>
//                       </div>
//                     </div>
//                   ))}
//                 </div>
//                 <div className="inline-fields" style={{marginTop:"12px"}}>
//                   <div className="input-wrap"><span>LACP System Priority</span><input defaultValue="32768" /></div>
//                   <div className="input-wrap"><span>LACP Port Priority</span><input defaultValue="32768" /></div>
//                   <div className="input-wrap">
//                     <span>LACP Rate</span>
//                     <select><option>Normal (30 sec)</option><option>Fast (1 sec)</option></select>
//                   </div>
//                 </div>
//                 <div className="checkbox-wrap"><input type="checkbox" defaultChecked /><span>Enable LACP fast timers on uplink ports</span></div>
//                 <div className="checkbox-wrap"><input type="checkbox" /><span>Enable graceful convergence on member link failure</span></div>
//               </div>
//             )}

//             {/* ── VTP ── */}
//             {activeTrunkTab === "vtp" && (
//               <div className="config-group-mono">
//                 <label>VLAN Trunking Protocol (VTP)</label>
//                 <div className="inline-fields">
//                   <div className="input-wrap"><span>VTP Domain</span><input defaultValue="CORP_DOMAIN" /></div>
//                   <div className="input-wrap">
//                     <span>VTP Mode</span>
//                     <select><option>Server</option><option>Client</option><option>Transparent</option><option>Off (VTPv3)</option></select>
//                   </div>
//                   <div className="input-wrap">
//                     <span>VTP Version</span>
//                     <select><option>3</option><option>2</option><option>1</option></select>
//                   </div>
//                 </div>
//                 <div className="inline-fields">
//                   <div className="input-wrap"><span>VTP Password</span><input type="password" placeholder="••••••••" /></div>
//                   <div className="input-wrap"><span>Config Revision</span><input defaultValue="0 (read-only)" readOnly /></div>
//                   <div className="input-wrap"><span>Primary Server (VTPv3)</span><input defaultValue="192.168.1.1" /></div>
//                 </div>
//                   <div className="vtp-trunks" style={{marginTop:12}}>
//                     {['Gi0/1','Gi0/2','Po1'].map((iface, i) => (
//                       <div key={i} style={{display:"flex",gap:12,alignItems:"center",padding:10,border:"1px solid var(--color-border)",borderRadius:8,marginBottom:8}}>
//                         <div style={{width:120}}><strong>{iface}</strong></div>
//                         <select><option>Enabled</option><option>Disabled</option></select>
//                         <input defaultValue="2-1001" />
//                         <div style={{color:"var(--color-text-secondary)",fontSize:12}}>None</div>
//                       </div>
//                     ))}
//                   </div>
//                 <div className="checkbox-wrap" style={{marginTop:"12px"}}><input type="checkbox" defaultChecked /><span>Enable VTP pruning</span></div>
//                 <div className="checkbox-wrap"><input type="checkbox" /><span>Enable VTP MD5 password authentication</span></div>
//               </div>
//             )}

//             {/* ── VLAN TRANSLATION ── */}
//             {activeTrunkTab === "vlantranslate" && (
//               <div className="config-group-mono">
//                 <label>VLAN Mapping / Translation Table</label>
//                 <table className="acl-table">
//                   <thead>
//                     <tr>
//                       <th>Interface</th>
//                       <th>Original VLAN (Inner)</th>
//                       <th>Translated VLAN (Outer)</th>
//                       <th>Direction</th>
//                       <th>Mode</th>
//                       <th>Status</th>
//                     </tr>
//                   </thead>
//                   <tbody>
//                     {[
//                       { iface:"Gi0/1", orig:"10",  xlat:"110", dir:"Both",    mode:"1-to-1" },
//                       { iface:"Gi0/1", orig:"20",  xlat:"220", dir:"Ingress", mode:"1-to-1" },
//                       { iface:"Gi0/2", orig:"100", xlat:"10",  dir:"Both",    mode:"QinQ"   },
//                     ].map((row, i) => (
//                       <tr key={i}>
//                         <td>{row.iface}</td>
//                         <td><input defaultValue={row.orig} style={{width:"80px"}} /></td>
//                         <td><input defaultValue={row.xlat} style={{width:"80px"}} /></td>
//                         <td>
//                           <select defaultValue={row.dir}>
//                             <option>Both</option><option>Ingress</option><option>Egress</option>
//                           </select>
//                         </td>
//                         <td>
//                           <select defaultValue={row.mode}>
//                             <option>1-to-1</option><option>QinQ (802.1ad)</option><option>Selective</option>
//                           </select>
//                         </td>
//                         <td><select><option>Active</option><option>Inactive</option></select></td>
//                       </tr>
//                     ))}
//                   </tbody>
//                 </table>
//                 <div className="inline-fields" style={{marginTop:"12px"}}>
//                   <div className="input-wrap">
//                     <span>S-VLAN Ethertype (QinQ)</span>
//                     <select><option>0x8100 (Default)</option><option>0x88A8 (802.1ad)</option><option>0x9100</option></select>
//                   </div>
//                 </div>
//                 <div className="checkbox-wrap" style={{marginTop:"8px"}}><input type="checkbox" defaultChecked /><span>Enable VLAN translation on this interface</span></div>
//               </div>
//             )}

//             {/* ── TRUNK MONITOR ── */}
//             {activeTrunkTab === "monitor" && (
//               <div className="config-group-mono">
//                 <label>Trunk Uplink Health & Statistics</label>
//                 <table className="acl-table">
//                   <thead>
//                     <tr>
//                       <th>Interface</th><th>Oper Mode</th><th>Encap</th><th>Native VLAN</th>
//                       <th>VLANs Active</th><th>Rx Frames</th><th>Tx Frames</th><th>Link Status</th>
//                     </tr>
//                   </thead>
//                   <tbody>
//                     {[
//                       { iface:"Gi0/1", mode:"Trunk",  native:"99", vlans:"10,20,30,99", rx:"4,821,003", tx:"3,997,221", status:"Up",   sc:"var(--color-text-success)" },
//                       { iface:"Gi0/2", mode:"Trunk",  native:"99", vlans:"10,20,30,99", rx:"3,102,887", tx:"2,874,550", status:"Up",   sc:"var(--color-text-success)" },
//                       { iface:"Po1",   mode:"Trunk",  native:"99", vlans:"10,20,30,99", rx:"7,923,890", tx:"6,871,771", status:"Up",   sc:"var(--color-text-success)" },
//                       { iface:"Gi0/3", mode:"Access", native:"—",  vlans:"—",           rx:"201,443",   tx:"198,002",   status:"Down", sc:"var(--color-text-danger)"  },
//                     ].map((row, i) => (
//                       <tr key={i}>
//                         <td><strong>{row.iface}</strong></td>
//                         <td>{row.mode}</td><td>802.1Q</td><td>{row.native}</td>
//                         <td style={{fontSize:"11px"}}>{row.vlans}</td>
//                         <td>{row.rx}</td><td>{row.tx}</td>
//                         <td style={{color:row.sc,fontWeight:600}}>{row.status}</td>
//                       </tr>
//                     ))}
//                   </tbody>
//                 </table>
//                 <div className="inline-fields" style={{marginTop:"12px"}}>
//                   <div className="input-wrap">
//                     <span>SPAN Source Trunk</span>
//                     <select><option>Gi0/1</option><option>Gi0/2</option><option>Po1</option></select>
//                   </div>
//                   <div className="input-wrap"><span>SPAN Destination Port</span><input defaultValue="Fa0/24" /></div>
//                   <div className="input-wrap">
//                     <span>Poll Interval</span>
//                     <select><option>30 sec</option><option>60 sec</option><option>5 min</option></select>
//                   </div>
//                 </div>
//               </div>
//             )}

//           </div>

//           <div className="modal-footer-clean">
//             <button className="btn-secondary" onClick={onClose}>Cancel</button>
//             <button className="btn-primary" onClick={handleApply}>Apply Trunking Config</button>
//           </div>
//         </div>

//       </div>
//     </div>,
//     document.body
//   );
// }
//     </div>,
//     document.body
//   );
// }

import { useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeftRight, Network, Cable, GitBranch, Activity, Layers } from "lucide-react";

export default function Trunking({ onClose, deviceName = "Switch", deviceLocation = "Network" }) {
  const [activeTrunkTab, setActiveTrunkTab] = useState("config");

  // ── Trunk Config state ──────────────────────────────────────────────────
  const [trunkIface, setTrunkIface] = useState("Gi0/1");
  const [trunkEncap, setTrunkEncap] = useState("802.1Q");
  const [trunkNative, setTrunkNative] = useState("99");
  const [trunkAllowed, setTrunkAllowed] = useState("10,20,30,99");
  const [trunkDtp, setTrunkDtp] = useState("Trunk (Force)");
  const [trunkStatus, setTrunkStatus] = useState("Up");
  const [pruneVlans, setPruneVlans] = useState("2-1001");
  const [stormThreshold, setStormThreshold] = useState("10%");
  const [stormAction, setStormAction] = useState("Drop");
  const [dtpNegotiation, setDtpNegotiation] = useState(true);
  const [tagNative, setTagNative] = useState(true);
  const [vlanPruning, setVlanPruning] = useState(false);

  // ── EtherChannel state ──────────────────────────────────────────────────
  const [poName, setPoName] = useState("Po1");
  const [poMembers, setPoMembers] = useState("Gi0/1, Gi0/2");
  const [poProtocol, setPoProtocol] = useState("LACP (802.3ad)");
  const [poMode, setPoMode] = useState("Active (LACP)");
  const [poBalance, setPoBalance] = useState("src-dst-mac");
  const [poMinLinks, setPoMinLinks] = useState("1");
  const [poStatus, setPoStatus] = useState("Up");
  const [lacpSysPri, setLacpSysPri] = useState("32768");
  const [lacpPortPri, setLacpPortPri] = useState("32768");
  const [lacpRate, setLacpRate] = useState("Normal (30 sec)");
  const [lacpFast, setLacpFast] = useState(true);
  const [lacpGraceful, setLacpGraceful] = useState(false);

  // ── VTP state ───────────────────────────────────────────────────────────
  const [vtpDomain, setVtpDomain] = useState("CORP_DOMAIN");
  const [vtpMode, setVtpMode] = useState("Server");
  const [vtpVersion, setVtpVersion] = useState("3");
  const [vtpPassword, setVtpPassword] = useState("");
  const [vtpPrimary, setVtpPrimary] = useState("192.168.1.1");
  const [vtpPruning, setVtpPruning] = useState(true);
  const [vtpMd5, setVtpMd5] = useState(false);

  // ── VLAN Translation state ──────────────────────────────────────────────
  const [xlatIface, setXlatIface] = useState("Gi0/1");
  const [xlatOrig, setXlatOrig] = useState("");
  const [xlatNew, setXlatNew] = useState("");
  const [xlatDir, setXlatDir] = useState("Both");
  const [xlatMode, setXlatMode] = useState("1-to-1");
  const [xlatEther, setXlatEther] = useState("0x8100 (Default)");
  const [xlatEnabled, setXlatEnabled] = useState(true);

  // ── Trunk Monitor state ─────────────────────────────────────────────────
  const [spanSource, setSpanSource] = useState("Gi0/1");
  const [spanDest, setSpanDest] = useState("Fa0/24");
  const [spanPoll, setSpanPoll] = useState("30 sec");

  const now = () => new Date().toISOString().replace("T", " ").slice(0, 19);

  const handleApply = () => {
    const ts = now();
    const dispatch = (message) =>
      window.dispatchEvent(new CustomEvent("add-system-log", { detail: { device: "Switch", deviceName, message, location: deviceLocation, italic: true } }));

    dispatch(`%TRUNK-5-8021Q_CONFIG: [${ts}] ${deviceName} @ ${deviceLocation} — 802.1Q trunk port configuration applied. Native VLAN, allowed VLAN list, and DTP mode updated on trunk interfaces.`);
    dispatch(`%TRUNK-6-ETHERCHANNEL: [${ts}] ${deviceName} — EtherChannel (LACP/PAgP) bundle parameters committed. Port-channel load-balancing algorithm re-evaluated.`);
    dispatch(`%VTP-5-DOMAIN_SET: [${ts}] ${deviceName} — VTP domain, mode, and pruning configuration applied. VTP summary advertisement will be sent on next hello interval.`);
    dispatch(`%TRUNK-6-VLAN_TRANSLATE: [${ts}] ${deviceName} — VLAN translation and rewrite maps updated. Ingress/egress VLAN tag rewriting active on configured interfaces.`);
    onClose();
  };

  const TAB_TITLES = {
    config: "TRUNK CONFIGURATION", etherchannel: "ETHERCHANNEL",
    vtp: "VTP SETTINGS", vlantranslate: "VLAN TRANSLATION", monitor: "TRUNK MONITOR",
  };

  return createPortal(
    <div className="config-modal-overlay trunk-modal-layer">
      <div className="config-modal-content nat-sidebar-layout">

        <div className="nat-sidebar">
          <div className="sidebar-header">
            <ArrowLeftRight size={18} />
            <span>VLAN Trunking</span>
          </div>
          <div className="nav-list">
            {[
              { key: "config",        icon: <Network size={16} />,   label: "Trunk Config",     desc: "802.1Q uplink settings" },
              { key: "etherchannel",  icon: <Cable size={16} />,     label: "EtherChannel",     desc: "LACP / PAgP bonding" },
              { key: "vtp",           icon: <GitBranch size={16} />, label: "VTP",              desc: "VLAN Trunking Protocol" },
              { key: "vlantranslate", icon: <Layers size={16} />,    label: "VLAN Translation", desc: "VLAN mapping & rewrite" },
              { key: "monitor",       icon: <Activity size={16} />,  label: "Trunk Monitor",    desc: "Uplink health & stats" },
            ].map(({ key, icon, label, desc }) => (
              <button key={key} className={`nav-item ${activeTrunkTab === key ? "active" : ""}`} onClick={() => setActiveTrunkTab(key)}>
                <div className="nav-icon">{icon}</div>
                <div className="nav-text"><strong>{label}</strong><p>{desc}</p></div>
              </button>
            ))}
          </div>
        </div>

        <div className="nat-main-content">
          <div className="modal-header-clean">
            <h3>{TAB_TITLES[activeTrunkTab]}</h3>
            <button className="close-btn-mono" onClick={onClose}>×</button>
          </div>

          <div className="config-body">
            <div className="config-group-mono highlight-area">

              {/* ── TRUNK CONFIG ── */}
              {activeTrunkTab === "config" && (
                <>
                  <label>802.1Q Trunk Interface</label>
                  <div className="inline-fields">
                    <div className="input-wrap">
                      <span>Interface</span>
                      <select value={trunkIface} onChange={e => setTrunkIface(e.target.value)}>
                        <option>Gi0/1</option><option>Gi0/2</option><option>Po1 (Port-Channel)</option>
                      </select>
                    </div>
                    <div className="input-wrap">
                      <span>Encapsulation</span>
                      <select value={trunkEncap} onChange={e => setTrunkEncap(e.target.value)}>
                        <option>802.1Q</option><option>ISL (Legacy)</option><option>Negotiate</option>
                      </select>
                    </div>
                  </div>
                  <div className="inline-fields">
                    <div className="input-wrap">
                      <span>Native VLAN</span>
                      <input placeholder="99" value={trunkNative} onChange={e => setTrunkNative(e.target.value)} />
                    </div>
                    <div className="input-wrap">
                      <span>Allowed VLANs</span>
                      <input placeholder="10,20,30,99" value={trunkAllowed} onChange={e => setTrunkAllowed(e.target.value)} />
                    </div>
                  </div>
                  <div className="inline-fields">
                    <div className="input-wrap">
                      <span>DTP Mode</span>
                      <select value={trunkDtp} onChange={e => setTrunkDtp(e.target.value)}>
                        <option>Trunk (Force)</option><option>Dynamic Auto</option><option>Dynamic Desirable</option><option>Nonegotiate</option>
                      </select>
                    </div>
                    <div className="input-wrap">
                      <span>Admin Status</span>
                      <select value={trunkStatus} onChange={e => setTrunkStatus(e.target.value)}>
                        <option>Up</option><option>Down</option><option>Shutdown</option>
                      </select>
                    </div>
                  </div>

                  <label style={{ marginTop: "18px" }}>Trunk Controls</label>
                  <div className="inline-fields">
                    <div className="input-wrap">
                      <span>Pruning Eligible VLANs</span>
                      <input value={pruneVlans} onChange={e => setPruneVlans(e.target.value)} />
                    </div>
                    <div className="input-wrap">
                      <span>Storm Control Threshold</span>
                      <input value={stormThreshold} onChange={e => setStormThreshold(e.target.value)} />
                    </div>
                  </div>
                  <div className="input-wrap">
                    <span>Storm Control Action</span>
                    <select value={stormAction} onChange={e => setStormAction(e.target.value)}>
                      <option>Drop</option><option>Shutdown</option><option>Trap</option>
                    </select>
                  </div>
                  <div className="checkbox-wrap"><input type="checkbox" checked={dtpNegotiation} onChange={e => setDtpNegotiation(e.target.checked)} /><span>Enable DTP negotiation on uplinks</span></div>
                  <div className="checkbox-wrap"><input type="checkbox" checked={tagNative} onChange={e => setTagNative(e.target.checked)} /><span>Tag native VLAN frames (802.1Q strict mode)</span></div>
                  <div className="checkbox-wrap"><input type="checkbox" checked={vlanPruning} onChange={e => setVlanPruning(e.target.checked)} /><span>Enable VLAN pruning on trunk interfaces</span></div>
                </>
              )}

              {/* ── ETHERCHANNEL ── */}
              {activeTrunkTab === "etherchannel" && (
                <>
                  <label>EtherChannel / Port-Channel Configuration</label>
                  <div className="inline-fields">
                    <div className="input-wrap">
                      <span>Port-Channel</span>
                      <input value={poName} onChange={e => setPoName(e.target.value)} placeholder="Po1" />
                    </div>
                    <div className="input-wrap">
                      <span>Member Ports</span>
                      <input value={poMembers} onChange={e => setPoMembers(e.target.value)} placeholder="Gi0/1, Gi0/2" />
                    </div>
                  </div>
                  <div className="inline-fields">
                    <div className="input-wrap">
                      <span>Protocol</span>
                      <select value={poProtocol} onChange={e => setPoProtocol(e.target.value)}>
                        <option>LACP (802.3ad)</option><option>PAgP (Cisco)</option><option>Static (On)</option>
                      </select>
                    </div>
                    <div className="input-wrap">
                      <span>Mode</span>
                      <select value={poMode} onChange={e => setPoMode(e.target.value)}>
                        <option>Active (LACP)</option><option>Passive (LACP)</option>
                        <option>Desirable (PAgP)</option><option>Auto (PAgP)</option><option>On (Static)</option>
                      </select>
                    </div>
                  </div>
                  <div className="inline-fields">
                    <div className="input-wrap">
                      <span>Load Balance</span>
                      <select value={poBalance} onChange={e => setPoBalance(e.target.value)}>
                        <option>src-dst-mac</option><option>src-dst-ip</option><option>src-dst-port</option><option>src-mac</option><option>dst-mac</option>
                      </select>
                    </div>
                    <div className="input-wrap">
                      <span>Min Links</span>
                      <input value={poMinLinks} onChange={e => setPoMinLinks(e.target.value)} placeholder="1" />
                    </div>
                  </div>
                  <div className="input-wrap">
                    <span>Status</span>
                    <select value={poStatus} onChange={e => setPoStatus(e.target.value)}>
                      <option>Up</option><option>Down</option>
                    </select>
                  </div>

                  <label style={{ marginTop: "18px" }}>LACP Settings</label>
                  <div className="inline-fields">
                    <div className="input-wrap"><span>System Priority</span><input value={lacpSysPri} onChange={e => setLacpSysPri(e.target.value)} /></div>
                    <div className="input-wrap"><span>Port Priority</span><input value={lacpPortPri} onChange={e => setLacpPortPri(e.target.value)} /></div>
                  </div>
                  <div className="input-wrap">
                    <span>LACP Rate</span>
                    <select value={lacpRate} onChange={e => setLacpRate(e.target.value)}>
                      <option>Normal (30 sec)</option><option>Fast (1 sec)</option>
                    </select>
                  </div>
                  <div className="checkbox-wrap"><input type="checkbox" checked={lacpFast} onChange={e => setLacpFast(e.target.checked)} /><span>Enable LACP fast timers on uplink ports</span></div>
                  <div className="checkbox-wrap"><input type="checkbox" checked={lacpGraceful} onChange={e => setLacpGraceful(e.target.checked)} /><span>Enable graceful convergence on member link failure</span></div>
                </>
              )}

              {/* ── VTP ── */}
              {activeTrunkTab === "vtp" && (
                <>
                  <label>VLAN Trunking Protocol (VTP)</label>
                  <div className="inline-fields">
                    <div className="input-wrap"><span>VTP Domain</span><input value={vtpDomain} onChange={e => setVtpDomain(e.target.value)} /></div>
                    <div className="input-wrap">
                      <span>VTP Mode</span>
                      <select value={vtpMode} onChange={e => setVtpMode(e.target.value)}>
                        <option>Server</option><option>Client</option><option>Transparent</option><option>Off (VTPv3)</option>
                      </select>
                    </div>
                  </div>
                  <div className="inline-fields">
                    <div className="input-wrap">
                      <span>VTP Version</span>
                      <select value={vtpVersion} onChange={e => setVtpVersion(e.target.value)}>
                        <option>3</option><option>2</option><option>1</option>
                      </select>
                    </div>
                    <div className="input-wrap"><span>VTP Password</span><input type="password" value={vtpPassword} onChange={e => setVtpPassword(e.target.value)} placeholder="••••••••" /></div>
                  </div>
                  <div className="input-wrap"><span>Primary Server (VTPv3)</span><input value={vtpPrimary} onChange={e => setVtpPrimary(e.target.value)} /></div>
                  <div className="checkbox-wrap"><input type="checkbox" checked={vtpPruning} onChange={e => setVtpPruning(e.target.checked)} /><span>Enable VTP pruning</span></div>
                  <div className="checkbox-wrap"><input type="checkbox" checked={vtpMd5} onChange={e => setVtpMd5(e.target.checked)} /><span>Enable VTP MD5 password authentication</span></div>
                </>
              )}

              {/* ── VLAN TRANSLATION ── */}
              {activeTrunkTab === "vlantranslate" && (
                <>
                  <label>VLAN Mapping / Translation</label>
                  <div className="inline-fields">
                    <div className="input-wrap">
                      <span>Interface</span>
                      <select value={xlatIface} onChange={e => setXlatIface(e.target.value)}>
                        <option>Gi0/1</option><option>Gi0/2</option><option>Po1</option>
                      </select>
                    </div>
                    <div className="input-wrap"><span>Original VLAN (Inner)</span><input placeholder="10" value={xlatOrig} onChange={e => setXlatOrig(e.target.value)} /></div>
                  </div>
                  <div className="inline-fields">
                    <div className="input-wrap"><span>Translated VLAN (Outer)</span><input placeholder="110" value={xlatNew} onChange={e => setXlatNew(e.target.value)} /></div>
                    <div className="input-wrap">
                      <span>Direction</span>
                      <select value={xlatDir} onChange={e => setXlatDir(e.target.value)}>
                        <option>Both</option><option>Ingress</option><option>Egress</option>
                      </select>
                    </div>
                  </div>
                  <div className="inline-fields">
                    <div className="input-wrap">
                      <span>Mode</span>
                      <select value={xlatMode} onChange={e => setXlatMode(e.target.value)}>
                        <option>1-to-1</option><option>QinQ (802.1ad)</option><option>Selective</option>
                      </select>
                    </div>
                    <div className="input-wrap">
                      <span>S-VLAN Ethertype (QinQ)</span>
                      <select value={xlatEther} onChange={e => setXlatEther(e.target.value)}>
                        <option>0x8100 (Default)</option><option>0x88A8 (802.1ad)</option><option>0x9100</option>
                      </select>
                    </div>
                  </div>
                  <div className="checkbox-wrap"><input type="checkbox" checked={xlatEnabled} onChange={e => setXlatEnabled(e.target.checked)} /><span>Enable VLAN translation on this interface</span></div>
                </>
              )}

              {/* ── TRUNK MONITOR ── */}
              {activeTrunkTab === "monitor" && (
                <>
                  <label>Trunk Uplink Monitoring</label>
                  <div className="inline-fields">
                    <div className="input-wrap">
                      <span>SPAN Source Trunk</span>
                      <select value={spanSource} onChange={e => setSpanSource(e.target.value)}>
                        <option>Gi0/1</option><option>Gi0/2</option><option>Po1</option>
                      </select>
                    </div>
                    <div className="input-wrap"><span>SPAN Destination Port</span><input value={spanDest} onChange={e => setSpanDest(e.target.value)} /></div>
                  </div>
                  <div className="input-wrap">
                    <span>Poll Interval</span>
                    <select value={spanPoll} onChange={e => setSpanPoll(e.target.value)}>
                      <option>30 sec</option><option>60 sec</option><option>5 min</option>
                    </select>
                  </div>
                </>
              )}

            </div>
          </div>

          <div className="modal-footer-clean">
            <button className="btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn-primary" onClick={handleApply}>Apply Trunking Config</button>
          </div>
        </div>

      </div>
    </div>,
    document.body
  );
}