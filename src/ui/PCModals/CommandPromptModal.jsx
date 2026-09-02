import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import appState from "../../state/AppState";

// ─── Dispatch helper ──────────────────────────────────────────────────────────
function dispatchLog(deviceName, message, location = "Unknown") {
  window.dispatchEvent(
    new CustomEvent("add-system-log", {
      detail: { device: "PC", deviceName, message, location },
    })
  );
}

// ─── Tiny helper: format timestamp ───────────────────────────────────────────
const ts = () => new Date().toISOString().replace("T", " ").slice(0, 19);

// ─── FastEthernet0 filter ─────────────────────────────────────────────────────
const isFastEthernet = (name = "") => /^fastethernet\d/i.test(name.trim());

// ─── Resolve FastEthernet0 from a Device instance or NetworkStore plain object ─
// Returns the live interface object, or null.
function resolveFastEthernet0(device) {
  if (!device) return null;

  // Device class instance — _interfaces is a Map keyed by interface name
  if (device._interfaces instanceof Map) {
    const all = [...device._interfaces.values()];
    const iface = all.find((i) => isFastEthernet(i.name));
    return iface || all[0] || null;
  }

  // NetworkStore plain object — interfaces is an array
  if (Array.isArray(device.interfaces) && device.interfaces.length > 0) {
    const iface = device.interfaces.find((i) =>
      isFastEthernet(i.name || i.label || "")
    );
    return iface || device.interfaces[0];
  }

  return null;
}

// ─── Read IPv4 fields from a live interface ref ───────────────────────────────
// Normalises both the Interface class shape and the plain NetworkStore shape.
function readIpv4(ifaceRef, device) {
  if (!ifaceRef && !device) return { address: "", subnetMask: "", gateway: "", dns: "" };
  const v4 = ifaceRef?.ipv4 || ifaceRef?._ipv4 || ifaceRef?.ip || ifaceRef?.address || device?._ipv4 || device?.ipv4 || {};
  return {
    address:    v4.address    || v4.ip   || v4.ipAddress || ifaceRef?.address || ifaceRef?.ip || "",
    subnetMask: v4.subnetMask || v4.mask || v4.netmask || ifaceRef?.subnetMask || ifaceRef?.netmask || "",
    gateway:    v4.gateway    || v4.gw   || v4.defaultGateway || ifaceRef?.gateway || ifaceRef?.gw || "",
    dns:        v4.dns        || v4.dns1 || v4.dnsServer || ifaceRef?.dns || "",
  };
}

// ─── Simulated ping output ────────────────────────────────────────────────────
function simulatePing(target, deviceName, location) {
  if (!target || target.trim() === "") return ["Bad parameter", ""];
  const trimmed = target.trim();

  const ipv4Regex     = /^(\d{1,3}\.){3}\d{1,3}$/;
  const ipv6Regex     = /^[0-9a-fA-F:]+$/;
  const hostnameRegex = /^[a-zA-Z0-9.-]+$/;
  const isValid = ipv4Regex.test(trimmed) || ipv6Regex.test(trimmed) || hostnameRegex.test(trimmed);

  if (!isValid) {
    return [`Ping request could not find host ${trimmed}. Please check the name and try again.`, ""];
  }

  let success = true;
  let timeMs  = [32, 28, 31, 29];

  if (ipv4Regex.test(trimmed)) {
    const lastOctet = parseInt(trimmed.split(".")[3], 10);
    success = lastOctet !== 0 && lastOctet !== 255;
    timeMs  = timeMs.map((t) => t + (lastOctet % 10));
  }

  const lines = [``, `Pinging ${trimmed} with 32 bytes of data:`];

  if (success) {
    for (let i = 0; i < 4; i++) lines.push(`Reply from ${trimmed}: bytes=32 time=${timeMs[i]}ms TTL=128`);
    lines.push(``, `Ping statistics for ${trimmed}:`);
    lines.push(`    Packets: Sent = 4, Received = 4, Lost = 0 (0% loss),`);
    lines.push(`Approximate round trip times in milli-seconds:`);
    const avg = Math.round(timeMs.reduce((a, b) => a + b, 0) / timeMs.length);
    lines.push(`    Minimum = ${Math.min(...timeMs)}ms, Maximum = ${Math.max(...timeMs)}ms, Average = ${avg}ms`);
    dispatchLog(deviceName,
      `%SYS-6-PING: [${ts()}] ${deviceName} @ ${location} — Ping to ${trimmed}: 4/4 packets received (0% loss). Avg RTT ${avg}ms.`,
      location
    );
  } else {
    for (let i = 0; i < 4; i++) lines.push(`Request timeout for icmp_seq ${i}`);
    lines.push(``, `Ping statistics for ${trimmed}:`);
    lines.push(`    Packets: Sent = 4, Received = 0, Lost = 4 (100% loss),`);
    dispatchLog(deviceName,
      `%SYS-5-PING_FAIL: [${ts()}] ${deviceName} @ ${location} — Ping to ${trimmed}: 0/4 packets received (100% loss). Host unreachable.`,
      location
    );
  }

  lines.push(``);
  return lines;
}

// ─── Simulated tracert output ─────────────────────────────────────────────────
function simulateTracert(target, deviceName, location) {
  if (!target || target.trim() === "") return ["Bad parameter", ""];
  const trimmed   = target.trim();
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;

  const lines    = [``, `Tracing route to ${trimmed} over a maximum of 30 hops:`, ``];
  const hopCount = ipv4Regex.test(trimmed) ? 3 : 5;

  for (let i = 1; i <= hopCount; i++) {
    const ms1   = 5 + i * 3 + Math.floor(Math.random() * 4);
    const hopIp = ipv4Regex.test(trimmed) ? `10.0.${i}.1` : `2001:db8::${i}`;
    lines.push(`  ${String(i).padStart(2)}  ${ms1} ms  ${ms1 + 1} ms  ${ms1 + 2} ms  ${i === hopCount ? trimmed : hopIp}`);
  }

  lines.push(``, `Trace complete.`, ``);
  dispatchLog(deviceName,
    `%SYS-6-TRACERT: [${ts()}] ${deviceName} @ ${location} — Traceroute to ${trimmed} completed. ${hopCount} hops.`,
    location
  );
  return lines;
}

// ─── Simulated ipconfig output ────────────────────────────────────────────────
// Reads live values from the resolved FastEthernet0 interface.
function simulateIpconfig(deviceName, ifaceRef, device) {
  const { address, subnetMask, gateway, dns } = readIpv4(ifaceRef, device);

  return [
    ``, `Windows IP Configuration`, ``,
    `Ethernet adapter FastEthernet0:`, ``,
    `   Connection-specific DNS Suffix  . :`,
    `   IPv4 Address. . . . . . . . . . . : ${address}`,
    `   Subnet Mask . . . . . . . . . . . : ${subnetMask}`,
    `   Default Gateway . . . . . . . . . : ${gateway}`,
    ``,
  ];
}

// ─── Simulated ipconfig /all output ──────────────────────────────────────────
function simulateIpconfigAll(deviceName, ifaceRef, device) {
  const { address, subnetMask, gateway, dns } = readIpv4(ifaceRef, device);

  // Deterministic MAC derived from deviceName
  const seed  = [...deviceName].reduce((a, c) => a + c.charCodeAt(0), 0);
  const hex2  = (n) => (n & 0xff).toString(16).padStart(2, "0").toUpperCase();
  const mac   = `${hex2(seed)}-${hex2(seed * 3)}-${hex2(seed * 7)}-${hex2(seed * 11)}-${hex2(seed * 13)}-${hex2(seed * 17)}`;

  return [
    ``, `Windows IP Configuration`, ``,
    `   Host Name . . . . . . . . . . . . : ${deviceName}`,
    `   Primary Dns Suffix  . . . . . . . :`,
    `   Node Type . . . . . . . . . . . . : Hybrid`,
    `   IP Routing Enabled. . . . . . . . : No`,
    `   WINS Proxy Enabled. . . . . . . . : No`,
    ``,
    `Ethernet adapter FastEthernet0:`, ``,
    `   Connection-specific DNS Suffix  . :`,
    `   Description . . . . . . . . . . . : FastEthernet Adapter`,
    `   Physical Address. . . . . . . . . : ${mac}`,
    `   DHCP Enabled. . . . . . . . . . . : No`,
    `   Autoconfiguration Enabled . . . . : Yes`,
    `   IPv4 Address. . . . . . . . . . . : ${address}`,
    `   Subnet Mask . . . . . . . . . . . : ${subnetMask}`,
    `   Default Gateway . . . . . . . . . : ${gateway}`,
    `   DNS Servers . . . . . . . . . . . : ${dns}`,
    ``,
  ];
}

// ─── Known commands ───────────────────────────────────────────────────────────
const HELP_TEXT = [
  ``,
  `Available commands:`,
  `  ping <host>         Send ICMP echo requests`,
  `  tracert <host>      Trace route to destination`,
  `  ipconfig            Display IP configuration`,
  `  ipconfig /all       Display full IP configuration`,
  `  cls                 Clear the screen`,
  `  help                Show this help message`,
  ``,
];

function processCommand(raw, deviceName, location, ifaceRef, device) {
  const line  = raw.trim();
  const lower = line.toLowerCase();
  const parts = lower.split(/\s+/);
  const cmd   = parts[0];
  const arg   = parts.slice(1).join(" ");

  if (cmd === "")                                return [];
  if (cmd === "cls")                             return ["__CLEAR__"];
  if (cmd === "help" || cmd === "/?")            return HELP_TEXT;
  if (cmd === "ping")                            return simulatePing(arg, deviceName, location);
  if (cmd === "tracert" || cmd === "traceroute") return simulateTracert(arg, deviceName, location);
  if (cmd === "ipconfig") {
    return arg === "/all"
      ? simulateIpconfigAll(deviceName, ifaceRef, device)
      : simulateIpconfig(deviceName, ifaceRef, device);
  }

  return [
    `'${cmd}' is not recognized as an internal or external command,`,
    `operable program or batch file.`, ``,
  ];
}

// ─── Sidebar nav items ────────────────────────────────────────────────────────
const NAV_ITEMS = [
  {
    id: "terminal",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>
      </svg>
    ),
    label: "Terminal",
    sub: "Command Prompt",
  },
  {
    id: "help",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10"/>
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
        <line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
    ),
    label: "Help",
    sub: "Available commands",
  },
];

// ─── Component ────────────────────────────────────────────────────────────────
export default function CommandPromptModal({
  onClose,
  device,                 // Device instance or NetworkStore plain object
  deviceName     = "PC",
  deviceLocation = "Unknown",
  networkManager = null,
}) {
  // Resolve the FastEthernet0 interface once — stable ref for the session.
  // If IP config changes while the modal is open, ipconfig will re-read the
  // live object on next invocation because ifaceRef is a reference, not a copy.
  const ifaceRef = resolveFastEthernet0(device);

  const [activeTab, setActiveTab] = useState("terminal");
  const [lines,     setLines]     = useState([
    `Microsoft Windows [Version 10.0.19044]`,
    `(c) Microsoft Corporation. All rights reserved.`,
    ``,
  ]);
  const [input,       setInput]       = useState("");
  const [history,     setHistory]     = useState([]);
  const [histIdx,     setHistIdx]     = useState(-1);
  const [isPingExecuting, setIsPingExecuting] = useState(false);
  const [pingMessage, setPingMessage] = useState("");

  const bottomRef = useRef(null);
  const inputRef  = useRef(null);

  async function performNetworkPing(target) {
    const trimmed = target.trim();
    const ifaceIp = readIpv4(ifaceRef, device).address;

    if (!networkManager) console.log('[CommandPromptModal] No network manager available, falling back to simulated ping output.');

    if (!networkManager || !ifaceIp || !trimmed) {
      return simulatePing(target, deviceName, deviceLocation);
    }

    setIsPingExecuting(true);
    setPingMessage(`Sending ICMP echo request from ${ifaceIp} to ${trimmed}...`);

    const packetId = networkManager.sendPing(ifaceIp, trimmed);
    if (!packetId) {
      setIsPingExecuting(false);
      return [`Ping request could not find host ${trimmed}. Please check the name and try again.`, ""];
    }

    const startTime = Date.now();
    // Increased from 4000ms to 8000ms to allow ARP resolution (5s) + processing
    const timeoutMs = 8000;

    const result = await new Promise((resolve) => {
      let finished = false;
      const cleanup = () => {
        if (finished) return;
        finished = true;
        networkManager.removeEventListener('packetDelivered', onDelivered);
        networkManager.removeEventListener('packetDropped', onDropped);
        clearTimeout(timeoutId);
      };

      const onDelivered = (data) => {
        const ipPacket = data.packet?.payload;
        const icmp = ipPacket?.payload;
        if (!ipPacket || ipPacket.protocol !== 'icmp' || !icmp) return;

        if (
          icmp.type === 'echo-reply' &&
          ipPacket.srcIP === trimmed &&
          ipPacket.dstIP === ifaceIp
        ) {
          cleanup();
          resolve({ success: true, rtt: Date.now() - startTime });
        }
      };

      const onDropped = (data) => {
        if (data.packetId === packetId) {
          cleanup();
          resolve({ success: false, reason: 'dropped' });
        }
      };

      const timeoutId = setTimeout(() => {
        cleanup();
        resolve({ success: false, reason: 'timeout' });
      }, timeoutMs);

      networkManager.addEventListener('packetDelivered', onDelivered);
      networkManager.addEventListener('packetDropped', onDropped);
    });

    setPingMessage(`Processing results from ${trimmed}...`);
    await new Promise((resolve) => setTimeout(resolve, 300));
    setIsPingExecuting(false);

    if (result.success) {
      const avg = Math.max(1, Math.round(result.rtt));
      const times = [avg - 1, avg, avg + 1, avg + 2].map((t) => Math.max(1, t));
      return [
        ``,
        `Pinging ${trimmed} with 32 bytes of data:`,
        ...times.map((time, index) => `Reply from ${trimmed}: bytes=32 time=${time}ms TTL=128`),
        ``,
        `Ping statistics for ${trimmed}:`,
        `    Packets: Sent = 4, Received = 4, Lost = 0 (0% loss),`,
        `Approximate round trip times in milli-seconds:`,
        `    Minimum = ${Math.min(...times)}ms, Maximum = ${Math.max(...times)}ms, Average = ${Math.round(times.reduce((a, b) => a + b, 0) / times.length)}ms`,
        ``,
      ];
    }

    return [
      ``,
      `Pinging ${trimmed} with 32 bytes of data:`,
      `Request timed out for icmp_seq 0`,
      `Request timed out for icmp_seq 1`,
      `Request timed out for icmp_seq 2`,
      `Request timed out for icmp_seq 3`,
      ``,
      `Ping statistics for ${trimmed}:`,
      `    Packets: Sent = 4, Received = 0, Lost = 4 (100% loss),`,
      ``,
    ];
  }

  const PROMPT = `C:\\Users\\${deviceName}>`;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  useEffect(() => {
    if (activeTab === "terminal") inputRef.current?.focus();
  }, [activeTab]);

  const handleSubmit = async () => {
    const raw    = input;
    const lower  = raw.trim().toLowerCase();
    const parts  = lower.split(/\s+/);
    const cmd    = parts[0];
    const arg    = parts.slice(1).join(" ");

    if (cmd === "ping" && networkManager) {
      setLines((prev) => [...prev, `${PROMPT}${raw}`]);
      if (raw.trim()) setHistory((prev) => [raw, ...prev]);
      setHistIdx(-1);
      setInput("");

      const output = await performNetworkPing(arg);
      setLines((prev) => [...prev, ...output]);
      return;
    }

    const output = processCommand(raw, deviceName, deviceLocation, ifaceRef, device);

    if (output[0] === "__CLEAR__") {
      setLines([]);
      setInput("");
      return;
    }

    setLines((prev) => [...prev, `${PROMPT}${raw}`, ...output]);
    if (raw.trim()) setHistory((prev) => [raw, ...prev]);
    setHistIdx(-1);
    setInput("");
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      const nextIdx = Math.min(histIdx + 1, history.length - 1);
      setHistIdx(nextIdx);
      setInput(history[nextIdx] || "");
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const nextIdx = Math.max(histIdx - 1, -1);
      setHistIdx(nextIdx);
      setInput(nextIdx === -1 ? "" : history[nextIdx] || "");
      return;
    }
  };

  return createPortal(
    <div
      className="acl-modal-layer"
      style={{
        position: "fixed", inset: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 9999,
      }}
    >
      <div className="acl-layout">

        {/* ── Sidebar ──────────────────────────────────────────────────── */}
        <aside className="acl-sidebar">
          <div className="acl-sidebar-header">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="3" width="20" height="14" rx="2"/>
              <polyline points="8 21 12 17 16 21"/>
            </svg>
            {deviceName}
          </div>

          <nav className="acl-nav-list">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                className={`acl-nav-item${activeTab === item.id ? " active" : ""}`}
                onClick={() => setActiveTab(item.id)}
              >
                <span className="acl-nav-icon">{item.icon}</span>
                <span className="acl-nav-text">
                  <strong>{item.label}</strong>
                  <p>{item.sub}</p>
                </span>
              </button>
            ))}
          </nav>
        </aside>

        {/* ── Main panel ───────────────────────────────────────────────── */}
        <div className="acl-main">
          <div className="acl-header">
            <h3>Command Prompt — {deviceName}</h3>
            <button
              onClick={onClose}
              style={{
                background: "transparent", border: "none", cursor: "pointer",
                color: "#999", fontSize: 16, lineHeight: 1, padding: "2px 4px",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#111")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "#999")}
            >✕</button>
          </div>

          {/* ── Terminal tab ─────────────────────────────────────────── */}
          {activeTab === "terminal" && (
            <>
              <div
                className="acl-body"
                style={{
                  position: "relative",
                  background: "#0c0c0c",
                  padding: "10px 14px",
                  cursor: "text",
                  overflowY: "auto",
                  flex: 1,
                }}
                onClick={() => inputRef.current?.focus()}
              >
                {isPingExecuting && (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      background: "rgba(0, 0, 0, 0.55)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      zIndex: 2,
                      pointerEvents: "none",
                    }}
                  >
                    <div
                      style={{
                        padding: "14px 18px",
                        background: "rgba(20, 20, 20, 0.95)",
                        borderRadius: 10,
                        color: "#fff",
                        fontSize: 13,
                        textAlign: "center",
                        boxShadow: "0 0 0 1px rgba(255,255,255,0.08)",
                        maxWidth: 360,
                      }}
                    >
                      {pingMessage || "Processing ping command..."}
                    </div>
                  </div>
                )}
                {lines.map((line, i) => (
                  <p
                    key={i}
                    style={{
                      margin: 0, padding: 0,
                      lineHeight: "1.5",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-all",
                      fontFamily: "'Consolas', 'Lucida Console', monospace",
                      fontSize: 13,
                      color: "#c0c0c0",
                    }}
                  >
                    {line || "\u00A0"}
                  </p>
                ))}
                <div ref={bottomRef} />
              </div>

              <div
                style={{
                  display: "flex", alignItems: "center",
                  background: "#0c0c0c",
                  padding: "0 14px 12px",
                  borderTop: "1px solid #1e1e1e",
                  flexShrink: 0,
                }}
              >
                <span
                  style={{
                    color: "#c0c0c0", whiteSpace: "nowrap",
                    fontFamily: "'Consolas', 'Lucida Console', monospace",
                    fontSize: 13, lineHeight: "1.5",
                  }}
                >
                  {PROMPT}
                </span>
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  autoComplete="off"
                  spellCheck={false}
                  style={{
                    flex: 1,
                    background: "transparent",
                    border: "none", outline: "none",
                    color: "#c0c0c0",
                    fontFamily: "'Consolas', 'Lucida Console', monospace",
                    fontSize: 13,
                    caretColor: "#c0c0c0",
                    lineHeight: "1.5",
                    padding: 0, margin: 0,
                  }}
                />
              </div>
            </>
          )}

          {/* ── Help tab ─────────────────────────────────────────────── */}
          {activeTab === "help" && (
            <div className="acl-body">
              <div className="acl-section">
                <label>Available Commands</label>
                <table className="acl-table">
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left" }}>Command</th>
                      <th style={{ textAlign: "left" }}>Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ["ping <host>",       "Send ICMP echo requests to a host"],
                      ["tracert <host>",    "Trace the route to a destination"],
                      ["ipconfig",          "Display IP configuration"],
                      ["ipconfig /all",     "Display full IP configuration"],
                      ["cls",               "Clear the terminal screen"],
                      ["help",              "Show available commands"],
                    ].map(([cmd, desc]) => (
                      <tr key={cmd}>
                        <td style={{ textAlign: "left", fontFamily: "monospace", fontWeight: 600 }}>{cmd}</td>
                        <td style={{ textAlign: "left", color: "#555" }}>{desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="acl-section">
                <label>Tips</label>
                <p style={{ fontSize: 12, color: "#666", lineHeight: 1.6 }}>
                  Use <strong>↑ / ↓</strong> arrow keys to cycle through command history.
                  Press <strong>Enter</strong> to run a command.
                  Type <strong>cls</strong> to clear the screen.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}