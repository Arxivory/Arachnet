import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import { Lock, ArrowLeftRight, ShieldCheck, Network, Activity } from "lucide-react";

let persistentVPNState = null;

const defaultState = {
  activeVPNTab:   "tunnel",
  localGateway:   "",
  remoteGateway:  "",
  localSubnet:    "",
  remoteSubnet:   "",
  autoNegotiate:  true,
  ikeVersion:     "IKEv2 (Recommended)",
  encryption:     "AES-256",
  integrity:      "SHA-256",
  preSharedKey:   "",
  pfs:            true,
  srcNetwork:     "",
  dstNetwork:     "",
  encryptMatched: true,
  bypassLocal:    false,
};

function dispatchLog(deviceName, deviceLocation, message) {
  window.dispatchEvent(
    new CustomEvent("add-system-log", {
      detail: { device: "Router", deviceName, message, location: deviceLocation, italic: true },
    })
  );
}

export default function VPNModal({ onClose, deviceName = "Router-Core-01", deviceLocation = "Data Center" }) {
  const [state, setState] = useState(persistentVPNState || defaultState);
  const prevState = useRef(persistentVPNState || defaultState);
  const set = (field, value) => setState((s) => ({ ...s, [field]: value }));

  const now = () => new Date().toISOString().replace("T", " ").slice(0, 19);

  const handleApply = () => {
    const logs = [];

    // Tunnel
    if (state.localGateway)  logs.push(`[VPN Tunnel] Local Gateway: ${state.localGateway}`);
    if (state.remoteGateway) logs.push(`[VPN Tunnel] Remote Gateway: ${state.remoteGateway}`);
    if (state.localSubnet)   logs.push(`[VPN Tunnel] Local Subnet: ${state.localSubnet}`);
    if (state.remoteSubnet)  logs.push(`[VPN Tunnel] Remote Subnet: ${state.remoteSubnet}`);
    if (state.autoNegotiate) logs.push(`[VPN Tunnel] Auto-Negotiate: Enabled`);

    // Encryption
    if (state.ikeVersion && state.ikeVersion !== "Select") logs.push(`[VPN Crypto] IKE Version: ${state.ikeVersion}`);
    if (state.encryption && state.encryption !== "Select") logs.push(`[VPN Crypto] Encryption: ${state.encryption}`);
    if (state.integrity  && state.integrity  !== "Select") logs.push(`[VPN Crypto] Integrity: ${state.integrity}`);
    if (state.preSharedKey) logs.push(`[VPN Crypto] Pre-Shared Key: configured`);
    if (state.pfs)          logs.push(`[VPN Crypto] Perfect Forward Secrecy: Enabled`);

    // Traffic Rules
    if (state.srcNetwork)    logs.push(`[VPN Traffic] Source Network: ${state.srcNetwork}`);
    if (state.dstNetwork)    logs.push(`[VPN Traffic] Destination Network: ${state.dstNetwork}`);
    if (state.encryptMatched) logs.push(`[VPN Traffic] Encrypt Matched Traffic Only: Enabled`);
    if (state.bypassLocal)   logs.push(`[VPN Traffic] Bypass Local Traffic Optimization: Enabled`);

    if (logs.length === 0) logs.push(`[VPN] Applied — no parameters configured`);

    logs.forEach((message) => dispatchLog(deviceName, deviceLocation, message));
    onClose();
  };

  return createPortal(
    <div className="config-modal-overlay vpn-modal-layer">
      <div className="nat-sidebar-layout">

        {/* SIDEBAR */}
        <div className="nat-sidebar">
          <div className="sidebar-header">
            <Lock size={18} />
            <span>VPN Configuration</span>
          </div>
          <div className="nav-list">
            <button className={`nav-item ${state.activeVPNTab === "tunnel" ? "active" : ""}`} onClick={() => set("activeVPNTab", "tunnel")}>
              <div className="nav-icon"><ArrowLeftRight size={16} /></div>
              <div className="nav-text"><strong>Site-to-Site</strong><p>Tunnel endpoints</p></div>
            </button>
            <button className={`nav-item ${state.activeVPNTab === "crypto" ? "active" : ""}`} onClick={() => set("activeVPNTab", "crypto")}>
              <div className="nav-icon"><ShieldCheck size={16} /></div>
              <div className="nav-text"><strong>Encryption</strong><p>IPSec / IKE policies</p></div>
            </button>
            <button className={`nav-item ${state.activeVPNTab === "routing" ? "active" : ""}`} onClick={() => set("activeVPNTab", "routing")}>
              <div className="nav-icon"><Network size={16} /></div>
              <div className="nav-text"><strong>Traffic Rules</strong><p>VPN ACL selectors</p></div>
            </button>
            <button className={`nav-item ${state.activeVPNTab === "status" ? "active" : ""}`} onClick={() => set("activeVPNTab", "status")}>
              <div className="nav-icon"><Activity size={16} /></div>
              <div className="nav-text"><strong>Monitoring</strong><p>Tunnel health & uptime</p></div>
            </button>
          </div>
        </div>

        {/* MAIN */}
        <div className="nat-main-content">
          <div className="modal-header-clean">
            <h3>{state.activeVPNTab.toUpperCase()} Settings</h3>
            <button className="close-btn-mono" onClick={onClose}>×</button>
          </div>

          <div className="config-body">

            {state.activeVPNTab === "tunnel" && (
              <div className="config-group-mono">
                <label>Site-to-Site Tunnel Setup</label>
                <div className="inline-fields">
                  <div className="input-wrap">
                    <span>Local Gateway</span>
                    <input placeholder="e.g. 203.0.113.1" value={state.localGateway} onChange={(e) => set("localGateway", e.target.value)} />
                  </div>
                  <div className="input-wrap">
                    <span>Remote Gateway</span>
                    <input placeholder="e.g. 198.51.100.1" value={state.remoteGateway} onChange={(e) => set("remoteGateway", e.target.value)} />
                  </div>
                </div>
                <div className="inline-fields">
                  <div className="input-wrap">
                    <span>Local Subnet</span>
                    <input placeholder="e.g. 192.168.1.0/24" value={state.localSubnet} onChange={(e) => set("localSubnet", e.target.value)} />
                  </div>
                  <div className="input-wrap">
                    <span>Remote Subnet</span>
                    <input placeholder="e.g. 10.10.0.0/24" value={state.remoteSubnet} onChange={(e) => set("remoteSubnet", e.target.value)} />
                  </div>
                </div>
                <div className="checkbox-wrap">
                  <input type="checkbox" checked={state.autoNegotiate} onChange={(e) => set("autoNegotiate", e.target.checked)} />
                  <span>Auto-negotiate tunnel</span>
                </div>
              </div>
            )}

            {state.activeVPNTab === "crypto" && (
              <div className="config-group-mono">
                <label>IPSec / IKE Encryption</label>
                <div className="inline-fields">
                  <div className="input-wrap">
                    <span>IKE Version</span>
                    <select value={state.ikeVersion} onChange={(e) => set("ikeVersion", e.target.value)}>
                      <option>Select</option>
                      <option>IKEv2 (Recommended)</option>
                      <option>IKEv1</option>
                    </select>
                  </div>
                  <div className="input-wrap">
                    <span>Encryption</span>
                    <select value={state.encryption} onChange={(e) => set("encryption", e.target.value)}>
                      <option>Select</option>
                      <option>AES-256</option>
                      <option>AES-128</option>
                      <option>3DES (Legacy)</option>
                    </select>
                  </div>
                </div>
                <div className="inline-fields">
                  <div className="input-wrap">
                    <span>Integrity</span>
                    <select value={state.integrity} onChange={(e) => set("integrity", e.target.value)}>
                      <option>Select</option>
                      <option>SHA-256</option>
                      <option>SHA-1</option>
                    </select>
                  </div>
                  <div className="input-wrap">
                    <span>Pre-Shared Key</span>
                    <input type="password" placeholder="e.g. ••••••••••" value={state.preSharedKey} onChange={(e) => set("preSharedKey", e.target.value)} />
                  </div>
                </div>
                <div className="checkbox-wrap">
                  <input type="checkbox" checked={state.pfs} onChange={(e) => set("pfs", e.target.checked)} />
                  <span>Enable Perfect Forward Secrecy (PFS)</span>
                </div>
              </div>
            )}

            {state.activeVPNTab === "routing" && (
              <div className="config-group-mono">
                <label>VPN Traffic Selection (Crypto ACL)</label>
                <div className="inline-fields">
                  <div className="input-wrap">
                    <span>Source Network</span>
                    <input placeholder="e.g. 192.168.1.0/24" value={state.srcNetwork} onChange={(e) => set("srcNetwork", e.target.value)} />
                  </div>
                  <div className="input-wrap">
                    <span>Destination Network</span>
                    <input placeholder="e.g. 10.10.0.0/24" value={state.dstNetwork} onChange={(e) => set("dstNetwork", e.target.value)} />
                  </div>
                </div>
                <div className="checkbox-wrap">
                  <input type="checkbox" checked={state.encryptMatched} onChange={(e) => set("encryptMatched", e.target.checked)} />
                  <span>Encrypt matching traffic only</span>
                </div>
                <div className="checkbox-wrap">
                  <input type="checkbox" checked={state.bypassLocal} onChange={(e) => set("bypassLocal", e.target.checked)} />
                  <span>Bypass local traffic optimization</span>
                </div>
              </div>
            )}

            {state.activeVPNTab === "status" && (
              <div className="config-group-mono">
                <label>Tunnel Monitoring Dashboard</label>
                <table className="acl-table">
                  <thead>
                    <tr><th>Tunnel</th><th>Status</th><th>Uptime</th><th>Latency</th></tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>HQ ↔ Branch A</td>
                      <td style={{ color: "green" }}>UP</td>
                      <td>3h 21m</td>
                      <td>28ms</td>
                    </tr>
                    <tr>
                      <td>HQ ↔ Branch B</td>
                      <td style={{ color: "red" }}>DOWN</td>
                      <td>—</td>
                      <td>—</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

          </div>

          <div className="modal-footer-clean">
            <button className="btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn-primary" onClick={handleApply}>Apply VPN</button>
          </div>
        </div>

      </div>
    </div>,
    document.body
  );
}