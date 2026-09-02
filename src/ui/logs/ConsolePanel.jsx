import { Trash2, BrushCleaning, FunnelPlus } from "lucide-react";
import { useState, useMemo, useEffect, useRef } from "react";

const EMPTY_FILTERS = {
  device:     "",
  deviceName: "",
  location:   "",
  date:       "",
};

// ── Single source of truth for column widths ──────────────────────────────────
const COL_WIDTHS = {
  device:   "10%",
  name:     "14%",
  msg:      "40%",
  time:     "10%",
  date:     "10%",
  location: "11%",
  action:   "5%",
};

// Shared th/td style — guarantees header and body columns are pixel-identical
const cellStyle = {
  paddingLeft:  8,
  paddingRight: 4,
  overflow:     "hidden",
  textOverflow: "ellipsis",
  whiteSpace:   "nowrap",
  verticalAlign:"middle",
  textAlign:    "left",
  boxSizing:    "border-box",
};

function Colgroup() {
  return (
    <colgroup>
      <col style={{ width: COL_WIDTHS.device   }} />
      <col style={{ width: COL_WIDTHS.name     }} />
      <col style={{ width: COL_WIDTHS.msg      }} />
      <col style={{ width: COL_WIDTHS.time     }} />
      <col style={{ width: COL_WIDTHS.date     }} />
      <col style={{ width: COL_WIDTHS.location }} />
      <col style={{ width: COL_WIDTHS.action   }} />
    </colgroup>
  );
}

export default function ConsolePanel({ logData, setLogData }) {
  const [search,         setSearch]         = useState("");
  const [showClearModal, setShowClearModal] = useState(false);
  const [showFilters,    setShowFilters]    = useState(false);
  const [tempFilters,    setTempFilters]    = useState(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(EMPTY_FILTERS);

  const scrollRef  = useRef(null);
  const tbodyWrap  = useRef(null);
  const [scrollH, setScrollH] = useState(40);

  // ── Scroll to top on new log ───────────────────────────────────────────────
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [logData.length]);

  // ── Filtered view ──────────────────────────────────────────────────────────
  const filteredLogs = useMemo(() => {
    return logData.filter((log) => {
      const searchMatch =
        !search ||
        log.message.toLowerCase().includes(search.toLowerCase());
      const deviceMatch =
        !appliedFilters.device ||
        log.device.toLowerCase().includes(appliedFilters.device.toLowerCase());
      const deviceNameMatch =
        !appliedFilters.deviceName ||
        log.deviceName.toLowerCase().includes(appliedFilters.deviceName.toLowerCase());
      const locationMatch =
        !appliedFilters.location ||
        log.location.toLowerCase().includes(appliedFilters.location.toLowerCase());
      const dateMatch =
        !appliedFilters.date || log.date === appliedFilters.date;
      return searchMatch && deviceMatch && deviceNameMatch && locationMatch && dateMatch;
    });
  }, [logData, search, appliedFilters]);

  // ── Filter modal handlers ──────────────────────────────────────────────────
  const openFilterModal = () => {
    setTempFilters(EMPTY_FILTERS);
    setShowFilters(true);
  };

  const handleApplyFilters = () => {
    setAppliedFilters(tempFilters);
    setShowFilters(false);
  };

  const handleResetFilters = () => {
    setTempFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
    setShowFilters(false);
  };

  const clearAllLogs = () => {
    setLogData([]);
    setShowClearModal(false);
  };

  const deleteLog = (id) => {
    setLogData((prev) => prev.filter((log) => log.id !== id));
  };

  // ── Search highlight ───────────────────────────────────────────────────────
  const highlightText = (text, highlight) => {
    if (!highlight.trim()) return text;
    const escaped = highlight.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const parts   = text.split(new RegExp(`(${escaped})`, "gi"));
    return (
      <span>
        {parts.map((part, i) =>
          part.toLowerCase() === highlight.toLowerCase() ? (
            <mark key={i} style={{ background: "#e0e0e0", color: "inherit", padding: "0 1px", borderRadius: "2px" }}>
              {part}
            </mark>
          ) : (
            part
          )
        )}
      </span>
    );
  };

  // ── Display state ──────────────────────────────────────────────────────────
  const hasLogs        = logData.length > 0;
  const showNoMatch    = hasLogs && filteredLogs.length === 0;
  const showEmptyState = !hasLogs;
  const isSearching    = search.trim() !== "";

  const MIN_SCROLL = 40;
  const MAX_SCROLL = 175;

  // ── Dynamically size the scroll area to match actual rendered content ──────
  useEffect(() => {
    const el = tbodyWrap.current;
    if (!el) return;

    const observer = new ResizeObserver(([entry]) => {
      const contentH = entry.contentRect.height;
      if (!hasLogs) {
        setScrollH(MIN_SCROLL);
      } else {
        setScrollH(Math.min(MAX_SCROLL, Math.max(MIN_SCROLL, contentH)));
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, [hasLogs]);

  return (
    <div className="console-panel">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="console-panel-header">
        <h3 className="panel-header-title">Logs</h3>
        <div className="console-panel-controls">
          <input
            type="text"
            placeholder="Search message..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="console-panel-input"
          />
          <button onClick={() => setShowClearModal(true)} className="console-panel-btn">
            <BrushCleaning size={12} className="console-panel-icon" />
            <span>Clear</span>
          </button>
          <button onClick={openFilterModal} className="console-panel-btn">
            <FunnelPlus size={12} className="console-panel-icon" />
            <span>Filter</span>
          </button>
        </div>
      </div>

      {/* ── Table ──────────────────────────────────────────────────────────── */}
      {/*
        ALIGNMENT FIX (#2):
        Both the header <table> and the body <table> share the same
        Colgroup component and the same `cellStyle` object, so every
        th and td will be pixel-perfect aligned regardless of scroll.
      */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Fixed thead */}
        <table
          className="console-panel-table"
          style={{ tableLayout: "fixed", width: "100%", borderCollapse: "collapse" }}
        >
          <Colgroup />
          <thead>
            <tr>
              <th style={cellStyle}>Device</th>
              <th style={cellStyle}>Name</th>
              <th style={cellStyle}>Message</th>
              <th style={cellStyle}>Time</th>
              <th style={cellStyle}>Date</th>
              <th style={cellStyle}>Location</th>
              <th style={{ width: COL_WIDTHS.action }} />
            </tr>
          </thead>
        </table>

        {/* Scrollable tbody */}
        <div
          ref={scrollRef}
          style={{
            overflowY:  "auto",
            height:     `${scrollH}px`,
            transition: "height 0.2s ease",
            background: "#fff",
          }}
        >
          {/* Inner wrapper — ResizeObserver measures its natural height */}
          <div ref={tbodyWrap}>
          {showEmptyState ? (
            <div className="empty-state-container" style={{ minHeight: `${MIN_SCROLL}px`, border: "none" }}>
              <p style={{ margin: 0, color: "#999", fontSize: 11 }}>
                No activity recorded — configure a device feature to see logs.
              </p>
            </div>
          ) : showNoMatch ? (
            <div className="empty-state-container" style={{ minHeight: `${MIN_SCROLL}px`, border: "none" }}>
              <p className="no-results-message">
                No match found{isSearching ? ` for "${search}"` : ""}.
              </p>
            </div>
          ) : (
            <table
              className="console-panel-table"
              style={{ tableLayout: "fixed", width: "100%", borderCollapse: "collapse" }}
            >
              <Colgroup />
              <tbody>
                {filteredLogs.map((log) => (
                  <tr key={log.id}>
                    <td style={cellStyle}>{log.device}</td>
                    <td style={cellStyle}>{log.deviceName}</td>
                    <td style={{ ...cellStyle, fontStyle: "italic", whiteSpace: "normal", wordBreak: "break-word", overflowWrap: "break-word", overflow: "visible" }}>
                      {highlightText(formatEnterpriseLog(log.message, deriveSeverity(log.message)), search)}
                    </td>
                    <td style={cellStyle}>{log.time}</td>
                    <td style={cellStyle}>{log.date}</td>
                    <td style={cellStyle}>{log.location}</td>
                    <td style={{ textAlign: "center", verticalAlign: "middle" }}>
                      <Trash2
                        className="console-panel-delete"
                        size={13}
                        onClick={() => deleteLog(log.id)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          </div>{/* end tbodyWrap */}
        </div>
      </div>

      {/* ── Filter Modal ───────────────────────────────────────────────────── */}
      {showFilters && (
        <div className="modal-overlay">
          <div className="modal-container filter-modal">
            <h4 className="modal-title">Filter Logs</h4>
            <div className="modal-body">
              <input
                placeholder="Device (e.g. Router)"
                value={tempFilters.device}
                onChange={(e) => setTempFilters({ ...tempFilters, device: e.target.value })}
              />
              <input
                placeholder="Device Name (e.g. Router-01)"
                value={tempFilters.deviceName}
                onChange={(e) => setTempFilters({ ...tempFilters, deviceName: e.target.value })}
              />
              <input
                placeholder="Location (e.g. Core Network)"
                value={tempFilters.location}
                onChange={(e) => setTempFilters({ ...tempFilters, location: e.target.value })}
              />
              <input
                type="date"
                value={tempFilters.date}
                onChange={(e) => setTempFilters({ ...tempFilters, date: e.target.value })}
              />
            </div>
            <div className="modal-footer">
              <button className="btn-cancel" onClick={handleResetFilters}>Reset</button>
              <button className="btn-cancel" onClick={() => setShowFilters(false)}>Cancel</button>
              <button className="btn-apply"  onClick={handleApplyFilters}>Apply</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Clear Confirmation Modal ────────────────────────────────────────── */}
      {showClearModal && (
        <div className="modal-overlay">
          <div className="modal-container clear-modal">
            <h4 className="modal-title">Clear Logs</h4>
            <p className="modal-text">This will permanently delete all logs. Continue?</p>
            <div className="modal-footer">
              <button className="btn-cancel"  onClick={() => setShowClearModal(false)}>Cancel</button>
              <button className="btn-confirm" onClick={clearAllLogs}>Clear All</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function deriveSeverity(message = "") {
  const m = message.toLowerCase();
  if (m.includes("error") || m.includes("fail") || m.includes("denied"))  return "ERROR";
  if (m.includes("warn")  || m.includes("exceed") || m.includes("retry")) return "WARNING";
  if (m.includes("auth")  || m.includes("ssh")    || m.includes("vpn"))   return "NOTICE";
  if (m.includes("nat_change") || m.includes("change"))                   return "NOTICE";
  return "INFO";
}

/**
 * Maps a raw tag+value string dispatched from a config modal
 * into an enterprise / Cisco-IOS-style syslog message.
 *
 * Handles:
 *   [NAT_SET]    → first-time configuration
 *   [NAT_CHANGE] → field modification (triggers NOTICE severity)
 *   [NAT_INFO]   → informational / no-op
 *   All existing OSPF / BGP / Static / Route Control tags
 */
function formatEnterpriseLog(raw = "", severity = "INFO") {
  const r = raw.toLowerCase();
  const facilityMap = { ERROR: "3", WARNING: "4", NOTICE: "5", INFO: "6" };
  const sev         = facilityMap[severity] || "6";

  // ── NAT / PAT ─────────────────────────────────────────────────────────────
  if (r.startsWith("[nat_change]")) {
    const detail = raw.replace(/^\[NAT_CHANGE\]\s*/i, "");
    return `%NAT-5-XLATE_MODIFY: Configuration change detected — ${detail}`;
  }
  if (r.startsWith("[nat_set]")) {
    const detail = raw.replace(/^\[NAT_SET\]\s*/i, "");
    return `%NAT-6-XLATE_INSTALL: Translation rule installed — ${detail}`;
  }
  if (r.startsWith("[nat_info]")) {
    const detail = raw.replace(/^\[NAT_INFO\]\s*/i, "");
    return `%NAT-6-XLATE_NOP: ${detail}`;
  }

  const extractChange = (label) => {
    const idx = raw.indexOf(label);
    if (idx === -1) return { val: "N/A", old: null, changed: false };
    const rest = raw.slice(idx + label.length).trim();
    if (rest.includes("→")) {
      const [oldVal, newVal] = rest.split("→").map((s) => s.trim());
      return { val: newVal, old: oldVal, changed: true };
    }
    return { val: rest.split(/\s{2,}|[|]/)[0].trim() || "N/A", old: null, changed: false };
  };

  // ── OSPF ──────────────────────────────────────────────────────────────────
  if (r.includes("[ospf] process id:")) {
    const { val, changed, old } = extractChange("Process ID:");
    return changed
      ? `%ROUTING-5-OSPF_MODIFY: OSPF Process ID updated from ${old} to ${val}. Adjacency re-negotiation may occur on all interfaces.`
      : `%ROUTING-5-OSPF_CONFIG: OSPF Process ${val} initialized. Protocol enabled; adjacency formation started.`;
  }
  if (r.includes("[ospf] area:")) {
    const { val, changed, old } = extractChange("Area:");
    return changed
      ? `%OSPF-5-AREA_CHANGE: OSPF area type changed from ${old} to ${val}. Affected neighbors will re-establish adjacency.`
      : `%OSPF-5-ADJCHG: Area ${val} configured. Neighbor adjacency state machine started.`;
  }
  if (r.includes("[ospf] networks:")) {
    const { val, changed, old } = extractChange("Networks:");
    return changed
      ? `%OSPF-5-NETWORK_MODIFY: Networks (CIDR) updated from [${old}] to [${val}]. Revised advertisements propagating across OSPF domain.`
      : `%OSPF-5-NETWORK_STMT: Network statement added — ${val}. Prefixes will be advertised into the OSPF routing domain.`;
  }
  if (r.includes("[ospf] hello timer:")) {
    const { val, changed, old } = extractChange("Hello Timer:");
    return changed
      ? `%OSPF-6-TIMER_MOD: Hello interval changed from ${old} to ${val}. Verify peer timers match to avoid adjacency drops.`
      : `%OSPF-6-TIMER: Hello interval set to ${val}. Dead interval will auto-adjust to 4× this value.`;
  }
  if (r.includes("[ospf] dead timer:")) {
    const { val, changed, old } = extractChange("Dead Timer:");
    return changed
      ? `%OSPF-6-TIMER_MOD: Dead interval changed from ${old} to ${val}. Neighbor down-detection threshold updated.`
      : `%OSPF-6-TIMER: Dead interval set to ${val}. Neighbor declared down after timeout expires.`;
  }
  if (r.includes("[ospf] authentication:")) {
    const enabled = r.includes("enabled");
    return enabled
      ? `%OSPF-5-AUTH: MD5 authentication enabled on OSPF process. Unauthenticated neighbors will be rejected.`
      : `%OSPF-5-AUTH: OSPF authentication disabled. Neighbors will no longer require key validation.`;
  }

  // ── BGP ───────────────────────────────────────────────────────────────────
  if (r.includes("[bgp] local as:")) {
    const { val, changed, old } = extractChange("Local AS:");
    return changed
      ? `%BGP-5-AS_CHANGE: Local AS changed from ${old} to AS${val}. All BGP peer sessions will reset.`
      : `%BGP-5-ADJCHANGE: Local AS set to AS${val}. BGP process starting; peers will be contacted.`;
  }
  if (r.includes("[bgp] keepalive:")) {
    const { val, changed, old } = extractChange("Keepalive:");
    return changed
      ? `%BGP-6-TIMER_MOD: Keepalive interval changed from ${old} to ${val}. Hold-time updated accordingly.`
      : `%BGP-6-TIMER: Keepalive interval configured to ${val}. Hold-time will be 3× this value.`;
  }
  if (r.includes("[bgp] neighbor ip:")) {
    const { val, changed, old } = extractChange("Neighbor IP:");
    return changed
      ? `%BGP-5-NEIGHBOR_MOD: BGP peer address changed from ${old} to ${val}. Previous TCP session will be torn down.`
      : `%BGP-5-NEIGHBOR: Peer ${val} added to BGP neighbor table. Attempting TCP session on port 179.`;
  }
  if (r.includes("[bgp] remote as:")) {
    const { val, changed, old } = extractChange("Remote AS:");
    return changed
      ? `%BGP-5-ADJCHANGE: Remote peer AS changed from ${old} to AS${val}. Session type (iBGP/eBGP) re-evaluated.`
      : `%BGP-5-ADJCHANGE: eBGP session to remote AS${val} configured. OPEN message sent on connect.`;
  }
  if (r.includes("[bgp] advertised networks:")) {
    const { val, changed, old } = extractChange("Advertised Networks:");
    return changed
      ? `%BGP-5-NETWORK_MOD: Advertised prefix changed from ${old} to ${val}. Updated NLRI will be sent to all peers.`
      : `%BGP-5-NETWORK: Prefix ${val} added to BGP table. Will be advertised to all iBGP/eBGP peers.`;
  }
  if (r.includes("[bgp] route reflector:")) {
    const enabled = r.includes("enabled");
    return enabled
      ? `%BGP-5-RR: Route Reflector role enabled. iBGP routes will be re-advertised to cluster peers.`
      : `%BGP-5-RR: Route Reflector role disabled. iBGP split-horizon rules reinstated.`;
  }

  // ── Static Route ──────────────────────────────────────────────────────────
  if (r.includes("[static] destination:")) {
    const { val, changed, old } = extractChange("Destination:");
    return changed
      ? `%IP-5-STATIC_MOD: Static route destination changed from ${old} to ${val}. Routing table entry updated.`
      : `%IP-5-STATIC_ROUTE: Static route to ${val} installed. Administrative distance: 1.`;
  }
  if (r.includes("[static] next hop:")) {
    const { val, changed, old } = extractChange("Next Hop:");
    return changed
      ? `%IP-5-NEXTHOP_MOD: Next-hop gateway updated from ${old} to ${val}. ARP cache invalidated for previous entry.`
      : `%IP-5-NEXTHOP: Next-hop gateway set to ${val}. ARP resolution will be attempted on egress interface.`;
  }
  if (r.includes("[static] metric:")) {
    const { val, changed, old } = extractChange("Metric:");
    return changed
      ? `%IP-6-METRIC_MOD: Route metric changed from ${old} to ${val}. Route selection priority updated.`
      : `%IP-6-METRIC: Static route metric configured to ${val}. Used for route selection tiebreaking.`;
  }
  if (r.includes("[static] interface:")) {
    const { val, changed, old } = extractChange("Interface:");
    return changed
      ? `%IP-6-IFACE_MOD: Egress interface changed from ${old} to ${val}. Route table entry refreshed.`
      : `%IP-6-IFACE: Egress interface bound to ${val}. Traffic will be forwarded out this interface.`;
  }
  if (r.includes("[static] floating route:")) {
    const enabled = r.includes("enabled");
    return enabled
      ? `%IP-5-FLOATING: Floating static route enabled. Route activates only when primary path fails.`
      : `%IP-5-FLOATING: Floating static route disabled. Route is now permanently active.`;
  }

  // ── Route Control ─────────────────────────────────────────────────────────
  if (r.includes("[route control] redistribution:")) {
    const { val, changed, old } = extractChange("Redistribution:");
    return changed
      ? `%ROUTING-5-REDIST_MOD: Redistribution policy changed from ${old} to ${val}. Metric translation rules updated.`
      : `%ROUTING-5-REDIST: Route redistribution applied — ${val}. Metric translation rules are now active.`;
  }
  if (r.includes("[route control] filter:")) {
    const { val, changed, old } = extractChange("Filter:");
    return changed
      ? `%ROUTING-5-FILTER_MOD: Route filter ACL changed from [${old}] to [${val}]. Updated prefix list is now enforced.`
      : `%ROUTING-5-ACL_FILTER: Route filter applied — ${val}. Non-matching prefixes will be suppressed.`;
  }
  if (r.includes("[route control] max routes:")) {
    const { val, changed, old } = extractChange("Max Routes:");
    return changed
      ? `%ROUTING-4-MAXROUTE_MOD: Route limit changed from ${old} to ${val}. Warning threshold reset to 75%.`
      : `%ROUTING-4-MAXROUTE: Maximum route limit set to ${val}. Alert triggers at 75% capacity.`;
  }
  if (r.includes("[route control] logging:")) {
    const enabled = r.includes("enabled");
    return enabled
      ? `%ROUTING-6-LOG: Route-change logging enabled. All prefix add/withdraw events sent to syslog.`
      : `%ROUTING-6-LOG: Route-change logging disabled. Prefix events will no longer be recorded.`;
  }

  // ── Global Routing ────────────────────────────────────────────────────────
  if (r.includes("[global] router id:")) {
    const { val, changed, old } = extractChange("Router ID:");
    return changed
      ? `%ROUTING-5-ROUTER_ID_MOD: Router ID changed from ${old} to ${val}. All OSPF/BGP sessions will re-establish.`
      : `%ROUTING-5-ROUTER_ID: Router ID manually set to ${val}. Overrides any loopback-derived ID.`;
  }
  if (r.includes("[global] default route:")) {
    const { val, changed, old } = extractChange("Default Route:");
    return changed
      ? `%IP-5-DEFAULT_MOD: Default gateway changed from ${old} to ${val}. Forwarding table updated immediately.`
      : `%IP-5-DEFAULT_ROUTE: Default gateway configured — ${val}. All unmatched traffic forwarded here.`;
  }

  // ── Fallback ──────────────────────────────────────────────────────────────
  return `%SYS-${sev}-CONFIG_CHANGE: ${raw}`;
}