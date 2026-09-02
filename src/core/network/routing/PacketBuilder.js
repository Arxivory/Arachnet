/**
 * PacketBuilder.js
 * 
 * Utility for constructing and deconstructing network packets.
 * Handles Layer 2 (Ethernet) and Layer 3 (IP) frame building.
 * 
 * Used by:
 *  - Router: to build outgoing frames
 *  - ARP: to build ARP requests/replies
 *  - ICMP: to build echo requests/replies
 */

import {
  createEthernetFrame,
  createIPPacket,
  createARPPacket,
  createICMPPacket,
  isARPFrame,
  isIPv4Frame,
} from '../Packet.js';

export default class PacketBuilder {
  /**
   * Build a simple unicast Ethernet frame carrying an IP packet.
   * @param {string} srcMAC - Source MAC
   * @param {string} dstMAC - Destination MAC
   * @param {string} srcIP - Source IP
   * @param {string} dstIP - Destination IP
   * @param {string} [protocol] - 'icmp' | 'tcp' | 'udp'
   * @param {number} [ttl] - Time to live
   * @param {any} [payload] - Layer 4+ payload
   * @returns {object} Ethernet frame
   */
  static buildIPFrame(srcMAC, dstMAC, srcIP, dstIP, protocol = 'icmp', ttl = 64, payload = null) {
    const ipPacket = createIPPacket({
      srcIP,
      dstIP,
      ttl,
      protocol,
      payload,
    });

    return createEthernetFrame({
      srcMAC,
      dstMAC,
      etherType: 0x0800,  // IPv4
      payload: ipPacket,
    });
  }

  /**
   * Build an ICMP echo request.
   * @param {string} srcMAC
   * @param {string} dstMAC
   * @param {string} srcIP
   * @param {string} dstIP
   * @param {number} [id] - Echo request ID
   * @param {number} [sequence] - Echo sequence number
   * @param {any} [data] - Echo payload
   * @returns {object} Ethernet frame with ICMP payload
   */
  static buildICMPEchoRequest(srcMAC, dstMAC, srcIP, dstIP, id = 1, sequence = 1, data = 'PING') {
    const icmpPacket = createICMPPacket({
      type: 'echo-request',
      code: 0,
      id,
      sequence,
      data,
    });

    return this.buildIPFrame(srcMAC, dstMAC, srcIP, dstIP, 'icmp', 64, icmpPacket);
  }

  /**
   * Build an ICMP echo reply.
   * @param {string} srcMAC
   * @param {string} dstMAC
   * @param {string} srcIP
   * @param {string} dstIP
   * @param {number} id
   * @param {number} sequence
   * @param {any} [data]
   * @returns {object} Ethernet frame with ICMP payload
   */
  static buildICMPEchoReply(srcMAC, dstMAC, srcIP, dstIP, id, sequence, data = null) {
    const icmpPacket = createICMPPacket({
      type: 'echo-reply',
      code: 0,
      id,
      sequence,
      data,
    });

    return this.buildIPFrame(srcMAC, dstMAC, srcIP, dstIP, 'icmp', 64, icmpPacket);
  }

  /**
   * Build an ICMP Time Exceeded message.
   * Sent when TTL reaches 0.
   * @param {string} srcMAC
   * @param {string} dstMAC
   * @param {string} srcIP
   * @param {string} dstIP
   * @param {object} [offendingPacket] - The IP packet that caused the TTL exceeded
   * @returns {object} Ethernet frame with ICMP payload
   */
  static buildICMPTimeExceeded(srcMAC, dstMAC, srcIP, dstIP, offendingPacket = null) {
    const icmpPacket = createICMPPacket({
      type: 'time-exceeded',
      code: 0,  // TTL exceeded in transit
      data: offendingPacket,
    });

    return this.buildIPFrame(srcMAC, dstMAC, srcIP, dstIP, 'icmp', 64, icmpPacket);
  }

  /**
   * Build an ICMP Destination Unreachable message.
   * Sent when no route exists to destination.
   * @param {string} srcMAC
   * @param {string} dstMAC
   * @param {string} srcIP
   * @param {string} dstIP
   * @param {number} [code] - Unreachable code (0=net, 1=host, etc)
   * @param {object} [offendingPacket] - The IP packet that couldn't be routed
   * @returns {object} Ethernet frame with ICMP payload
   */
  static buildICMPDestinationUnreachable(srcMAC, dstMAC, srcIP, dstIP, code = 1, offendingPacket = null) {
    const icmpPacket = createICMPPacket({
      type: 'destination-unreachable',
      code,
      data: offendingPacket,
    });

    return this.buildIPFrame(srcMAC, dstMAC, srcIP, dstIP, 'icmp', 64, icmpPacket);
  }

  /**
   * Build an ARP request frame.
   * @param {string} srcMAC - Sender MAC
   * @param {string} srcIP - Sender IP
   * @param {string} targetIP - Target IP (who-has)
   * @returns {object} Ethernet broadcast frame with ARP payload
   */
  static buildARPRequest(srcMAC, srcIP, targetIP) {
    const arpPacket = createARPPacket({
      operation: 'request',
      senderIP: srcIP,
      senderMAC: srcMAC,
      targetIP,
      targetMAC: '00:00:00:00:00:00',
    });

    return createEthernetFrame({
      srcMAC,
      dstMAC: 'FF:FF:FF:FF:FF:FF',  // Broadcast
      etherType: 0x0806,  // ARP
      payload: arpPacket,
    });
  }

  /**
   * Build an ARP reply frame.
   * @param {string} srcMAC - Sender MAC (our MAC)
   * @param {string} srcIP - Sender IP (our IP)
   * @param {string} dstMAC - Target MAC (requester's MAC)
   * @param {string} dstIP - Target IP (requester's IP)
   * @returns {object} Ethernet frame with ARP payload
   */
  static buildARPReply(srcMAC, srcIP, dstMAC, dstIP) {
    const arpPacket = createARPPacket({
      operation: 'reply',
      senderIP: srcIP,
      senderMAC: srcMAC,
      targetIP: dstIP,
      targetMAC: dstMAC,
    });

    return createEthernetFrame({
      srcMAC,
      dstMAC,
      etherType: 0x0806,  // ARP
      payload: arpPacket,
    });
  }

  // ---------------------------------------------------------------------------
  // DECONSTRUCTION / INSPECTION
  // ---------------------------------------------------------------------------

  /**
   * Extract the IP packet from an Ethernet frame.
   * @param {object} frame
   * @returns {object|null} IP packet or null if not IPv4
   */
  static extractIPPacket(frame) {
    if (!isIPv4Frame(frame)) return null;
    return frame.payload;
  }

  /**
   * Extract the ARP packet from an Ethernet frame.
   * @param {object} frame
   * @returns {object|null} ARP packet or null if not ARP
   */
  static extractARPPacket(frame) {
    if (!isARPFrame(frame)) return null;
    return frame.payload;
  }

  /**
   * Extract the Layer 4 payload from an IP packet.
   * @param {object} ipPacket
   * @returns {any} Layer 4 payload (ICMP, TCP, UDP, etc)
   */
  static extractL4Payload(ipPacket) {
    return ipPacket.payload;
  }

  /**
   * Check if frame is addressed to a specific MAC.
   * Returns true for unicast match or broadcast.
   * @param {object} frame
   * @param {string} mac
   * @returns {boolean}
   */
  static isFrameFor(frame, mac) {
    return frame.dstMAC === mac || frame.dstMAC === 'FF:FF:FF:FF:FF:FF';
  }
}
