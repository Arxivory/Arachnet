import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import { ShieldCheck, Lock, Network, ArrowLeftRight } from "lucide-react";

let persistentACLState = null;

const defaultRules = Array.from({ length: 4 }, (_, i) => ({
  action: "permit",
  protocol: "ip",
  source: "",
  destination: "",
  port: "",
  log: false,
}));

const defaultState = {
  activeACLSection: "rules",
  aclType: "Standard",
  aclName: "",
  implicitDeny: true,
  interface: "G0/0 (LAN)",
  direction: "Inbound",
  applyTo: "All Traffic",
  defaultAction: "Deny",
  loggingLevel: "None",
  statefulInspection: false,
  rateLimiting: false,
  rules: defaultRules,
};

function dispatchLog(deviceName, deviceLocation, message) {
  window.dispatchEvent(
    new CustomEvent("add-system-log", {
      detail: { device: "Router", deviceName, message, location: deviceLocation, italic: true },
    })
  );
}

export default function ACLModal({ onClose, deviceName = "Router-Core-01", deviceLocation = "Data Center" }) {
  const [state, setState] = useState(persistentACLState || defaultState);
  const prevState = useRef(persistentACLState || defaultState);
  const set = (field, value) => setState((s) => ({ ...s, [field]: value }));

  const updateRule = (i, field, value) => {
    const rules = [...state.rules];
    rules[i] = { ...rules[i], [field]: value };
    set("rules", rules);
  };

  const now = () => new Date().toISOString().replace("T", " ").slice(0, 19);

  const handleApply = () => {
    const logs = [];

    // ACL Mode
    if (state.aclType && state.aclType !== "Select") logs.push(`[ACL] Type: ${state.aclType}`);
    if (state.aclName)                               logs.push(`[ACL] ID / Name: ${state.aclName}`);

    // Rules
    state.rules.forEach((rule, i) => {
      if (rule.source || rule.destination || rule.port) {
        logs.push(`[ACL Rule #${i + 1}] Action: ${rule.action} | Protocol: ${rule.protocol}` +
          (rule.source      ? ` | Source: ${rule.source}`           : "") +
          (rule.destination ? ` | Destination: ${rule.destination}` : "") +
          (rule.port        ? ` | Port: ${rule.port}`               : "") +
          (rule.log         ? ` | Log: Enabled`                     : ""));
      }
    });
    if (state.implicitDeny) logs.push(`[ACL] Implicit Deny: Enabled`);

    // Interface Binding
    if (state.interface && state.interface !== "Select") logs.push(`[ACL Binding] Interface: ${state.interface}`);
    if (state.direction && state.direction !== "Select") logs.push(`[ACL Binding] Direction: ${state.direction}`);
    if (state.applyTo   && state.applyTo   !== "Select") logs.push(`[ACL Binding] Apply To: ${state.applyTo}`);

    // Traffic Behavior
    if (state.defaultAction && state.defaultAction !== "Select") logs.push(`[ACL Traffic] Default Action: ${state.defaultAction}`);
    if (state.loggingLevel  && state.loggingLevel  !== "None")   logs.push(`[ACL Traffic] Logging Level: ${state.loggingLevel}`);
    if (state.statefulInspection) logs.push(`[ACL Traffic] Stateful Inspection: Enabled`);
    if (state.rateLimiting)       logs.push(`[ACL Traffic] Rate Limiting: Enabled`);

    if (logs.length === 0) logs.push(`[ACL] Applied — no parameters configured`);

    logs.forEach((message) => dispatchLog(deviceName, deviceLocation, message));
    onClose();
  };

  return createPortal(
    <div className="config-modal-overlay nat-modal-layer">
      <div className="config-modal-content nat-sidebar-layout">

        {/* SIDEBAR */}
        <div className="nat-sidebar">
          <div className="sidebar-header">
            <ShieldCheck size={20} />
            <span>Access Control List Configuration</span>
          </div>
          <div className="nav-list">
            <button className={`nav-item ${state.activeACLSection === "rules" ? "active" : ""}`} onClick={() => set("activeACLSection", "rules")}>
              <div className="nav-icon"><Lock size={16} /></div>
              <div className="nav-text"><strong>ACL Rules</strong><p>Permit / Deny logic</p></div>
            </button>
            <button className={`nav-item ${state.activeACLSection === "binding" ? "active" : ""}`} onClick={() => set("activeACLSection", "binding")}>
              <div className="nav-icon"><Network size={16} /></div>
              <div className="nav-text"><strong>Interface Binding</strong><p>Apply ACL to ports</p></div>
            </button>
            <button className={`nav-item ${state.activeACLSection === "advanced" ? "active" : ""}`} onClick={() => set("activeACLSection", "advanced")}>
              <div className="nav-icon"><ArrowLeftRight size={16} /></div>
              <div className="nav-text"><strong>Traffic Behavior</strong><p>Flow & logging</p></div>
            </button>
          </div>
        </div>

        {/* MAIN */}
        <div className="nat-main-content">
          <div className="modal-header-clean">
            <h3>{state.activeACLSection.toUpperCase()} Settings</h3>
            <button className="close-btn-mono" onClick={onClose}>×</button>
          </div>

          <div className="config-body">

            {/* GLOBAL */}
            <div className="config-group-mono">
              <label>ACL Mode</label>
              <div className="inline-fields">
                <div className="input-wrap">
                  <span>Type</span>
                  <select value={state.aclType} onChange={(e) => set("aclType", e.target.value)}>
                    <option>Select</option>
                    <option>Standard</option>
                    <option>Extended</option>
                  </select>
                </div>
                <div className="input-wrap">
                  <span>ACL ID / Name</span>
                  <input placeholder="e.g. ACL_101" value={state.aclName} onChange={(e) => set("aclName", e.target.value)} />
                </div>
              </div>
            </div>

            {/* DYNAMIC */}
            <div className="config-group-mono highlight-area">

              {state.activeACLSection === "rules" && (
                <>
                  <label>Rule Engine (Top-down priority)</label>
                  <table className="acl-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Action</th>
                        <th>Protocol</th>
                        <th>Source</th>
                        <th>Destination</th>
                        <th>Port</th>
                        <th>Log</th>
                      </tr>
                    </thead>
                    <tbody>
                      {state.rules.map((rule, i) => (
                        <tr key={i}>
                          <td>{i + 1}</td>
                          <td>
                            <select value={rule.action} onChange={(e) => updateRule(i, "action", e.target.value)}>
                              <option>permit</option>
                              <option>deny</option>
                            </select>
                          </td>
                          <td>
                            <select value={rule.protocol} onChange={(e) => updateRule(i, "protocol", e.target.value)}>
                              <option>ip</option>
                              <option>tcp</option>
                              <option>udp</option>
                              <option>icmp</option>
                            </select>
                          </td>
                          <td><input placeholder="e.g. 192.168.1.0/24" value={rule.source} onChange={(e) => updateRule(i, "source", e.target.value)} /></td>
                          <td><input placeholder="e.g. any" value={rule.destination} onChange={(e) => updateRule(i, "destination", e.target.value)} /></td>
                          <td><input placeholder="e.g. 80,443" value={rule.port} onChange={(e) => updateRule(i, "port", e.target.value)} /></td>
                          <td><input type="checkbox" checked={rule.log} onChange={(e) => updateRule(i, "log", e.target.checked)} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="checkbox-wrap">
                    <input type="checkbox" checked={state.implicitDeny} onChange={(e) => set("implicitDeny", e.target.checked)} />
                    <span>Implicit Deny (block unmatched traffic)</span>
                  </div>
                </>
              )}

              {state.activeACLSection === "binding" && (
                <>
                  <label>Apply ACL to Interface</label>
                  <div className="inline-fields">
                    <div className="input-wrap">
                      <span>Interface</span>
                      <select value={state.interface} onChange={(e) => set("interface", e.target.value)}>
                        <option>Select</option>
                        <option>G0/0 (LAN)</option>
                        <option>G0/1 (WAN)</option>
                        <option>VLAN 10</option>
                      </select>
                    </div>
                    <div className="input-wrap">
                      <span>Direction</span>
                      <select value={state.direction} onChange={(e) => set("direction", e.target.value)}>
                        <option>Select</option>
                        <option>Inbound</option>
                        <option>Outbound</option>
                      </select>
                    </div>
                  </div>
                  <div className="input-wrap">
                    <span>Apply To</span>
                    <select value={state.applyTo} onChange={(e) => set("applyTo", e.target.value)}>
                      <option>Select</option>
                      <option>All Traffic</option>
                      <option>Matched Traffic Only</option>
                    </select>
                  </div>
                </>
              )}

              {state.activeACLSection === "advanced" && (
                <>
                  <label>Traffic Behavior</label>
                  <div className="input-wrap">
                    <span>Default Action</span>
                    <select value={state.defaultAction} onChange={(e) => set("defaultAction", e.target.value)}>
                      <option>Select</option>
                      <option>Deny</option>
                      <option>Permit</option>
                    </select>
                  </div>
                  <div className="input-wrap">
                    <span>Logging Level</span>
                    <select value={state.loggingLevel} onChange={(e) => set("loggingLevel", e.target.value)}>
                      <option>Select</option>
                      <option>None</option>
                      <option>Errors Only</option>
                      <option>All Matches</option>
                    </select>
                  </div>
                  <div className="checkbox-wrap">
                    <input type="checkbox" checked={state.statefulInspection} onChange={(e) => set("statefulInspection", e.target.checked)} />
                    <span>Enable Stateful Inspection</span>
                  </div>
                  <div className="checkbox-wrap">
                    <input type="checkbox" checked={state.rateLimiting} onChange={(e) => set("rateLimiting", e.target.checked)} />
                    <span>Enable Rate Limiting</span>
                  </div>
                </>
              )}

            </div>
          </div>

          <div className="modal-footer-clean">
            <button className="btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn-primary" onClick={handleApply}>Apply ACL</button>
          </div>
        </div>

      </div>
    </div>,
    document.body
  );
}