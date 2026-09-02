import { createContext, useContext, useState, useRef, useCallback } from "react";

// ─── Context ──────────────────────────────────────────────────────────────────
const PropertiesContext = createContext(null);

export function useProperties() {
  const ctx = useContext(PropertiesContext);
  if (!ctx) throw new Error("useProperties must be used inside <PropertiesProvider>");
  return ctx;
}

// ─── Default modal states ──────────────────────────────────────────────────────
const makeDefaultRouting = () => ({
  activeRoutingTab: "ospf",
  routerId: "", defaultRoute: "",
  ospfProcessId: "", ospfAreaType: "", ospfNetworks: "", ospfHello: "", ospfDead: "", ospfAuthEnable: false,
  bgpLocalAS: "", bgpKeepalive: "", bgpNeighborIP: "", bgpRemoteAS: "", bgpNetworks: "", bgpReflector: false,
  staticDest: "", staticNextHop: "", staticMetric: "", staticIface: "G0/0", staticFloating: false,
  ctrlRedist: "None", ctrlFilter: "", ctrlMaxRoutes: "", ctrlLogging: false,
});

const makeDefaultNAT = () => ({
  activeNatType: "pat",
  insideIface: "G0/0 (LAN)", outsideIface: "G0/1 (WAN)",
  aclId: "", srcNetwork: "", wildcardMask: "",
  patMode: "Use Interface IP", patOverload: true,
  staticPrivateIP: "", staticPublicIP: "", staticPrivatePort: "", staticPublicPort: "",
  poolName: "", poolStartIP: "", poolEndIP: "", poolNetmask: "", poolBindACL: "",
});

const makeDefaultACL = () => ({
  activeACLSection: "rules",
  aclType: "Standard", aclName: "", implicitDeny: true,
  interface: "G0/0 (LAN)", direction: "Inbound", applyTo: "All Traffic",
  defaultAction: "Deny", loggingLevel: "None", statefulInspection: false, rateLimiting: false,
  rules: Array.from({ length: 4 }, () => ({ action: "permit", protocol: "ip", source: "", destination: "", port: "", log: false })),
});

const makeDefaultDHCP = () => ({
  dhcpScope: "basic",
  gateway: "", subnetMask: "", dnsServer: "", dhcpEnabled: true,
  startIP: "", endIP: "", leaseTime: "Select", conflictHandling: "Select",
  reservations: [
    { device: "", mac: "", ip: "", status: "Active" },
    { device: "", mac: "", ip: "", status: "Active" },
    { device: "", mac: "", ip: "", status: "Active" },
  ],
  domainName: "", ntpServer: "", dhcpRelay: "", dnsUpdateMode: "Select",
  authoritative: true, conflictDetection: false, systemLogging: false, auditTrail: false,
});

const makeDefaultVPN = () => ({
  activeVPNTab: "tunnel",
  localGateway: "", remoteGateway: "", localSubnet: "", remoteSubnet: "", autoNegotiate: true,
  ikeVersion: "IKEv2 (Recommended)", encryption: "AES-256", integrity: "SHA-256",
  preSharedKey: "", pfs: true,
  srcNetwork: "", dstNetwork: "", encryptMatched: true, bypassLocal: false,
});

const makeDefaultSNMP = () => ({
  activeSNMPTab: "agent",
  systemName: "", location: "", snmpVersion: "v3 (Recommended)", contact: "", agentEnabled: true,
  readCommunity: "", writeCommunity: "", managerACL: "",
  securityLevel: "authPriv (Recommended)", accessLogging: true, restrictTrusted: false,
  trapReceiver: "", trapPort: "", trapLinkUpDown: true, trapCpuMemory: false, trapAnomaly: false,
});

const makeDefaultNTP = () => ({
  activeNTPTab: "server",
  servers: [
    { host: "", type: "Public", enabled: true },
    { host: "", type: "Pool", enabled: true },
    { host: "", type: "Fallback", enabled: false },
  ],
  syncInterval: "60 sec", syncMode: "Client", autoDrift: true, forceOnBoot: false, fallback: false,
  keyId: "", algorithm: "MD5", sharedKey: "", requireAuth: false,
});

const makeDefaultSSH = () => ({
  activeSSHTab: "general",
  sshEnabled: "Enabled", port: "", protocolVersion: "SSH-2 (Recommended)", allowRootLogin: true,
  passwordLogin: "Enabled", keyBasedAuth: "Required", disableEmpty: true, twoFA: false,
  keys: [
    { user: "", keyType: "RSA", fingerprint: "", active: true },
    { user: "", keyType: "ECDSA", fingerprint: "", active: true },
    { user: "", keyType: "ED25519", fingerprint: "", active: false },
  ],
  allowedIP: "", blockedIP: "", ipFiltering: true, rateLimiting: false,
});

// ─── Dispatch helper ───────────────────────────────────────────────────────────
function dispatchLog(device, deviceName, message, location) {
  window.dispatchEvent(
    new CustomEvent("add-system-log", {
      detail: { device, deviceName, message, location },
    })
  );
}

// ─── Provider ─────────────────────────────────────────────────────────────────
export function PropertiesProvider({ children }) {

  // ── Modal open state ────────────────────────────────────────────────────────
  const [isRoutingModalOpen,      setIsRoutingModalOpen]      = useState(false);
  const [isNATModalOpen,          setIsNATModalOpen]          = useState(false);
  const [isACLModalOpen,          setIsACLModalOpen]          = useState(false);
  const [isDHCPModalOpen,         setIsDHCPModalOpen]         = useState(false);
  const [isVPNModalOpen,          setIsVPNModalOpen]          = useState(false);
  const [isSNMPModalOpen,         setIsSNMPModalOpen]         = useState(false);
  const [isNTPModalOpen,          setIsNTPModalOpen]          = useState(false);
  const [isSSHModalOpen,          setIsSSHModalOpen]          = useState(false);
  const [isVLANModalOpen,         setIsVLANModalOpen]         = useState(false);
  const [isSTPModalOpen,          setIsSTPModalOpen]          = useState(false);
  const [isPortSecurityModalOpen, setIsPortSecurityModalOpen] = useState(false);
  const [isTrunkingModalOpen,     setIsTrunkingModalOpen]     = useState(false);
  const [isQoSModalOpen,          setIsQoSModalOpen]          = useState(false);
  const [isAuthModalOpen,         setIsAuthModalOpen]         = useState(false);
  const [isIGMPModalOpen,         setIsIGMPModalOpen]         = useState(false);
  const [isSyslogModalOpen,       setIsSyslogModalOpen]       = useState(false);

  // ── Per-device modal config state (keyed by deviceId) ───────────────────────
  // Structure: { [deviceId]: { routing: {...}, nat: {...}, acl: {...}, ... } }
  const [deviceConfigs, setDeviceConfigs] = useState({});

  // ── Helper: get config for a device+feature, with defaults ─────────────────
  const getConfig = useCallback((deviceId, feature) => {
    const defaults = {
      routing: makeDefaultRouting,
      nat:     makeDefaultNAT,
      acl:     makeDefaultACL,
      dhcp:    makeDefaultDHCP,
      vpn:     makeDefaultVPN,
      snmp:    makeDefaultSNMP,
      ntp:     makeDefaultNTP,
      ssh:     makeDefaultSSH,
    };
    return deviceConfigs[deviceId]?.[feature] ?? defaults[feature]?.() ?? {};
  }, [deviceConfigs]);

  // ── Helper: save config for a device+feature ────────────────────────────────
  const saveConfig = useCallback((deviceId, feature, newState) => {
    setDeviceConfigs(prev => ({
      ...prev,
      [deviceId]: {
        ...(prev[deviceId] || {}),
        [feature]: newState,
      },
    }));
  }, []);

  // ── Device property debounce logging (Feature #6) ───────────────────────────
  // Tracks { [deviceId]: { field: value } } for pending changes
  const pendingChanges = useRef({});
  const debounceTimers = useRef({});

  const logDevicePropertyChange = useCallback((deviceId, deviceName, field, oldValue, newValue, location = "Unknown") => {
    if (oldValue === newValue) return;

    const ts = new Date().toISOString().replace("T", " ").slice(0, 19);
    const fieldLabels = {
      label:          "Device Name",
      ipAddress:      "IP Address",
      subnetMask:     "Subnet Mask",
      defaultGateway: "Default Gateway",
    };
    const displayField = fieldLabels[field] || field;

    const isIP = field === "ipAddress" || field === "defaultGateway";
    const isSubnet = field === "subnetMask";

    let level = "INFO";
    let tag   = "SYS-6-CONFIG";
    let detail = "";

    if (field === "label") {
      tag    = "SYS-5-HOSTNAME_CHANGE";
      level  = "NOTICE";
      detail =
        `%${tag}: [${ts}] Device identity updated — ` +
        `${displayField} changed from "${oldValue || "—"}" to "${newValue}". ` +
        `DNS cache and SNMP sysName may require manual refresh.`;
    } else if (isIP) {
      tag    = "SYS-5-IP_CHANGE";
      level  = "NOTICE";
      detail =
        `%${tag}: [${ts}] ${deviceName} @ ${location} — ` +
        `${displayField} updated: ${oldValue || "unset"} → ${newValue}. ` +
        `Routing adjacency will re-evaluate; ARP cache cleared for this interface.`;
    } else if (isSubnet) {
      tag    = "SYS-6-SUBNET_CHANGE";
      level  = "INFO";
      detail =
        `%${tag}: [${ts}] ${deviceName} @ ${location} — ` +
        `${displayField} updated: ${oldValue || "unset"} → ${newValue}. ` +
        `Network boundary recalculated; check for broadcast conflicts.`;
    } else {
      detail =
        `%${tag}: [${ts}] ${deviceName} @ ${location} — ` +
        `${displayField} changed: ${oldValue || "—"} → ${newValue}.`;
    }

    dispatchLog("System", deviceName, detail, location);
  }, []);

  /**
   * Call this from PropertiesPanel on every input change.
   * Changes are batched per field and only logged after 1 s of inactivity.
   */
  const scheduleDevicePropertyLog = useCallback((
    deviceId, deviceName, field, newValue, getOldValue, location
  ) => {
    // Store pending value
    if (!pendingChanges.current[deviceId]) pendingChanges.current[deviceId] = {};
    if (!pendingChanges.current[deviceId][field]) {
      // First change — record the original value so we can compare
      pendingChanges.current[deviceId][field] = {
        originalValue: getOldValue(),
        latestValue: newValue,
      };
    } else {
      pendingChanges.current[deviceId][field].latestValue = newValue;
    }

    // Debounce per (deviceId, field)
    const key = `${deviceId}__${field}`;
    clearTimeout(debounceTimers.current[key]);
    debounceTimers.current[key] = setTimeout(() => {
      const entry = pendingChanges.current[deviceId]?.[field];
      if (!entry) return;
      const { originalValue, latestValue } = entry;
      if (originalValue !== latestValue) {
        logDevicePropertyChange(deviceId, deviceName, field, originalValue, latestValue, location);
        // Update original so next batch starts fresh
        pendingChanges.current[deviceId][field].originalValue = latestValue;
      }
    }, 1000);
  }, [logDevicePropertyChange]);

  // ── Config card click dispatcher ────────────────────────────────────────────
  const handleConfigItemClick = (label) => {
    const map = {
      "Routing Protocol":    () => setIsRoutingModalOpen(true),
      "NAT/PAT":             () => setIsNATModalOpen(true),
      "Access Control List": () => setIsACLModalOpen(true),
      "DHCP Server":         () => setIsDHCPModalOpen(true),
      "VPN Config":          () => setIsVPNModalOpen(true),
      "SNMP/MIB":            () => setIsSNMPModalOpen(true),
      "NTP":                 () => setIsNTPModalOpen(true),
      "SSH":                 () => setIsSSHModalOpen(true),
      "VLAN Manager":        () => setIsVLANModalOpen(true),
      "Spanning Tree":       () => setIsSTPModalOpen(true),
      "Port Security":       () => setIsPortSecurityModalOpen(true),
      "VLAN Trunking":       () => setIsTrunkingModalOpen(true),
      "QoS Settings":        () => setIsQoSModalOpen(true),
      "User Auth":           () => setIsAuthModalOpen(true),
      "IGMP Snooping":       () => setIsIGMPModalOpen(true),
      "Logs/Syslog":         () => setIsSyslogModalOpen(true),
    };
    map[label]?.() ?? console.log(`Opening ${label}`);
  };

  const value = {
    // Modal open states
    isRoutingModalOpen,      setIsRoutingModalOpen,
    isNATModalOpen,          setIsNATModalOpen,
    isACLModalOpen,          setIsACLModalOpen,
    isDHCPModalOpen,         setIsDHCPModalOpen,
    isVPNModalOpen,          setIsVPNModalOpen,
    isSNMPModalOpen,         setIsSNMPModalOpen,
    isNTPModalOpen,          setIsNTPModalOpen,
    isSSHModalOpen,          setIsSSHModalOpen,
    isVLANModalOpen,         setIsVLANModalOpen,
    isSTPModalOpen,          setIsSTPModalOpen,
    isPortSecurityModalOpen, setIsPortSecurityModalOpen,
    isTrunkingModalOpen,     setIsTrunkingModalOpen,
    isQoSModalOpen,          setIsQoSModalOpen,
    isAuthModalOpen,         setIsAuthModalOpen,
    isIGMPModalOpen,         setIsIGMPModalOpen,
    isSyslogModalOpen,       setIsSyslogModalOpen,
    // Per-device config state API
    getConfig,
    saveConfig,
    // Device property logging
    scheduleDevicePropertyLog,
    // Dispatcher
    handleConfigItemClick,
  };

  return (
    <PropertiesContext.Provider value={value}>
      {children}
    </PropertiesContext.Provider>
  );
}