import { useState } from "react";
import { createPortal } from "react-dom";
import { Network, Layers, Cable, ArrowLeftRight, GitBranch, Activity, ShieldCheck, Trash2 } from "lucide-react";

export default function VLANModal({ onClose, deviceName = "Switch", deviceLocation = "Network", device = null }) {
  const [activeVLANTab, setActiveVLANTab] = useState("vlans");

  // ── VLAN Database state ─────────────────────────────────────────────────
  const [vlanId, setVlanId] = useState("");
  const [vlanName, setVlanName] = useState("");
  const [vlanType, setVlanType] = useState("Data");
  const [vlanStatus, setVlanStatus] = useState("Active");
  const [vlanMtu, setVlanMtu] = useState("1500");
  const [vlanSubnet, setVlanSubnet] = useState("");
  const [pruning, setPruning] = useState(true);
  const [vlans, setVlans] = useState([]);

  // ── Port Assignment state ───────────────────────────────────────────────
  const [portIface, setPortIface] = useState("Fa0/1");
  const [portMode, setPortMode] = useState("Access");
  const [portAccessVlan, setPortAccessVlan] = useState("");
  const [portVoiceVlan, setPortVoiceVlan] = useState("");
  const [portAuth, setPortAuth] = useState("Disabled");
  const [portSticky, setPortSticky] = useState(false);
  const [macAging, setMacAging] = useState("300");

  // ── Inter-VLAN Routing state ────────────────────────────────────────────
  const [sviVlan, setSviVlan] = useState("");
  const [sviIp, setSviIp] = useState("");
  const [sviMask, setSviMask] = useState("255.255.255.0");
  const [sviHelper, setSviHelper] = useState("");
  const [sviVrf, setSviVrf] = useState("default");
  const [sviState, setSviState] = useState("Up");
  const [ipRouting, setIpRouting] = useState(true);

  // ── DHCP Snooping state ─────────────────────────────────────────────────
  const [snoopVlans, setSnoopVlans] = useState("10,20,30");
  const [snoopDb, setSnoopDb] = useState("flash:dhcp-snooping.db");
  const [snoopRate, setSnoopRate] = useState("100");
  const [snoopGlobal, setSnoopGlobal] = useState(true);
  const [snoopOption82, setSnoopOption82] = useState(true);

  // ── DAI / IP Source Guard state ─────────────────────────────────────────
  const [daiVlans, setDaiVlans] = useState("10,20,30");
  const [daiRate, setDaiRate] = useState("100");
  const [daiLog, setDaiLog] = useState(true);
  const [daiValidate, setDaiValidate] = useState(true);

  // ── Monitoring state ────────────────────────────────────────────────────
  const [spanSource, setSpanSource] = useState("Fa0/1");
  const [spanDest, setSpanDest] = useState("Fa0/24");
  const [spanDirection, setSpanDirection] = useState("Both");
  const [spanEnabled, setSpanEnabled] = useState(true);

  const now = () => new Date().toISOString().replace("T", " ").slice(0, 19);

  const handleAddVlan = () => {
    if (!vlanId) return;
    setVlans(prev => [...prev, {
      id: `vlan-${Date.now()}`,
      vlanId, name: vlanName || `VLAN${vlanId}`, type: vlanType,
      status: vlanStatus, mtu: vlanMtu, subnet: vlanSubnet,
    }]);
    setVlanId(""); setVlanName(""); setVlanSubnet("");
  };

  const handleDeleteVlan = (id) => setVlans(prev => prev.filter(v => v.id !== id));

  const handleApply = () => {
    const ts = now();
    const dispatch = (message) =>
      window.dispatchEvent(new CustomEvent("add-system-log", { detail: { device: "Switch", deviceName, message, location: deviceLocation, italic: true } }));

    if (device?.vlanManager) {
      const routerInterfaceName = device?.interfaces?.[0]?.name || portIface;

      vlans.forEach(vlan => {
        device.vlanManager.addVlan(Number.parseInt(vlan.vlanId, 10), vlan.name, {
          type: vlan.type.toLowerCase(),
          status: vlan.status.toLowerCase(),
          mtu: Number.parseInt(vlan.mtu, 10),
          subnet: vlan.subnet || null,
        });
      });

      if (portIface) {
        if (portMode.toLowerCase() === "trunk") {
          device.configureTrunkPort(portIface, {
            nativeVlan: portAccessVlan || 1,
            allowedVlans: portAccessVlan ? [portAccessVlan] : [],
            tagNativeFrames: true,
          });
        } else {
          device.configureAccessPort(portIface, portAccessVlan || 1);
        }
      }

      if (sviVlan && (sviIp || device?.type === 'router')) {
        if (typeof device.configureSwitchSvi === 'function') {
          device.configureSwitchSvi(sviVlan, sviIp, sviMask);
          device.enableIpRouting?.(ipRouting);
        } else if (typeof device.configureRouterOnStick === 'function') {
          device.configureRouterOnStick(routerInterfaceName, sviVlan, sviIp, sviMask);
        }
      }
    }

    vlans.forEach(v => {
      dispatch(`%VLAN-5-DB_UPDATE: [${ts}] ${deviceName} @ ${deviceLocation} — VLAN ${v.vlanId} ("${v.name}") committed. Type: ${v.type} | Status: ${v.status} | MTU: ${v.mtu} | Subnet: ${v.subnet || "unset"}.`);
    });
    dispatch(`%VLAN-6-PRUNING_SET: [${ts}] ${deviceName} — VTP pruning: ${pruning ? "ENABLED" : "DISABLED"}.`);
    dispatch(`%VLAN-6-MAC_AGING: [${ts}] ${deviceName} — MAC aging timer set to ${macAging}s.`);
    if (spanSource && spanDest && spanEnabled) dispatch(`%SPAN-5-SESSION_SET: [${ts}] ${deviceName} — SPAN session: ${spanSource} → ${spanDest} (${spanDirection}).`);
    onClose();
  };

  const TAB_TITLES = {
    vlans: "VLAN DATABASE", ports: "PORT ASSIGNMENT", trunk: "INTER-VLAN ROUTING",
    stp: "DHCP SNOOPING", security: "DAI / IP SOURCE GUARD", monitor: "MONITORING",
  };

  return createPortal(
    <div className="config-modal-overlay vlan-modal-layer">
      <div className="config-modal-content nat-sidebar-layout">

        <div className="nat-sidebar">
          <div className="sidebar-header">
            <Network size={18} />
            <span>VLAN Manager</span>
          </div>
          <div className="nav-list">
            {[
              { key: "vlans",    icon: <Layers size={16} />,         label: "VLAN Database",    desc: "Create & manage VLANs" },
              { key: "ports",    icon: <Cable size={16} />,          label: "Port Assignment",  desc: "Access & trunk ports" },
              { key: "trunk",    icon: <ArrowLeftRight size={16} />, label: "Inter-VLAN Routing", desc: "SVI & L3 gateway" },
              { key: "stp",      icon: <GitBranch size={16} />,     label: "DHCP Snooping",    desc: "Binding & trusted ports" },
              { key: "security", icon: <ShieldCheck size={16} />,   label: "DAI / IP Source",  desc: "ARP inspection & IPSG" },
              { key: "monitor",  icon: <Activity size={16} />,      label: "Monitoring",       desc: "Traffic & VLAN health" },
            ].map(({ key, icon, label, desc }) => (
              <button key={key} className={`nav-item ${activeVLANTab === key ? "active" : ""}`} onClick={() => setActiveVLANTab(key)}>
                <div className="nav-icon">{icon}</div>
                <div className="nav-text"><strong>{label}</strong><p>{desc}</p></div>
              </button>
            ))}
          </div>
        </div>

        <div className="nat-main-content">
          <div className="modal-header-clean">
            <h3>{TAB_TITLES[activeVLANTab]}</h3>
            <button className="close-btn-mono" onClick={onClose}>×</button>
          </div>

          <div className="config-body">
            <div className="config-group-mono highlight-area">

              {/* ── VLAN DATABASE ── */}
              {activeVLANTab === "vlans" && (
                <>
                  <label>VLAN Configuration</label>
                  <div className="inline-fields">
                    <div className="input-wrap">
                      <span>VLAN ID</span>
                      <input placeholder="10" value={vlanId} onChange={e => setVlanId(e.target.value)} />
                    </div>
                    <div className="input-wrap">
                      <span>Name</span>
                      <input placeholder="SALES_VLAN" value={vlanName} onChange={e => setVlanName(e.target.value)} />
                    </div>
                  </div>
                  <div className="inline-fields">
                    <div className="input-wrap">
                      <span>Type</span>
                      <select value={vlanType} onChange={e => setVlanType(e.target.value)}>
                        <option>Data</option><option>Voice</option><option>Management</option><option>Native</option>
                      </select>
                    </div>
                    <div className="input-wrap">
                      <span>Status</span>
                      <select value={vlanStatus} onChange={e => setVlanStatus(e.target.value)}>
                        <option>Active</option><option>Suspended</option>
                      </select>
                    </div>
                  </div>
                  <div className="inline-fields">
                    <div className="input-wrap">
                      <span>MTU</span>
                      <select value={vlanMtu} onChange={e => setVlanMtu(e.target.value)}>
                        <option>1500</option><option>4500</option><option>9000</option><option>9216</option>
                      </select>
                    </div>
                    <div className="input-wrap">
                      <span>Subnet</span>
                      <input placeholder="10.10.10.0/24" value={vlanSubnet} onChange={e => setVlanSubnet(e.target.value)} />
                    </div>
                  </div>
                  <div className="checkbox-wrap">
                    {/* <input type="checkbox" checked={pruning} onChange={e => setPruning(e.target.checked)} />
                    <span>Enable VLAN Pruning</span> */}
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "12px" }}>
                    <button className="btn-primary" onClick={handleAddVlan} disabled={!vlanId}>Add VLAN</button>
                  </div>

                  {vlans.length > 0 && (
                    <div style={{ marginTop: "18px" }}>
                      <label>Configured VLANs</label>
                      {vlans.map(v => (
                        <div key={v.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--color-border, #e5e7eb)" }}>
                          <span style={{ fontSize: "13px" }}>
                            <strong>VLAN {v.vlanId}</strong> — {v.name} ({v.type}, {v.status}, MTU {v.mtu})
                          </span>
                          <button onClick={() => handleDeleteVlan(v.id)} style={{ background: "transparent", border: "none", cursor: "pointer", color: "#ef4444", padding: "4px", display: "flex" }}>
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* ── PORT ASSIGNMENT ── */}
              {activeVLANTab === "ports" && (
                <>
                  <label>Switch Port Configuration</label>
                  <div className="inline-fields">
                    <div className="input-wrap">
                      <span>Interface</span>
                      <select value={portIface} onChange={e => setPortIface(e.target.value)}>
                        <option>Fa0/1</option><option>Fa0/2</option><option>Fa0/3</option><option>Gi0/1</option><option>Gi0/2</option>
                      </select>
                    </div>
                    <div className="input-wrap">
                      <span>Mode</span>
                      <select value={portMode} onChange={e => setPortMode(e.target.value)}>
                        <option>Access</option><option>Trunk</option><option>Dynamic Auto</option><option>Dynamic Desirable</option>
                      </select>
                    </div>
                  </div>
                  <div className="inline-fields">
                    <div className="input-wrap">
                      <span>Access VLAN</span>
                      <input placeholder="10" value={portAccessVlan} onChange={e => setPortAccessVlan(e.target.value)} />
                    </div>
                    <div className="input-wrap">
                      <span>Voice VLAN</span>
                      <input placeholder="20" value={portVoiceVlan} onChange={e => setPortVoiceVlan(e.target.value)} />
                    </div>
                  </div>
                  <div className="input-wrap">
                    <span>802.1X Authentication</span>
                    <select value={portAuth} onChange={e => setPortAuth(e.target.value)}>
                      <option>Disabled</option><option>Open</option><option>Closed</option><option>Monitor</option>
                    </select>
                  </div>
                  <div className="checkbox-wrap">
                    <input type="checkbox" checked={portSticky} onChange={e => setPortSticky(e.target.checked)} />
                    <span>Enable Sticky MAC</span>
                  </div>

                  <label style={{ marginTop: "18px" }}>Global Settings</label>
                  <div className="inline-fields">
                    <div className="input-wrap">
                      <span>MAC Aging Timer (sec)</span>
                      <input value={macAging} onChange={e => setMacAging(e.target.value)} placeholder="300" />
                    </div>
                    <div className="input-wrap">
                      <span>Default Access VLAN</span>
                      <input placeholder="1" />
                    </div>
                  </div>
                </>
              )}

              {/* ── INTER-VLAN ROUTING ── */}
              {activeVLANTab === "trunk" && (
                <>
                  <label>SVI (Layer 3 Interface) Configuration</label>
                  <div className="inline-fields">
                    <div className="input-wrap">
                      <span>VLAN</span>
                      <input placeholder="10" value={sviVlan} onChange={e => setSviVlan(e.target.value)} />
                    </div>
                    <div className="input-wrap">
                      <span>SVI IP Address</span>
                      <input placeholder="10.10.10.1" value={sviIp} onChange={e => setSviIp(e.target.value)} />
                    </div>
                  </div>
                  <div className="inline-fields">
                    <div className="input-wrap">
                      <span>Subnet Mask</span>
                      <input placeholder="255.255.255.0" value={sviMask} onChange={e => setSviMask(e.target.value)} />
                    </div>
                    <div className="input-wrap">
                      <span>DHCP Relay (Helper)</span>
                      <input placeholder="10.10.30.100" value={sviHelper} onChange={e => setSviHelper(e.target.value)} />
                    </div>
                  </div>
                  <div className="inline-fields">
                    <div className="input-wrap">
                      <span>VRF Instance</span>
                      <input placeholder="default" value={sviVrf} onChange={e => setSviVrf(e.target.value)} />
                    </div>
                    <div className="input-wrap">
                      <span>Admin State</span>
                      <select value={sviState} onChange={e => setSviState(e.target.value)}>
                        <option>Up</option><option>Down</option><option>Shutdown</option>
                      </select>
                    </div>
                  </div>
                  <div className="checkbox-wrap">
                    <input type="checkbox" checked={ipRouting} onChange={e => setIpRouting(e.target.checked)} />
                    <span>Enable IP routing between VLANs (ip routing)</span>
                  </div>
                  {device?.type === 'router' && (
                    <div className="checkbox-wrap">
                      <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>
                        Router-on-a-stick configuration will create / update a tagged subinterface for this VLAN.
                      </span>
                    </div>
                  )}
                </>
              )}

              {/* ── DHCP SNOOPING ── */}
              {activeVLANTab === "stp" && (
                <>
                  <label>DHCP Snooping Configuration</label>
                  <div className="inline-fields">
                    <div className="input-wrap">
                      <span>Snooping VLANs</span>
                      <input value={snoopVlans} onChange={e => setSnoopVlans(e.target.value)} placeholder="10,20,30" />
                    </div>
                    <div className="input-wrap">
                      <span>Binding Database</span>
                      <input value={snoopDb} onChange={e => setSnoopDb(e.target.value)} />
                    </div>
                  </div>
                  <div className="input-wrap">
                    <span>Rate Limit (pps)</span>
                    <input value={snoopRate} onChange={e => setSnoopRate(e.target.value)} placeholder="100" />
                  </div>
                  <div className="checkbox-wrap">
                    <input type="checkbox" checked={snoopGlobal} onChange={e => setSnoopGlobal(e.target.checked)} />
                    <span>Enable DHCP Snooping globally</span>
                  </div>
                  <div className="checkbox-wrap">
                    <input type="checkbox" checked={snoopOption82} onChange={e => setSnoopOption82(e.target.checked)} />
                    <span>Enable Option 82 insertion</span>
                  </div>
                </>
              )}

              {/* ── DAI / IP SOURCE GUARD ── */}
              {activeVLANTab === "security" && (
                <>
                  <label>Dynamic ARP Inspection (DAI)</label>
                  <div className="inline-fields">
                    <div className="input-wrap">
                      <span>DAI VLANs</span>
                      <input value={daiVlans} onChange={e => setDaiVlans(e.target.value)} />
                    </div>
                    <div className="input-wrap">
                      <span>ARP Rate Limit (pps)</span>
                      <input value={daiRate} onChange={e => setDaiRate(e.target.value)} />
                    </div>
                  </div>
                  <div className="input-wrap">
                    <span>ARP Burst Interval</span>
                    <select><option>1 sec</option><option>5 sec</option><option>10 sec</option></select>
                  </div>
                  <div className="checkbox-wrap">
                    <input type="checkbox" checked={daiLog} onChange={e => setDaiLog(e.target.checked)} />
                    <span>Log DAI violations to syslog</span>
                  </div>
                  <div className="checkbox-wrap">
                    <input type="checkbox" checked={daiValidate} onChange={e => setDaiValidate(e.target.checked)} />
                    <span>Validate ARP source MAC, destination MAC, and IP</span>
                  </div>
                </>
              )}

              {/* ── MONITORING ── */}
              {activeVLANTab === "monitor" && (
                <>
                  <label>SPAN / RSPAN Session</label>
                  <div className="inline-fields">
                    <div className="input-wrap">
                      <span>SPAN Source Port</span>
                      <input value={spanSource} onChange={e => setSpanSource(e.target.value)} placeholder="Fa0/1" />
                    </div>
                    <div className="input-wrap">
                      <span>SPAN Destination Port</span>
                      <input value={spanDest} onChange={e => setSpanDest(e.target.value)} placeholder="Fa0/24" />
                    </div>
                  </div>
                  <div className="input-wrap">
                    <span>Direction</span>
                    <select value={spanDirection} onChange={e => setSpanDirection(e.target.value)}>
                      <option>Both</option><option>Rx Only</option><option>Tx Only</option>
                    </select>
                  </div>
                  <div className="checkbox-wrap">
                    <input type="checkbox" checked={spanEnabled} onChange={e => setSpanEnabled(e.target.checked)} />
                    <span>Enable SPAN session</span>
                  </div>
                </>
              )}

            </div>
          </div>

          <div className="modal-footer-clean">
            <button className="btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn-primary" onClick={handleApply}>Apply VLAN Config</button>
          </div>
        </div>

      </div>
    </div>,
    document.body
  );
}