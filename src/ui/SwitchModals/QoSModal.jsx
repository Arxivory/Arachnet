import { useState } from "react";
import { createPortal } from "react-dom";
import { Activity, Layers, ArrowLeftRight, ShieldCheck, Sliders } from "lucide-react";

export default function QoSModal({ onClose, deviceName = "Switch", deviceLocation = "Network" }) {
  const [activeQoSTab, setActiveQoSTab] = useState("classification");

  const now = () => new Date().toISOString().replace("T", " ").slice(0, 19);

  const handleApply = () => {
    const ts = now();
    const dispatch = (message) =>
      window.dispatchEvent(new CustomEvent("add-system-log", { detail: { device: "Switch", deviceName, message, location: deviceLocation, italic: true } }));

    dispatch(`%QOS-5-GLOBAL_ENABLE: [${ts}] ${deviceName} @ ${deviceLocation} — QoS globally enabled (mls qos). MQC policy maps and class maps committed to hardware TCAM.`);
    dispatch(`%QOS-6-CLASSIFICATION: [${ts}] ${deviceName} — Traffic classification policy updated. DSCP, CoS, and IP Precedence markings applied per class-map definitions.`);
    dispatch(`%QOS-5-TRUST_STATE: [${ts}] ${deviceName} — Per-port trust state configured. CoS/DSCP trust boundaries applied; untrusted ports will remark ingress traffic to default values.`);
    dispatch(`%QOS-6-QUEUE_CONFIG: [${ts}] ${deviceName} — Egress queue parameters committed. WRR weights, queue depths, and WRED thresholds updated on all configured interfaces.`);
    dispatch(`%QOS-5-POLICING: [${ts}] ${deviceName} — Two-rate three-color policing policies applied. CIR/PIR token bucket parameters and conform/exceed/violate actions committed.`);
    dispatch(`%QOS-6-AUTOQOS: [${ts}] ${deviceName} — Auto-QoS preset templates applied. Voice, video, and uplink port policies generated and bound to configured interfaces.`);
    onClose();
  };

  return createPortal(
    <div className="config-modal-overlay qos-modal-layer">
      <div className="config-modal-content nat-sidebar-layout">

        <div className="nat-sidebar">
          <div className="sidebar-header">
            <Activity size={18} />
            <span>QoS Settings</span>
          </div>
          <div className="nav-list">
            {[
              { key:"classification", icon:<Layers size={16} />,        label:"Classification",  desc:"Traffic identification" },
              { key:"marking",        icon:<Activity size={16} />,      label:"Marking & Trust",  desc:"CoS / DSCP assignment" },
              { key:"queue",          icon:<ArrowLeftRight size={16} />, label:"Queueing",        desc:"Bandwidth allocation" },
              { key:"policing",       icon:<ShieldCheck size={16} />,   label:"Policing",        desc:"Rate limiting policies" },
              { key:"autoqos",        icon:<Sliders size={16} />,       label:"Auto-QoS",        desc:"Voice & video presets" },
            ].map(({ key, icon, label, desc }) => (
              <button key={key} className={`nav-item ${activeQoSTab === key ? "active" : ""}`} onClick={() => setActiveQoSTab(key)}>
                <div className="nav-icon">{icon}</div>
                <div className="nav-text"><strong>{label}</strong><p>{desc}</p></div>
              </button>
            ))}
          </div>
        </div>

        <div className="nat-main-content">
          <div className="modal-header-clean">
            <h3>Advanced QoS Configuration</h3>
            <button className="close-btn-mono" onClick={onClose}>×</button>
          </div>

          <div className="config-body">

            {/* ── CLASSIFICATION ── */}
            {activeQoSTab === "classification" && (
              <div className="config-group-mono">
                <label>Traffic Classification (MQC Policy Map)</label>
                <table className="acl-table">
                  <thead>
                    <tr>
                      <th>Class Name</th><th>Match Protocol</th><th>DSCP Marking</th>
                      <th>CoS (802.1p)</th><th>IP Precedence</th><th>Priority</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { cls:"VOICE",         proto:"RTP / SIP",    dscp:"EF (46)",    cos:"5", prec:"5" },
                      { cls:"VIDEO",         proto:"H.264 / RTSP", dscp:"AF41 (34)",  cos:"4", prec:"4" },
                      { cls:"CALL-SIGNAL",   proto:"SCCP / H.323", dscp:"CS3 (24)",   cos:"3", prec:"3" },
                      { cls:"CRITICAL-DATA", proto:"HTTPS / SSH",  dscp:"AF31 (26)",  cos:"2", prec:"2" },
                      { cls:"BEST-EFFORT",   proto:"HTTP / Other", dscp:"BE (0)",     cos:"0", prec:"0" },
                    ].map((row, i) => (
                      <tr key={i}>
                        <td><input defaultValue={row.cls} /></td>
                        <td><input defaultValue={row.proto} /></td>
                        <td>
                          <select defaultValue={row.dscp}>
                            {["EF (46)","AF41 (34)","AF31 (26)","CS3 (24)","AF11 (10)","BE (0)"].map(d => <option key={d}>{d}</option>)}
                          </select>
                        </td>
                        <td><input defaultValue={row.cos} style={{width:"50px"}} /></td>
                        <td><input defaultValue={row.prec} style={{width:"50px"}} /></td>
                        <td>
                          <select>
                            <option>Priority</option><option>Bandwidth</option><option>Fair-Queue</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="checkbox-wrap" style={{marginTop:"10px"}}>
                  <input type="checkbox" defaultChecked />
                  <span>Enable QoS globally (mls qos)</span>
                </div>
              </div>
            )}

            {/* ── MARKING & TRUST ── */}
            {activeQoSTab === "marking" && (
              <div className="config-group-mono">
                <label>Per-Port Trust State & Marking</label>
                <table className="acl-table">
                  <thead>
                    <tr>
                      <th>Interface</th><th>Trust State</th><th>Default CoS</th>
                      <th>CoS Override</th><th>DSCP Override</th><th>Voice VLAN CoS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { port:"Fa0/1 (PC)",    trust:"Untrusted",  cos:"0" },
                      { port:"Fa0/2 (IP Phone)",trust:"CoS",      cos:"5" },
                      { port:"Fa0/3 (AP)",    trust:"DSCP",       cos:"0" },
                      { port:"Gi0/1 (Uplink)",trust:"DSCP",       cos:"0" },
                      { port:"Gi0/2 (Uplink)",trust:"DSCP",       cos:"0" },
                    ].map((row, i) => (
                      <tr key={i}>
                        <td style={{fontSize:"12px"}}>{row.port}</td>
                        <td>
                          <select defaultValue={row.trust}>
                            <option>Untrusted</option><option>CoS</option><option>DSCP</option><option>IP-Precedence</option>
                          </select>
                        </td>
                        <td><input defaultValue={row.cos} style={{width:"50px"}} /></td>
                        <td style={{textAlign:"center"}}><input type="checkbox" /></td>
                        <td style={{textAlign:"center"}}><input type="checkbox" /></td>
                        <td>
                          <select>
                            <option>5 (Voice)</option><option>4 (Video)</option><option>3 (Signal)</option><option>0 (Default)</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <label style={{marginTop:"14px"}}>CoS-to-DSCP Mapping Table</label>
                <table className="acl-table">
                  <thead>
                    <tr>{[0,1,2,3,4,5,6,7].map(c => <th key={c}>CoS {c}</th>)}</tr>
                  </thead>
                  <tbody>
                    <tr>
                      {["0","8","16","24","32","40","46","56"].map((d,i) => (
                        <td key={i}><input defaultValue={d} style={{width:"45px"}} /></td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {/* ── QUEUEING ── */}
            {activeQoSTab === "queue" && (
              <div className="config-group-mono">
                <label>Egress Queue Configuration (WRR / CBWFQ)</label>
                <div className="inline-fields">
                  <div className="input-wrap">
                    <span>Scheduling Algorithm</span>
                    <select><option>WRR</option><option>CBWFQ</option><option>PQ+WRR</option><option>FIFO</option></select>
                  </div>
                  <div className="input-wrap">
                    <span>Number of Queues</span>
                    <select><option>4</option><option>8</option></select>
                  </div>
                </div>
                <table className="acl-table" style={{marginTop:"10px"}}>
                  <thead>
                    <tr>
                      <th>Queue</th><th>Traffic Class</th><th>CoS Values</th>
                      <th>WRR Weight (%)</th><th>Queue Depth (pkts)</th><th>WRED</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { q:"Q1 (Priority)", cls:"VOICE",        cos:"5,6,7", wrr:"—",  depth:"64",  wred:false },
                      { q:"Q2",           cls:"VIDEO",         cos:"4",     wrr:"30", depth:"128", wred:true  },
                      { q:"Q3",           cls:"CRITICAL-DATA", cos:"2,3",   wrr:"25", depth:"256", wred:true  },
                      { q:"Q4 (Default)", cls:"BEST-EFFORT",   cos:"0,1",   wrr:"10", depth:"512", wred:false },
                    ].map((row, i) => (
                      <tr key={i}>
                        <td style={{fontSize:"12px"}}><strong>{row.q}</strong></td>
                        <td><input defaultValue={row.cls} /></td>
                        <td><input defaultValue={row.cos} style={{width:"70px"}} /></td>
                        <td><input defaultValue={row.wrr} style={{width:"60px"}} /></td>
                        <td><input defaultValue={row.depth} style={{width:"70px"}} /></td>
                        <td style={{textAlign:"center"}}><input type="checkbox" defaultChecked={row.wred} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="checkbox-wrap" style={{marginTop:"10px"}}>
                  <input type="checkbox" defaultChecked />
                  <span>Enable strict priority for Q1 (voice LLQ)</span>
                </div>
              </div>
            )}

            {/* ── POLICING ── */}
            {activeQoSTab === "policing" && (
              <div className="config-group-mono">
                <label>Traffic Policing (Two-Rate Three-Color)</label>
                <table className="acl-table">
                  <thead>
                    <tr>
                      <th>Class</th><th>CIR (Kbps)</th><th>PIR (Kbps)</th>
                      <th>Bc (bytes)</th><th>Be (bytes)</th><th>Conform</th><th>Exceed</th><th>Violate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { cls:"VOICE",         cir:"128",   pir:"256",   bc:"8000",  be:"16000" },
                      { cls:"VIDEO",         cir:"2000",  pir:"4000",  bc:"62500", be:"125000" },
                      { cls:"CRITICAL-DATA", cir:"10000", pir:"20000", bc:"312500",be:"625000" },
                      { cls:"BEST-EFFORT",   cir:"5000",  pir:"10000", bc:"156250",be:"312500" },
                    ].map((row, i) => (
                      <tr key={i}>
                        <td><strong>{row.cls}</strong></td>
                        <td><input defaultValue={row.cir} /></td>
                        <td><input defaultValue={row.pir} /></td>
                        <td><input defaultValue={row.bc} /></td>
                        <td><input defaultValue={row.be} /></td>
                        <td><select><option>Transmit</option><option>Set DSCP Transmit</option></select></td>
                        <td><select><option>Drop</option><option>Set DSCP Transmit</option><option>Policed DSCP</option></select></td>
                        <td><select><option>Drop</option><option>Set DSCP 0 Transmit</option></select></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="checkbox-wrap" style={{marginTop:"10px"}}>
                  <input type="checkbox" defaultChecked />
                  <span>Drop excess traffic beyond PIR (two-rate three-color policing)</span>
                </div>
                <div className="checkbox-wrap">
                  <input type="checkbox" />
                  <span>Enable traffic shaping (buffer instead of drop)</span>
                </div>
              </div>
            )}

            {/* ── AUTO-QOS ── */}
            {activeQoSTab === "autoqos" && (
              <div className="config-group-mono">
                <label>Auto-QoS Presets (Cisco SRND)</label>
                <table className="acl-table">
                  <thead>
                    <tr>
                      <th>Interface</th><th>Auto-QoS Preset</th><th>Applied Policy</th><th>Trust Extension</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { port:"Fa0/1", preset:"VoIP (IP Phone)", policy:"AutoQoS-VoIP-Port-Policy" },
                      { port:"Fa0/2", preset:"VoIP (IP Phone)", policy:"AutoQoS-VoIP-Port-Policy" },
                      { port:"Fa0/3", preset:"Video (Telepresence)", policy:"AutoQoS-Video-Policy" },
                      { port:"Gi0/1", preset:"Trunk / Uplink", policy:"AutoQoS-Trust-DSCP-Policy" },
                    ].map((row, i) => (
                      <tr key={i}>
                        <td>{row.port}</td>
                        <td>
                          <select defaultValue={row.preset}>
                            <option>VoIP (IP Phone)</option><option>Video (Telepresence)</option>
                            <option>Trunk / Uplink</option><option>Enterprise (All)</option><option>Disabled</option>
                          </select>
                        </td>
                        <td style={{fontSize:"11px",color:"var(--color-text-secondary)"}}>{row.policy}</td>
                        <td>
                          <select>
                            <option>Trust CoS</option><option>Trust DSCP</option><option>No Trust</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="checkbox-wrap" style={{marginTop:"10px"}}>
                  <input type="checkbox" defaultChecked />
                  <span>Automatically apply recommended DSCP values for voice VLAN</span>
                </div>
                <div className="checkbox-wrap">
                  <input type="checkbox" />
                  <span>Generate auto-QoS class maps and policy maps in running-config</span>
                </div>
              </div>
            )}

          </div>

          <div className="modal-footer-clean">
            <button className="btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn-primary" onClick={handleApply}>Apply QoS</button>
          </div>
        </div>

      </div>
    </div>,
    document.body
  );
}