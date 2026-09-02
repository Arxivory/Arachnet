import { useState } from "react";
import { createPortal } from "react-dom";
import { GitBranch, Network, Layers, ShieldCheck, Activity } from "lucide-react";

export default function STPModal({ onClose, deviceName = "Switch", deviceLocation = "Network" }) {
  const [activeSTPTab, setActiveSTPTab] = useState("global");

  // ── Global STP state ────────────────────────────────────────────────────
  const [stpMode, setStpMode] = useState("Rapid PVST+");
  const [helloTime, setHelloTime] = useState("2");
  const [fwdDelay, setFwdDelay] = useState("15");
  const [maxAge, setMaxAge] = useState("20");
  const [txHold, setTxHold] = useState("6");
  const [mstInstance, setMstInstance] = useState("0");
  const [mstVlans, setMstVlans] = useState("1-4094");
  const [mstPriority, setMstPriority] = useState("32768");
  const [mstRevision, setMstRevision] = useState("1");

  // ── Bridge Priority state ───────────────────────────────────────────────
  const [priVlan, setPriVlan] = useState("10");
  const [priValue, setPriValue] = useState("4096");
  const [priRole, setPriRole] = useState("Root Primary");
  const [priDiameter, setPriDiameter] = useState("7");
  const [priCostMethod, setPriCostMethod] = useState("Long (Gi=4)");

  // ── PortFast / Edge state ───────────────────────────────────────────────
  const [pfGlobalAccess, setPfGlobalAccess] = useState(true);
  const [pfGlobalTrunk, setPfGlobalTrunk] = useState(true);
  const [pfInterface, setPfInterface] = useState("Fa0/1");
  const [pfEnabled, setPfEnabled] = useState(true);
  const [pfLinkType, setPfLinkType] = useState("Point-to-Point");
  const [pfEdge, setPfEdge] = useState(true);
  const [pfAutoEdge, setPfAutoEdge] = useState(true);
  const [pfRecovery, setPfRecovery] = useState("300 sec");

  // ── Protection state ────────────────────────────────────────────────────
  const [guardIface, setGuardIface] = useState("Fa0/1 (access)");
  const [bpduGuard, setBpduGuard] = useState(true);
  const [bpduFilter, setBpduFilter] = useState(false);
  const [rootGuard, setRootGuard] = useState(false);
  const [loopGuard, setLoopGuard] = useState(false);
  const [tcGuard, setTcGuard] = useState(true);
  const [guardRecovery, setGuardRecovery] = useState("300");
  const [tcRate, setTcRate] = useState("5 per 4 sec");

  // ── STP Topology Monitor state ──────────────────────────────────────────
  const [topoIface, setTopoIface] = useState("Gi0/1");
  const [topoVlan, setTopoVlan] = useState("10");

  const now = () => new Date().toISOString().replace("T", " ").slice(0, 19);

  const handleApply = () => {
    const ts = now();
    const dispatch = (message) =>
      window.dispatchEvent(new CustomEvent("add-system-log", { detail: { device: "Switch", deviceName, message, location: deviceLocation, italic: true } }));

    dispatch(`%STP-5-MODE_SET: [${ts}] ${deviceName} @ ${deviceLocation} — Spanning Tree Protocol configuration committed. Active STP mode applied to all participating VLANs.`);
    dispatch(`%STP-6-BRIDGE_PRIORITY: [${ts}] ${deviceName} — Bridge priority values updated. Root bridge election will be triggered on next BPDU exchange.`);
    dispatch(`%STP-6-PORTFAST: [${ts}] ${deviceName} — PortFast / Edge port settings applied. Designated access ports will bypass listening and learning states on link-up.`);
    dispatch(`%STP-5-GUARD_SET: [${ts}] ${deviceName} — BPDU Guard, Root Guard, and Loop Guard protection policies updated. Violations will trigger err-disabled state on affected ports.`);
    onClose();
  };

  const TAB_TITLES = {
    global: "GLOBAL STP SETTINGS", priority: "BRIDGE PRIORITY",
    portfast: "PORTFAST / EDGE", protection: "PROTECTION", monitor: "STP TOPOLOGY",
  };

  return createPortal(
    <div className="config-modal-overlay stp-modal-layer">
      <div className="config-modal-content nat-sidebar-layout">

        <div className="nat-sidebar">
          <div className="sidebar-header">
            <GitBranch size={18} />
            <span>Spanning Tree</span>
          </div>
          <div className="nav-list">
            {[
              { key: "global",     icon: <Network size={16} />,     label: "Global STP",      desc: "Mode & timers" },
              { key: "priority",   icon: <Layers size={16} />,      label: "Bridge Priority",  desc: "Root bridge election" },
              { key: "portfast",   icon: <GitBranch size={16} />,   label: "PortFast / Edge",  desc: "Access port optimization" },
              { key: "protection", icon: <ShieldCheck size={16} />, label: "Protection",       desc: "BPDU, Root & Loop Guard" },
              { key: "monitor",    icon: <Activity size={16} />,    label: "STP Topology",     desc: "Port roles & state" },
            ].map(({ key, icon, label, desc }) => (
              <button key={key} className={`nav-item ${activeSTPTab === key ? "active" : ""}`} onClick={() => setActiveSTPTab(key)}>
                <div className="nav-icon">{icon}</div>
                <div className="nav-text"><strong>{label}</strong><p>{desc}</p></div>
              </button>
            ))}
          </div>
        </div>

        <div className="nat-main-content">
          <div className="modal-header-clean">
            <h3>{TAB_TITLES[activeSTPTab]}</h3>
            <button className="close-btn-mono" onClick={onClose}>×</button>
          </div>

          <div className="config-body">
            <div className="config-group-mono highlight-area">

              {/* ── GLOBAL STP ── */}
              {activeSTPTab === "global" && (
                <>
                  <label>STP Global Settings</label>
                  <div className="inline-fields">
                    <div className="input-wrap">
                      <span>STP Mode</span>
                      <select value={stpMode} onChange={e => setStpMode(e.target.value)}>
                        <option>Rapid PVST+</option><option>PVST+</option><option>MST (802.1s)</option>
                      </select>
                    </div>
                    <div className="input-wrap">
                      <span>Hello Time (sec)</span>
                      <input value={helloTime} onChange={e => setHelloTime(e.target.value)} />
                    </div>
                  </div>
                  <div className="inline-fields">
                    <div className="input-wrap">
                      <span>Forward Delay (sec)</span>
                      <input value={fwdDelay} onChange={e => setFwdDelay(e.target.value)} />
                    </div>
                    <div className="input-wrap">
                      <span>Max Age (sec)</span>
                      <input value={maxAge} onChange={e => setMaxAge(e.target.value)} />
                    </div>
                  </div>
                  <div className="input-wrap">
                    <span>Transmit Hold Count</span>
                    <input value={txHold} onChange={e => setTxHold(e.target.value)} />
                  </div>

                  <label style={{ marginTop: "18px" }}>MST Instance Config (if MST mode)</label>
                  <div className="inline-fields">
                    <div className="input-wrap">
                      <span>Instance</span>
                      <input value={mstInstance} onChange={e => setMstInstance(e.target.value)} placeholder="0" />
                    </div>
                    <div className="input-wrap">
                      <span>VLANs Mapped</span>
                      <input value={mstVlans} onChange={e => setMstVlans(e.target.value)} placeholder="1-4094" />
                    </div>
                  </div>
                  <div className="inline-fields">
                    <div className="input-wrap">
                      <span>Priority</span>
                      <input value={mstPriority} onChange={e => setMstPriority(e.target.value)} placeholder="32768" />
                    </div>
                    <div className="input-wrap">
                      <span>Revision</span>
                      <input value={mstRevision} onChange={e => setMstRevision(e.target.value)} placeholder="1" />
                    </div>
                  </div>
                </>
              )}

              {/* ── BRIDGE PRIORITY ── */}
              {activeSTPTab === "priority" && (
                <>
                  <label>Per-VLAN Bridge Priority & Root Election</label>
                  <div className="inline-fields">
                    <div className="input-wrap">
                      <span>VLAN</span>
                      <input value={priVlan} onChange={e => setPriVlan(e.target.value)} placeholder="10" />
                    </div>
                    <div className="input-wrap">
                      <span>Bridge Priority</span>
                      <select value={priValue} onChange={e => setPriValue(e.target.value)}>
                        {["4096","8192","16384","24576","28672","32768"].map(p => <option key={p}>{p}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="input-wrap">
                    <span>Role</span>
                    <select value={priRole} onChange={e => setPriRole(e.target.value)}>
                      <option>Root Primary</option><option>Root Secondary</option><option>Normal</option>
                    </select>
                  </div>

                  <label style={{ marginTop: "18px" }}>Global Path Settings</label>
                  <div className="inline-fields">
                    <div className="input-wrap">
                      <span>Diameter (hops)</span>
                      <input value={priDiameter} onChange={e => setPriDiameter(e.target.value)} />
                    </div>
                    <div className="input-wrap">
                      <span>Path Cost Method</span>
                      <select value={priCostMethod} onChange={e => setPriCostMethod(e.target.value)}>
                        <option>Long (Gi=4)</option><option>Short (Legacy)</option>
                      </select>
                    </div>
                  </div>
                </>
              )}

              {/* ── PORTFAST / EDGE ── */}
              {activeSTPTab === "portfast" && (
                <>
                  <label>PortFast & Edge Port Configuration</label>
                  <div className="checkbox-wrap">
                    <input type="checkbox" checked={pfGlobalAccess} onChange={e => setPfGlobalAccess(e.target.checked)} />
                    <span>Enable PortFast by default on all access ports</span>
                  </div>
                  <div className="checkbox-wrap">
                    <input type="checkbox" checked={pfGlobalTrunk} onChange={e => setPfGlobalTrunk(e.target.checked)} />
                    <span>Enable PortFast on trunk ports (edge trunks)</span>
                  </div>

                  <label style={{ marginTop: "18px" }}>Per-Interface Settings</label>
                  <div className="inline-fields">
                    <div className="input-wrap">
                      <span>Interface</span>
                      <select value={pfInterface} onChange={e => setPfInterface(e.target.value)}>
                        <option>Fa0/1</option><option>Fa0/2</option><option>Fa0/3</option><option>Gi0/1</option><option>Gi0/2</option>
                      </select>
                    </div>
                    <div className="input-wrap">
                      <span>Link Type</span>
                      <select value={pfLinkType} onChange={e => setPfLinkType(e.target.value)}>
                        <option>Point-to-Point</option><option>Shared</option>
                      </select>
                    </div>
                  </div>
                  <div className="input-wrap">
                    <span>Err-Disabled Recovery</span>
                    <select value={pfRecovery} onChange={e => setPfRecovery(e.target.value)}>
                      <option>300 sec</option><option>60 sec</option><option>Manual</option>
                    </select>
                  </div>
                  <div className="checkbox-wrap"><input type="checkbox" checked={pfEnabled} onChange={e => setPfEnabled(e.target.checked)} /><span>Enable PortFast</span></div>
                  <div className="checkbox-wrap"><input type="checkbox" checked={pfEdge} onChange={e => setPfEdge(e.target.checked)} /><span>Edge Port</span></div>
                  <div className="checkbox-wrap"><input type="checkbox" checked={pfAutoEdge} onChange={e => setPfAutoEdge(e.target.checked)} /><span>Auto-Edge Detection</span></div>
                </>
              )}

              {/* ── PROTECTION ── */}
              {activeSTPTab === "protection" && (
                <>
                  <label>Loop & Topology Protection</label>
                  <div className="input-wrap">
                    <span>Interface</span>
                    <select value={guardIface} onChange={e => setGuardIface(e.target.value)}>
                      <option>Fa0/1 (access)</option><option>Fa0/2 (access)</option><option>Fa0/3 (access)</option>
                      <option>Gi0/1 (uplink)</option><option>Gi0/2 (uplink)</option>
                    </select>
                  </div>
                  <div className="checkbox-wrap"><input type="checkbox" checked={bpduGuard} onChange={e => setBpduGuard(e.target.checked)} /><span>BPDU Guard</span></div>
                  <div className="checkbox-wrap"><input type="checkbox" checked={bpduFilter} onChange={e => setBpduFilter(e.target.checked)} /><span>BPDU Filter</span></div>
                  <div className="checkbox-wrap"><input type="checkbox" checked={rootGuard} onChange={e => setRootGuard(e.target.checked)} /><span>Root Guard</span></div>
                  <div className="checkbox-wrap"><input type="checkbox" checked={loopGuard} onChange={e => setLoopGuard(e.target.checked)} /><span>Loop Guard</span></div>
                  <div className="checkbox-wrap"><input type="checkbox" checked={tcGuard} onChange={e => setTcGuard(e.target.checked)} /><span>TC Guard</span></div>

                  <label style={{ marginTop: "18px" }}>Recovery Settings</label>
                  <div className="inline-fields">
                    <div className="input-wrap">
                      <span>BPDU Guard Recovery (sec)</span>
                      <input value={guardRecovery} onChange={e => setGuardRecovery(e.target.value)} />
                    </div>
                    <div className="input-wrap">
                      <span>TC Guard Rate Limit</span>
                      <input value={tcRate} onChange={e => setTcRate(e.target.value)} />
                    </div>
                  </div>
                </>
              )}

              {/* ── STP TOPOLOGY MONITOR ── */}
              {activeSTPTab === "monitor" && (
                <>
                  <label>STP Port Roles & Topology State</label>
                  <div className="inline-fields">
                    <div className="input-wrap">
                      <span>Interface</span>
                      <select value={topoIface} onChange={e => setTopoIface(e.target.value)}>
                        <option>Gi0/1</option><option>Gi0/2</option><option>Fa0/1</option><option>Fa0/2</option><option>Fa0/3</option>
                      </select>
                    </div>
                    <div className="input-wrap">
                      <span>VLAN</span>
                      <input value={topoVlan} onChange={e => setTopoVlan(e.target.value)} placeholder="10" />
                    </div>
                  </div>

                  <label style={{ marginTop: "18px" }}>Topology Statistics</label>
                  <div className="inline-fields">
                    <div className="input-wrap">
                      <span>TC Count (topology changes)</span>
                      <input readOnly defaultValue="12" />
                    </div>
                    <div className="input-wrap">
                      <span>Last TC From</span>
                      <input readOnly defaultValue="Gi0/1" />
                    </div>
                  </div>
                </>
              )}

            </div>
          </div>

          <div className="modal-footer-clean">
            <button className="btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn-primary" onClick={handleApply}>Apply STP Config</button>
          </div>
        </div>

      </div>
    </div>,
    document.body
  );
}