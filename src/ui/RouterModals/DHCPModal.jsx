import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import { Server, Network, ArrowDown, Lock, Activity } from "lucide-react";

// ── Req #3: Persistent state survives close/reopen ────────────────────────────
let persistentDHCPState = null;

const defaultState = {
  dhcpScope:         "basic",
  // Basic
  gateway:           "",
  subnetMask:        "",
  dnsServer:         "",
  dhcpEnabled:       true,
  // Pool
  startIP:           "",
  endIP:             "",
  leaseTime:         "Select",
  conflictHandling:  "Select",
  // Reservations
  reservations: [
    { device: "", mac: "", ip: "", status: "Active" },
    { device: "", mac: "", ip: "", status: "Active" },
    { device: "", mac: "", ip: "", status: "Active" },
  ],
  // Advanced
  domainName:        "",
  ntpServer:         "",
  dhcpRelay:         "",
  dnsUpdateMode:     "Select",
  authoritative:     true,
  conflictDetection: false,
  systemLogging:     false,
  auditTrail:        false,
};

function dispatchLog(deviceName, deviceLocation, message) {
  window.dispatchEvent(
    new CustomEvent("add-system-log", {
      detail: { device: "Router", deviceName, message, location: deviceLocation, italic: true },
    })
  );
}

export default function DHCPModal({ onClose, deviceName = "Router-Core-01", deviceLocation = "Data Center" }) {
  // ── Req #3: Load from persistent store or defaults ────────────────────────
  const [formData, setFormData] = useState(persistentDHCPState || defaultState);

  // ── Req #6: Track previous state for change detection ─────────────────────
  const prevData = useRef(persistentDHCPState || defaultState);

  const handleChange = (field, value) =>
    setFormData((prev) => ({ ...prev, [field]: value }));

  const updateReservation = (index, field, value) => {
    const next = [...formData.reservations];
    next[index] = { ...next[index], [field]: value };
    handleChange("reservations", next);
  };

  const now = () => new Date().toISOString().replace("T", " ").slice(0, 19);

  // ── Apply: collect only what was configured and dispatch to ConsolePanel ───
  const handleApply = () => {
    const logs = [];

    // Basic
    if (formData.gateway)   logs.push(`[DHCP] Default Gateway: ${formData.gateway}`);
    if (formData.subnetMask) logs.push(`[DHCP] Subnet Mask: ${formData.subnetMask}`);
    if (formData.dnsServer)  logs.push(`[DHCP] DNS Server: ${formData.dnsServer}`);
    if (!formData.dhcpEnabled) logs.push(`[DHCP] Service: Disabled`);

    // Pool
    if (formData.startIP)                          logs.push(`[DHCP] Pool Start IP: ${formData.startIP}`);
    if (formData.endIP)                            logs.push(`[DHCP] Pool End IP: ${formData.endIP}`);
    if (formData.leaseTime !== "Select")           logs.push(`[DHCP] Lease Time: ${formData.leaseTime}`);
    if (formData.conflictHandling !== "Select")    logs.push(`[DHCP] Conflict Handling: ${formData.conflictHandling}`);

    // Reservations
    formData.reservations.forEach((r, i) => {
      if (r.mac || r.ip) {
        logs.push(`[DHCP] Reservation #${i + 1}: ${r.device || "unnamed"} | MAC: ${r.mac} → IP: ${r.ip} (${r.status})`);
      }
    });

    // Advanced
    if (formData.domainName)                       logs.push(`[DHCP] Domain Name: ${formData.domainName}`);
    if (formData.ntpServer)                        logs.push(`[DHCP] NTP Server: ${formData.ntpServer}`);
    if (formData.dhcpRelay)                        logs.push(`[DHCP] Relay (Helper): ${formData.dhcpRelay}`);
    if (formData.dnsUpdateMode !== "Select")       logs.push(`[DHCP] DNS Update Mode: ${formData.dnsUpdateMode}`);
    if (formData.conflictDetection)                logs.push(`[DHCP] Conflict Detection: Enabled`);
    if (formData.auditTrail)                       logs.push(`[DHCP] Audit Trail: Enabled`);

    if (logs.length === 0) logs.push(`[DHCP] Applied — no parameters configured`);

    logs.forEach((message) => dispatchLog(deviceName, deviceLocation, message));
    onClose();
  };

  // ────────────────────────────────────────────────────────────────────────────
  return createPortal(
    <div className="config-modal-overlay dhcp-modal-layer">
      <div className="config-modal-content nat-sidebar-layout">

        {/* SIDEBAR */}
        <div className="nat-sidebar">
          <div className="sidebar-header">
            <Server size={18} />
            <span>DHCP Service</span>
          </div>

          <div className="nav-list">
            <button
              className={`nav-item ${formData.dhcpScope === "basic" ? "active" : ""}`}
              onClick={() => handleChange("dhcpScope", "basic")}
            >
              <div className="nav-icon"><Network size={16} /></div>
              <div className="nav-text"><strong>Basic Setup</strong><p>Gateway &amp; DNS</p></div>
            </button>

            <button
              className={`nav-item ${formData.dhcpScope === "pool" ? "active" : ""}`}
              onClick={() => handleChange("dhcpScope", "pool")}
            >
              <div className="nav-icon"><ArrowDown size={16} /></div>
              <div className="nav-text"><strong>IP Pool Engine</strong><p>Allocation system</p></div>
            </button>

            <button
              className={`nav-item ${formData.dhcpScope === "reservation" ? "active" : ""}`}
              onClick={() => handleChange("dhcpScope", "reservation")}
            >
              <div className="nav-icon"><Lock size={16} /></div>
              <div className="nav-text"><strong>Binding Table</strong><p>Static Mappings</p></div>
            </button>

            <button
              className={`nav-item ${formData.dhcpScope === "advanced" ? "active" : ""}`}
              onClick={() => handleChange("dhcpScope", "advanced")}
            >
              <div className="nav-icon"><Activity size={16} /></div>
              <div className="nav-text"><strong>System Control</strong><p>Advanced Policies</p></div>
            </button>
          </div>
        </div>

        {/* MAIN */}
        <div className="nat-main-content">
          <div className="modal-header-clean">
            <h3>DHCP {formData.dhcpScope.toUpperCase()} CONFIG</h3>
            <button className="close-btn-mono" onClick={onClose}>×</button>
          </div>

          <div className="config-body">

            {/* ── BASIC ─────────────────────────────────────────────────── */}
            {formData.dhcpScope === "basic" && (
              <div className="config-group-mono highlight-area">
                <label>Core DHCP Engine</label>
                <div className="inline-fields">
                  <div className="input-wrap">
                    <span>Default Gateway</span>
                    <input
                      placeholder="e.g. 192.168.1.1"
                      value={formData.gateway}
                      onChange={(e) => handleChange("gateway", e.target.value)}
                    />
                  </div>
                  <div className="input-wrap">
                    <span>Subnet Mask</span>
                    <input
                      placeholder="e.g. 255.255.255.0"
                      value={formData.subnetMask}
                      onChange={(e) => handleChange("subnetMask", e.target.value)}
                    />
                  </div>
                  <div className="input-wrap">
                    <span>DNS Server</span>
                    <input
                      placeholder="e.g. 8.8.8.8"
                      value={formData.dnsServer}
                      onChange={(e) => handleChange("dnsServer", e.target.value)}
                    />
                  </div>
                </div>
                <div className="checkbox-wrap">
                  <input
                    type="checkbox"
                    checked={formData.dhcpEnabled}
                    onChange={(e) => handleChange("dhcpEnabled", e.target.checked)}
                  />
                  <span>Enable DHCP service on this device</span>
                </div>
              </div>
            )}

            {/* ── POOL ──────────────────────────────────────────────────── */}
            {formData.dhcpScope === "pool" && (
              <div className="config-group-mono highlight-area">
                <label>IP Allocation Engine</label>
                <div className="inline-fields">
                  <div className="input-wrap">
                    <span>Start IP</span>
                    <input
                      placeholder="e.g. 192.168.1.100"
                      value={formData.startIP}
                      onChange={(e) => handleChange("startIP", e.target.value)}
                    />
                  </div>
                  <div className="input-wrap">
                    <span>End IP</span>
                    <input
                      placeholder="e.g. 192.168.1.200"
                      value={formData.endIP}
                      onChange={(e) => handleChange("endIP", e.target.value)}
                    />
                  </div>
                </div>
                <div className="inline-fields">
                  <div className="input-wrap">
                    <span>Lease Time Policy</span>
                    {/* Req #7: default "Select" */}
                    <select
                      value={formData.leaseTime}
                      onChange={(e) => handleChange("leaseTime", e.target.value)}
                    >
                      <option value="Select" disabled>Select</option>
                      <option>1 hour</option>
                      <option>12 hours</option>
                      <option>24 hours</option>
                      <option>7 days</option>
                    </select>
                  </div>
                  <div className="input-wrap">
                    <span>Conflict Handling</span>
                    <select
                      value={formData.conflictHandling}
                      onChange={(e) => handleChange("conflictHandling", e.target.value)}
                    >
                      <option value="Select" disabled>Select</option>
                      <option>Reject duplicate</option>
                      <option>Override oldest</option>
                      <option>Ignore conflict</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* ── RESERVATIONS ──────────────────────────────────────────── */}
            {formData.dhcpScope === "reservation" && (
              <div className="config-group-mono highlight-area">
                <label>Static Binding Table</label>
                <table className="acl-table">
                  <thead>
                    <tr>
                      <th>Device</th>
                      <th>MAC Address</th>
                      <th>Reserved IP</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {formData.reservations.map((r, i) => (
                      <tr key={i}>
                        <td>
                          <input
                            placeholder="e.g. PC-Reception"
                            value={r.device}
                            onChange={(e) => updateReservation(i, "device", e.target.value)}
                          />
                        </td>
                        <td>
                          <input
                            placeholder="e.g. AA:BB:CC:DD:EE:FF"
                            value={r.mac}
                            onChange={(e) => updateReservation(i, "mac", e.target.value)}
                          />
                        </td>
                        <td>
                          <input
                            placeholder="e.g. 192.168.1.50"
                            value={r.ip}
                            onChange={(e) => updateReservation(i, "ip", e.target.value)}
                          />
                        </td>
                        <td>
                          <select
                            value={r.status}
                            onChange={(e) => updateReservation(i, "status", e.target.value)}
                          >
                            <option>Active</option>
                            <option>Disabled</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* ── ADVANCED ──────────────────────────────────────────────── */}
            {formData.dhcpScope === "advanced" && (
              <div className="config-group-mono highlight-area">
                <label>DHCP System Policies</label>
                <div className="inline-fields">
                  <div className="input-wrap">
                    <span>Domain Name</span>
                    <input
                      placeholder="e.g. corp.local"
                      value={formData.domainName}
                      onChange={(e) => handleChange("domainName", e.target.value)}
                    />
                  </div>
                  <div className="input-wrap">
                    <span>NTP Server</span>
                    <input
                      placeholder="e.g. time.google.com"
                      value={formData.ntpServer}
                      onChange={(e) => handleChange("ntpServer", e.target.value)}
                    />
                  </div>
                </div>
                <div className="inline-fields">
                  <div className="input-wrap">
                    <span>DHCP Relay (Helper)</span>
                    <input
                      placeholder="e.g. 192.168.10.1"
                      value={formData.dhcpRelay}
                      onChange={(e) => handleChange("dhcpRelay", e.target.value)}
                    />
                  </div>
                  <div className="input-wrap">
                    <span>DNS Update Mode</span>
                    <select
                      value={formData.dnsUpdateMode}
                      onChange={(e) => handleChange("dnsUpdateMode", e.target.value)}
                    >
                      <option value="Select" disabled>Select</option>
                      <option>Automatic</option>
                      <option>Manual</option>
                      <option>Disabled</option>
                    </select>
                  </div>
                </div>
                <div className="checkbox-wrap">
                  <input
                    type="checkbox"
                    checked={formData.authoritative}
                    onChange={(e) => handleChange("authoritative", e.target.checked)}
                  />
                  <span>Authoritative DHCP server</span>
                </div>
                <div className="checkbox-wrap">
                  <input
                    type="checkbox"
                    checked={formData.conflictDetection}
                    onChange={(e) => handleChange("conflictDetection", e.target.checked)}
                  />
                  <span>Enable conflict detection engine</span>
                </div>
                <div className="checkbox-wrap">
                  <input
                    type="checkbox"
                    checked={formData.auditTrail}
                    onChange={(e) => handleChange("auditTrail", e.target.checked)}
                  />
                  <span>Enable audit trail logging</span>
                </div>
              </div>
            )}

          </div>

          <div className="modal-footer-clean">
            <button className="btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn-primary" onClick={handleApply}>Apply Configuration</button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}