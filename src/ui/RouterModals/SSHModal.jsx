import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import { Lock, Server, ShieldCheck, Network, Activity } from "lucide-react";

let persistentSSHState = null;

const defaultKeys = [
  { user: "", keyType: "RSA",     fingerprint: "", active: true },
  { user: "", keyType: "ECDSA",   fingerprint: "", active: true },
  { user: "", keyType: "ED25519", fingerprint: "", active: false },
];

const defaultState = {
  activeSSHTab:    "general",
  sshEnabled:      "Enabled",
  port:            "",
  protocolVersion: "SSH-2 (Recommended)",
  allowRootLogin:  true,
  passwordLogin:   "Enabled",
  keyBasedAuth:    "Required",
  disableEmpty:    true,
  twoFA:           false,
  keys:            defaultKeys,
  allowedIP:       "",
  blockedIP:       "",
  ipFiltering:     true,
  rateLimiting:    false,
};

function dispatchLog(deviceName, deviceLocation, message) {
  window.dispatchEvent(
    new CustomEvent("add-system-log", {
      detail: { device: "Router", deviceName, message, location: deviceLocation, italic: true },
    })
  );
}

export default function SSHModal({ onClose, deviceName = "Router-Core-01", deviceLocation = "Data Center" }) {
  const [state, setState] = useState(persistentSSHState || defaultState);
  const prevState = useRef(persistentSSHState || defaultState);
  const set = (field, value) => setState((s) => ({ ...s, [field]: value }));

  const updateKey = (i, field, value) => {
    const keys = [...state.keys];
    keys[i] = { ...keys[i], [field]: value };
    set("keys", keys);
  };

  const now = () => new Date().toISOString().replace("T", " ").slice(0, 19);

  const handleApply = () => {
    const logs = [];

    // General
    if (state.sshEnabled && state.sshEnabled !== "Select") logs.push(`[SSH] Service: ${state.sshEnabled}`);
    if (state.port)                                        logs.push(`[SSH] Port: ${state.port}`);
    if (state.protocolVersion && state.protocolVersion !== "Select") logs.push(`[SSH] Protocol Version: ${state.protocolVersion}`);
    if (state.allowRootLogin) logs.push(`[SSH] Allow Root Login: Enabled`);

    // Authentication
    if (state.passwordLogin && state.passwordLogin !== "Select") logs.push(`[SSH Auth] Password Login: ${state.passwordLogin}`);
    if (state.keyBasedAuth  && state.keyBasedAuth  !== "Select") logs.push(`[SSH Auth] Key-Based Auth: ${state.keyBasedAuth}`);
    if (state.disableEmpty) logs.push(`[SSH Auth] Disable Empty Passwords: Enabled`);
    if (state.twoFA)        logs.push(`[SSH Auth] 2FA: Enabled`);

    // SSH Keys
    state.keys.forEach((k, i) => {
      if (k.user || k.fingerprint) {
        logs.push(`[SSH Key #${i + 1}] User: ${k.user || "—"} | Type: ${k.keyType}` +
          (k.fingerprint ? ` | Fingerprint: ${k.fingerprint}` : "") +
          ` | Active: ${k.active ? "Yes" : "No"}`);
      }
    });

    // Access Control
    if (state.allowedIP)    logs.push(`[SSH Access] Allowed IP Range: ${state.allowedIP}`);
    if (state.blockedIP)    logs.push(`[SSH Access] Blocked IP: ${state.blockedIP}`);
    if (state.ipFiltering)  logs.push(`[SSH Access] IP Filtering: Enabled`);
    if (state.rateLimiting) logs.push(`[SSH Access] Rate Limiting: Enabled`);

    if (logs.length === 0) logs.push(`[SSH] Applied — no parameters configured`);

    logs.forEach((message) => dispatchLog(deviceName, deviceLocation, message));
    onClose();
  };

  return createPortal(
    <div className="config-modal-overlay ssh-modal-layer">
      <div className="nat-sidebar-layout">

        {/* SIDEBAR */}
        <div className="nat-sidebar">
          <div className="sidebar-header">
            <Lock size={18} />
            <span>SSH / Remote Access</span>
          </div>
          <div className="nav-list">
            <button className={`nav-item ${state.activeSSHTab === "general" ? "active" : ""}`} onClick={() => set("activeSSHTab", "general")}>
              <div className="nav-icon"><Server size={16} /></div>
              <div className="nav-text"><strong>General</strong><p>Enable & port settings</p></div>
            </button>
            <button className={`nav-item ${state.activeSSHTab === "auth" ? "active" : ""}`} onClick={() => set("activeSSHTab", "auth")}>
              <div className="nav-icon"><ShieldCheck size={16} /></div>
              <div className="nav-text"><strong>Authentication</strong><p>Password / Key access</p></div>
            </button>
            <button className={`nav-item ${state.activeSSHTab === "keys" ? "active" : ""}`} onClick={() => set("activeSSHTab", "keys")}>
              <div className="nav-icon"><Lock size={16} /></div>
              <div className="nav-text"><strong>SSH Keys</strong><p>Public key management</p></div>
            </button>
            <button className={`nav-item ${state.activeSSHTab === "access" ? "active" : ""}`} onClick={() => set("activeSSHTab", "access")}>
              <div className="nav-icon"><Network size={16} /></div>
              <div className="nav-text"><strong>Access Control</strong><p>Allowed IPs / users</p></div>
            </button>
            <button className={`nav-item ${state.activeSSHTab === "sessions" ? "active" : ""}`} onClick={() => set("activeSSHTab", "sessions")}>
              <div className="nav-icon"><Activity size={16} /></div>
              <div className="nav-text"><strong>Sessions</strong><p>Active connections</p></div>
            </button>
          </div>
        </div>

        {/* MAIN */}
        <div className="nat-main-content">
          <div className="modal-header-clean">
            <h3>{state.activeSSHTab.toUpperCase()} Settings</h3>
            <button className="close-btn-mono" onClick={onClose}>×</button>
          </div>

          <div className="config-body">

            {state.activeSSHTab === "general" && (
              <div className="config-group-mono">
                <label>SSH Service Settings</label>
                <div className="inline-fields">
                  <div className="input-wrap">
                    <span>Enable SSH</span>
                    <select value={state.sshEnabled} onChange={(e) => set("sshEnabled", e.target.value)}>
                      <option>Select</option>
                      <option>Enabled</option>
                      <option>Disabled</option>
                    </select>
                  </div>
                  <div className="input-wrap">
                    <span>Port</span>
                    <input placeholder="e.g. 22" value={state.port} onChange={(e) => set("port", e.target.value)} />
                  </div>
                  <div className="input-wrap">
                    <span>Protocol Version</span>
                    <select value={state.protocolVersion} onChange={(e) => set("protocolVersion", e.target.value)}>
                      <option>Select</option>
                      <option>SSH-2 (Recommended)</option>
                      <option>SSH-1 (Legacy)</option>
                    </select>
                  </div>
                </div>
                <div className="checkbox-wrap">
                  <input type="checkbox" checked={state.allowRootLogin} onChange={(e) => set("allowRootLogin", e.target.checked)} />
                  <span>Allow remote root login</span>
                </div>
              </div>
            )}

            {state.activeSSHTab === "auth" && (
              <div className="config-group-mono">
                <label>Authentication Methods</label>
                <div className="inline-fields">
                  <div className="input-wrap">
                    <span>Password Login</span>
                    <select value={state.passwordLogin} onChange={(e) => set("passwordLogin", e.target.value)}>
                      <option>Select</option>
                      <option>Enabled</option>
                      <option>Disabled</option>
                    </select>
                  </div>
                  <div className="input-wrap">
                    <span>Key-Based Auth</span>
                    <select value={state.keyBasedAuth} onChange={(e) => set("keyBasedAuth", e.target.value)}>
                      <option>Select</option>
                      <option>Required</option>
                      <option>Optional</option>
                      <option>Disabled</option>
                    </select>
                  </div>
                </div>
                <div className="checkbox-wrap">
                  <input type="checkbox" checked={state.disableEmpty} onChange={(e) => set("disableEmpty", e.target.checked)} />
                  <span>Disable empty passwords</span>
                </div>
                <div className="checkbox-wrap">
                  <input type="checkbox" checked={state.twoFA} onChange={(e) => set("twoFA", e.target.checked)} />
                  <span>2FA (future support)</span>
                </div>
              </div>
            )}

            {state.activeSSHTab === "keys" && (
              <div className="config-group-mono">
                <label>SSH Public Keys</label>
                <table className="acl-table">
                  <thead>
                    <tr><th>User</th><th>Key Type</th><th>Fingerprint</th><th>Active</th></tr>
                  </thead>
                  <tbody>
                    {state.keys.map((k, i) => (
                      <tr key={i}>
                        <td><input placeholder="e.g. admin" value={k.user} onChange={(e) => updateKey(i, "user", e.target.value)} /></td>
                        <td>
                          <select value={k.keyType} onChange={(e) => updateKey(i, "keyType", e.target.value)}>
                            <option>RSA</option>
                            <option>ECDSA</option>
                            <option>ED25519</option>
                          </select>
                        </td>
                        <td><input placeholder="e.g. SHA256:xxxxxx" value={k.fingerprint} onChange={(e) => updateKey(i, "fingerprint", e.target.value)} /></td>
                        <td><input type="checkbox" checked={k.active} onChange={(e) => updateKey(i, "active", e.target.checked)} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {state.activeSSHTab === "access" && (
              <div className="config-group-mono">
                <label>Access Restrictions</label>
                <div className="inline-fields">
                  <div className="input-wrap">
                    <span>Allowed IP Range</span>
                    <input placeholder="e.g. 192.168.1.0/24" value={state.allowedIP} onChange={(e) => set("allowedIP", e.target.value)} />
                  </div>
                  <div className="input-wrap">
                    <span>Blocked IP</span>
                    <input placeholder="e.g. 0.0.0.0/0 (optional)" value={state.blockedIP} onChange={(e) => set("blockedIP", e.target.value)} />
                  </div>
                </div>
                <div className="checkbox-wrap">
                  <input type="checkbox" checked={state.ipFiltering} onChange={(e) => set("ipFiltering", e.target.checked)} />
                  <span>Enable IP filtering</span>
                </div>
                <div className="checkbox-wrap">
                  <input type="checkbox" checked={state.rateLimiting} onChange={(e) => set("rateLimiting", e.target.checked)} />
                  <span>Rate limiting (anti brute-force)</span>
                </div>
              </div>
            )}

            {state.activeSSHTab === "sessions" && (
              <div className="config-group-mono">
                <label>Active SSH Sessions</label>
                <div className="acl-table">
                  <table>
                    <thead>
                      <tr><th>User</th><th>Source IP</th><th>Uptime</th><th>Status</th></tr>
                    </thead>
                    <tbody>
                      <tr><td>admin</td><td>192.168.1.10</td><td>2h 12m</td><td style={{ color: "green" }}>ACTIVE</td></tr>
                      <tr><td>root</td><td>10.0.0.5</td><td>15m</td><td style={{ color: "green" }}>ACTIVE</td></tr>
                      <tr><td>guest</td><td>203.0.113.9</td><td>—</td><td style={{ color: "red" }}>BLOCKED</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

          </div>

          <div className="modal-footer-clean">
            <button className="btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn-primary" onClick={handleApply}>Apply SSH Config</button>
          </div>
        </div>

      </div>
    </div>,
    document.body
  );
}