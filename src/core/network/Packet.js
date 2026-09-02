/**
 * Packet.js
 * 
 * Defines the packet schema for Layer 2 (Ethernet) and Layer 3 (IP) frames.
 * This is the backbone that all routing, ARP, and ICMP logic depends on.
 * 
 * Two-layer model:
 *   - EthernetFrame: Layer 2 (MAC addressing, VLAN tagging)
 *   - IPPacket: Layer 3 (routing, TTL, protocols)
 * 
 * A transmitted packet always has an Ethernet frame wrapping an IP packet.
 */

// ============================================================================
// ETHERNET FRAME (Layer 2)
// ============================================================================

/**
 * @typedef {object} EthernetFrame
 * @property {string} srcMAC         - Source MAC address (e.g., '00:1a:2b:3c:4d:5e')
 * @property {string} dstMAC         - Destination MAC address
 * @property {object} [vlanTag]      - Optional 802.1Q VLAN tag
 * @property {number} [vlanTag.id]   - VLAN ID (1-4094)
 * @property {number} [vlanTag.priority] - CoS priority (0-7)
 * @property {number} etherType      - Protocol type (0x0800 = IPv4, 0x0806 = ARP)
 * @property {IPPacket|ARPPacket|any} payload - Layer 3 packet
 */
export function createEthernetFrame({
  srcMAC,
  dstMAC,
  etherType = 0x0800,
  vlanTag = null,
  payload = null,
}) {
  return {
    srcMAC,
    dstMAC,
    etherType,
    vlanTag,
    payload,
    _timestamp: Date.now(),
  };
}

// ============================================================================
// IP PACKET (Layer 3)
// ============================================================================

/**
 * @typedef {object} IPPacket
 * @property {string} srcIP          - Source IP address (e.g., '192.168.1.10')
 * @property {string} dstIP          - Destination IP address
 * @property {number} ttl            - Time to Live (0-255)
 * @property {string} protocol       - 'icmp' | 'tcp' | 'udp' | 'igmp' | other
 * @property {number} [id]           - IP packet ID for fragmentation (0-65535)
 * @property {boolean} [moreFragments] - More Fragment flag
 * @property {number} [fragmentOffset] - Fragment offset in 8-byte units
 * @property {any} payload           - Layer 4+ payload (application data)
 */
export function createIPPacket({
  srcIP,
  dstIP,
  ttl = 64,
  protocol = 'icmp',
  id = Math.floor(Math.random() * 65536),
  moreFragments = false,
  fragmentOffset = 0,
  payload = null,
}) {
  return {
    srcIP,
    dstIP,
    ttl,
    protocol,
    id,
    moreFragments,
    fragmentOffset,
    payload,
    _timestamp: Date.now(),
  };
}

// ============================================================================
// ARP PACKET (Layer 2.5 / Layer 3)
// ============================================================================

/**
 * @typedef {object} ARPPacket
 * @property {string} operation      - 'request' | 'reply'
 * @property {string} senderIP       - Sender IP address
 * @property {string} senderMAC      - Sender MAC address
 * @property {string} targetIP       - Target IP address
 * @property {string} [targetMAC]    - Target MAC (known in reply, '00:00:00:00:00:00' for request)
 */
export function createARPPacket({
  operation = 'request',
  senderIP,
  senderMAC,
  targetIP,
  targetMAC = '00:00:00:00:00:00',
}) {
  return {
    operation,
    senderIP,
    senderMAC,
    targetIP,
    targetMAC,
    _timestamp: Date.now(),
  };
}

// ============================================================================
// ICMP PACKET (Layer 4 - inside IP packet payload)
// ============================================================================

/**
 * @typedef {object} ICMPPacket
 * @property {string} type           - 'echo-request' | 'echo-reply' | 'time-exceeded' | 'destination-unreachable'
 * @property {number} code           - ICMP code (type-specific)
 * @property {number} [id]           - Echo request/reply identifier
 * @property {number} [sequence]     - Echo request/reply sequence number
 * @property {any} [data]            - Echo payload data
 */
export function createICMPPacket({
  type = 'echo-request',
  code = 0,
  id = Math.floor(Math.random() * 65536),
  sequence = 0,
  data = null,
}) {
  return {
    type,
    code,
    id,
    sequence,
    data,
    _timestamp: Date.now(),
  };
}

// ============================================================================
// RIP MESSAGE (encapsulated in UDP inside IP packet)
// ============================================================================

/**
 * @typedef {object} RIPMessage
 * @property {string} command        - 'request' | 'response'
 * @property {number} version        - 1 | 2
 * @property {Array} entries         - Array of { destination, metric, [nextHop, routeTag] }
 */
export function createRIPMessage({
  command = 'response',
  version = 2,
  entries = [],
}) {
  return {
    command,
    version,
    entries,
    _timestamp: Date.now(),
  };
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Check if a packet is a broadcast frame.
 * @param {EthernetFrame} frame
 * @returns {boolean}
 */
export function isBroadcast(frame) {
  return frame.dstMAC === 'FF:FF:FF:FF:FF:FF';
}

/**
 * Check if a packet is an ARP frame.
 * @param {EthernetFrame} frame
 * @returns {boolean}
 */
export function isARPFrame(frame) {
  return frame.etherType === 0x0806;
}

/**
 * Check if a packet is an IPv4 frame.
 * @param {EthernetFrame} frame
 * @returns {boolean}
 */
export function isIPv4Frame(frame) {
  return frame.etherType === 0x0800;
}

// ============================================================================
// STP BPDU (Layer 2 payload)
// ============================================================================

/**
 * @typedef {object} BPDUPacket
 * @property {string} rootId         - Bridge ID of the Root Bridge
 * @property {number} rootPathCost   - Cost to reach the Root Bridge
 * @property {string} bridgeId       - Bridge ID of the sender
 * @property {string} portId         - Port ID of the sender
 */
export function createBPDUPacket({
  rootId,
  rootPathCost = 0,
  bridgeId,
  portId,
}) {
  return {
    protocol: 'stp',
    type: 'bpdu',
    rootId,
    rootPathCost,
    bridgeId,
    portId,
    _timestamp: Date.now(),
  };
}

/**
 * Helper to check if a frame is an STP BPDU
 */
export function isSTPFrame(frame) {
  // STP uses a specific multicast destination MAC address
  return frame.dstMAC === '01:80:C2:00:00:00'; 
}
