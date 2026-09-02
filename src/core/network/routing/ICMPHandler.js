/**
 * ICMPHandler.js
 * 
 * Handles ICMP (Internet Control Message Protocol) messaging.
 * 
 * Features:
 *  - Echo request (ping) responses
 *  - Echo reply generation
 *  - TTL Exceeded (TTL=0) message generation
 *  - Destination Unreachable messages
 * 
 * Used by RouterPipeline to generate replies and error responses.
 */

import PacketBuilder from './PacketBuilder.js';
import { createICMPPacket } from '../Packet.js';

export default class ICMPHandler {
  /**
   * @param {Device} device - The router device this handler belongs to
   */
  constructor(device) {
    this.device = device;

    /**
     * Callback for sending ICMP responses
     * @type {Function|null}
     */
    this._callbacks = {
      onSendICMP: null,      // Called to send ICMP frame out an interface
      onLogICMP: null,       // Called to log ICMP events
    };

    /**
     * Statistics
     * @type {object}
     */
    this.stats = {
      echoRequestsReceived: 0,
      echoRepliesSent: 0,
      ttlExceededSent: 0,
      unreachableSent: 0,
    };
  }

  // ---------------------------------------------------------------------------
  // ECHO REQUEST / PING HANDLING
  // ---------------------------------------------------------------------------

  /**
   * Handle an incoming ICMP echo request (ping).
   * Generate and send an echo reply.
   * 
   * @param {object} icmpPacket - The ICMP echo request
   * @param {object} ipPacket - The IP packet carrying it
   * @param {object} ethernetFrame - The Ethernet frame carrying it
   * @param {Interface} ingressInterface - Interface where it arrived
   */
  handleEchoRequest(icmpPacket, ipPacket, ethernetFrame, ingressInterface) {
    this.stats.echoRequestsReceived++;

    // Just reply out the same interface it came from, to the same MAC!
    const egressInterface = ingressInterface;

    if (!egressInterface || !egressInterface.isUp) {
      // Can't reply if destination interface is down
      this._log(`Echo request to ${ipPacket.dstIP}: egress interface down or not found`);
      return;
    }

    // Find the IP that it was destined to, to use as the source of our reply.
    let srcIP = ipPacket.dstIP;

    // Build echo reply
    const replyFrame = PacketBuilder.buildICMPEchoReply(
      egressInterface.macAddress,
      ethernetFrame.srcMAC,  // Reply to requester's MAC
      srcIP,                 // Reply from destination IP
      ipPacket.srcIP,        // Reply to source IP
      icmpPacket.id,
      icmpPacket.sequence,
      icmpPacket.data
    );

    // Send reply
    this._sendICMP(replyFrame, egressInterface);
    this.stats.echoRepliesSent++;

    this._log(`Echo reply sent: ${srcIP} → ${ipPacket.srcIP} (seq=${icmpPacket.sequence})`);
  }

  /**
   * Send a ping (echo request) to a destination.
   * Typically called from user commands or monitoring.
   * 
   * @param {string} srcIP - Source IP
   * @param {string} dstIP - Destination IP to ping
   * @param {number} [count] - Number of pings (1 for now)
   * @param {number} [timeout] - Timeout in ms per ping
   * @returns {Promise} Resolves when ping completes
   */
  async ping(srcIP, dstIP, count = 1, timeout = 5000) {
    const srcInterface = this.device.interfaces.find(i => i.ipv4?.address === srcIP);
    if (!srcInterface || !srcInterface.isUp) {
      throw new Error(`Source interface ${srcIP} not found or down`);
    }

    const results = [];

    for (let i = 1; i <= count; i++) {
      const echoRequest = PacketBuilder.buildICMPEchoRequest(
        srcInterface.macAddress,
        'FF:FF:FF:FF:FF:FF',  // Will be resolved by ARP
        srcIP,
        dstIP,
        Math.floor(Math.random() * 65536),  // Random ID
        i,  // Sequence number
        `PING data packet ${i}`
      );

      results.push({
        sequence: i,
        sent: Date.now(),
        // Would normally wait for reply here, but for now just queue for sending
      });

      if (this._callbacks.onSendICMP) {
        this._callbacks.onSendICMP(echoRequest, srcInterface);
      }

      // Small delay between pings
      if (i < count) {
        await new Promise(r => setTimeout(r, 100));
      }
    }

    return results;
  }

  // ---------------------------------------------------------------------------
  // ERROR MESSAGES
  // ---------------------------------------------------------------------------

  /**
   * Send TTL Exceeded message (when TTL reaches 0).
   * Generated at Step 4 of the routing pipeline.
   * 
   * @param {object} ipPacket - The offending IP packet
   * @param {Interface} egressInterface - Interface to send reply out
   * @param {object} ethernetFrame - Original Ethernet frame (for source MAC)
   */
  sendTTLExceeded(ipPacket, egressInterface, ethernetFrame) {
    if (!egressInterface || !egressInterface.isUp) {
      return;
    }

    // Find an interface with an IP address to source from
    const srcIP = egressInterface.ipv4?.address || this.device.interfaces[0]?.ipv4?.address;
    if (!srcIP) return;

    const replyFrame = PacketBuilder.buildICMPTimeExceeded(
      egressInterface.macAddress,
      ethernetFrame.srcMAC,  // Reply to original source
      srcIP,
      ipPacket.srcIP,        // Reply to original source IP
      ipPacket
    );

    this._sendICMP(replyFrame, egressInterface);
    this.stats.ttlExceededSent++;

    this._log(`TTL exceeded sent: ${ipPacket.srcIP} (original dst: ${ipPacket.dstIP})`);
  }

  /**
   * Send Destination Unreachable message (when no route exists).
   * 
   * @param {object} ipPacket - The offending IP packet
   * @param {Interface} egressInterface - Interface to send reply out
   * @param {object} ethernetFrame - Original Ethernet frame
   * @param {number} [code] - ICMP unreachable code (1=host unreachable)
   */
  sendDestinationUnreachable(ipPacket, egressInterface, ethernetFrame, code = 1) {
    if (!egressInterface || !egressInterface.isUp) {
      return;
    }

    const srcIP = egressInterface.ipv4?.address || this.device.interfaces[0]?.ipv4?.address;
    if (!srcIP) return;

    const replyFrame = PacketBuilder.buildICMPDestinationUnreachable(
      egressInterface.macAddress,
      ethernetFrame.srcMAC,
      srcIP,
      ipPacket.srcIP,
      code,
      ipPacket
    );

    this._sendICMP(replyFrame, egressInterface);
    this.stats.unreachableSent++;

    this._log(`Destination unreachable sent: ${ipPacket.dstIP} unreachable (code=${code})`);
  }

  // ---------------------------------------------------------------------------
  // STATISTICS & LOGGING
  // ---------------------------------------------------------------------------

  /**
   * Get ICMP statistics.
   * @returns {object}
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * Reset statistics.
   */
  resetStats() {
    this.stats = {
      echoRequestsReceived: 0,
      echoRepliesSent: 0,
      ttlExceededSent: 0,
      unreachableSent: 0,
    };
  }

  /**
   * Display statistics (similar to Cisco `show icmp statistics`).
   * @returns {string}
   */
  showStats() {
    let output = 'ICMP Statistics:\n';
    output += `Echo requests received:  ${this.stats.echoRequestsReceived}\n`;
    output += `Echo replies sent:       ${this.stats.echoRepliesSent}\n`;
    output += `TTL exceeded sent:       ${this.stats.ttlExceededSent}\n`;
    output += `Unreachable sent:        ${this.stats.unreachableSent}\n`;
    return output;
  }

  // ---------------------------------------------------------------------------
  // INTERNAL HELPERS
  // ---------------------------------------------------------------------------

  /**
   * Actually send an ICMP frame out an interface.
   * @private
   */
  _sendICMP(frame, interface_) {
    if (this._callbacks.onSendICMP) {
      this._callbacks.onSendICMP(frame, interface_);
    }
  }

  /**
   * Log an ICMP event.
   * @private
   */
  _log(message) {
    if (this._callbacks.onLogICMP) {
      this._callbacks.onLogICMP(`[${this.device.hostname}] ${message}`);
    } else {
      console.log(`[${this.device.hostname}] ${message}`);
    }
  }

  // ---------------------------------------------------------------------------
  // CALLBACKS
  // ---------------------------------------------------------------------------

  /**
   * Register callback for sending ICMP frames.
   * @param {Function} callback - (frame, interface) => void
   */
  onSendICMP(callback) {
    this._callbacks.onSendICMP = callback;
  }

  /**
   * Register callback for ICMP logging.
   * @param {Function} callback - (message) => void
   */
  onLogICMP(callback) {
    this._callbacks.onLogICMP = callback;
  }
}
