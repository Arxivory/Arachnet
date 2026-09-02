/**
 * RouterPipeline.js
 * 
 * Implements the 6-step packet processing pipeline for routers.
 * Pure logic layer — no device state, just packet processing.
 * 
 * Pipeline (from the Layer 3 routing PDF):
 *   Step 1: Ingress / MAC match   — Does this frame belong to us?
 *   Step 2: Decapsulation        — Extract IP packet from Ethernet
 *   Step 3: Routing Lookup (LPM)  — Find next hop for destination IP
 *   Step 4: TTL Handling         — Decrement TTL, check for zero
 *   Step 5: Next-Hop Resolution  — ARP lookup (MAC for next hop IP)
 *   Step 6: Encapsulation +      — Wrap IP in new Ethernet frame, forward
 *           Forward
 */

import PacketBuilder from './PacketBuilder.js';
import { isIPv4Frame, isARPFrame } from '../Packet.js';

export default class RouterPipeline {
  /**
   * Process an incoming packet through the full 6-step pipeline.
   * 
   * @param {object} frame - Ethernet frame
   * @param {Interface} ingressInterface - Interface where frame arrived
   * @param {Device} device - Router device (must have routing logic attached)
   * @returns {boolean} Whether packet was successfully processed
   */
  static process(frame, ingressInterface, device) {
    // =========================================================================
    // STEP 1: INGRESS / MAC MATCH
    // =========================================================================
    // Check if frame is addressed to us (unicast to our MAC or broadcast)
    
    if (!PacketBuilder.isFrameFor(frame, ingressInterface.macAddress)) {
      // Not for us (unicast to different MAC) — drop
      this._log(device, 'Step 1: Frame not for us (unicast to different MAC) — dropping');
      return false;
    }

    // =========================================================================
    // STEP 2: DECAPSULATION
    // =========================================================================
    // Extract IP packet from Ethernet frame
    
    if (isARPFrame(frame)) {
      // ARP frame — handle separately
      const arpPacket = PacketBuilder.extractARPPacket(frame);
      if (device.arpCache && arpPacket) {
        device.arpCache.onARPReceived(arpPacket, ingressInterface.name);
      }
      return true;
    }

    if (!isIPv4Frame(frame)) {
      // Not IPv4 or ARP — drop
      this._log(device, `Step 2: Unsupported etherType 0x${frame.etherType.toString(16)}`);
      return false;
    }

    const ipPacket = PacketBuilder.extractIPPacket(frame);
    if (!ipPacket) {
      this._log(device, 'Step 2: Failed to extract IP packet');
      return false;
    }

    // --- INTERCEPT PACKETS DESTINED FOR THIS ROUTER ---
    const isForMe = device.interfaces.some(i => i.ipv4 && i.ipv4.address === ipPacket.dstIP);
    if (isForMe) {
      if (ipPacket.protocol === 'icmp') {
        const icmpPacket = ipPacket.payload;
        if (icmpPacket && icmpPacket.type === 'echo-request') {
          if (device.icmp) {
            device.icmp.handleEchoRequest(icmpPacket, ipPacket, frame, ingressInterface);
          }
        }
      }
      return true; // We consumed the packet, don't route it!
    }

    // =========================================================================
    // STEP 3: ROUTING LOOKUP (LONGEST PREFIX MATCH)
    // =========================================================================
    // Find the best matching route for destination IP
    
    const lookupResult = device.routingTable.lookup(ipPacket.dstIP);
    const route = lookupResult.route;

    if (!route) {
      // No route to destination
      this._log(device, `Step 3: No route to ${ipPacket.dstIP} — sending ICMP unreachable`);
      
      if (device.icmp) {
        device.icmp.sendDestinationUnreachable(ipPacket, ingressInterface, frame, 1);
      }
      return false;
    }

    this._log(device, `Step 3: Route found for ${ipPacket.dstIP} via ${route.nextHop || 'direct'} on ${route.egressInterface}`);

    // =========================================================================
    // STEP 4: TTL HANDLING
    // =========================================================================
    // Decrement TTL, check for zero
    
    if (ipPacket.ttl <= 1) {
      // TTL would become 0 — send ICMP Time Exceeded
      this._log(device, `Step 4: TTL reached 0 for packet to ${ipPacket.dstIP} — sending ICMP Time Exceeded`);
      
      if (device.icmp) {
        const egressInterface = device.getInterfaceByName(route.egressInterface);
        device.icmp.sendTTLExceeded(ipPacket, egressInterface, frame);
      }
      return false;
    }

    ipPacket.ttl--;
    this._log(device, `Step 4: TTL decremented to ${ipPacket.ttl}`);

    // =========================================================================
    // STEP 5: NEXT-HOP RESOLUTION (ARP)
    // =========================================================================
    // Resolve next-hop IP to MAC via ARP
    
    const egressInterface = device.getInterfaceByName(route.egressInterface);
    if (!egressInterface || !egressInterface.isUp) {
      this._log(device, `Step 5: Egress interface ${route.egressInterface} is down`);
      return false;
    }

    // Determine next hop MAC address
    let nextHopIP = route.nextHop;
    
    if (route.protocol === 'connected' || !route.nextHop) {
      // Directly connected — next hop is the destination IP itself
      nextHopIP = ipPacket.dstIP;
      this._log(device, `Step 5: Directly connected route — next hop is ${nextHopIP}`);
    } else {
      this._log(device, `Step 5: Routed via ${route.nextHop}`);
    }

    // Check ARP cache for next hop MAC
    if (!device.arpCache) {
      this._log(device, 'Step 5: No ARP cache available');
      return false;
    }

    const nextHopMAC = device.arpCache.lookup(nextHopIP);
    if (nextHopMAC) {
      // Cache hit — proceed to encapsulation
      this._forward(ipPacket, frame, egressInterface, nextHopMAC, device);
      return true;
    }

    // Cache miss — need to resolve via ARP
    this._log(device, `Step 5: ARP cache miss for ${nextHopIP} — initiating ARP resolution`);

    // Queue packet for ARP resolution
    device.arpCache.resolve(
      nextHopIP,
      { ipPacket, ethernetFrame: frame },
      (resolvedMAC) => {
        // Success — forward packet
        this._log(device, `Step 5: ARP resolved ${nextHopIP} → ${resolvedMAC}`);
        this._forward(ipPacket, frame, egressInterface, resolvedMAC, device);
      },
      () => {
        // Failed — drop packet
        this._log(device, `Step 5: ARP resolution failed for ${nextHopIP} — dropping packet`);
      }
    );

    return true;
  }

  /**
   * Forward a packet using resolved information.
   * Steps 6: Encapsulation + Forward
   * 
   * @private
   */
  static _forward(ipPacket, originalFrame, egressInterface, nextHopMAC, device) {
    // =========================================================================
    // STEP 6: ENCAPSULATION + FORWARD
    // =========================================================================
    // Wrap IP packet in new Ethernet frame with resolved MAC, then transmit
    
    this._log(device, `Step 6: Forwarding to ${nextHopMAC} on ${egressInterface.name}`);

    // Build new Ethernet frame
    const outgoingFrame = PacketBuilder.buildIPFrame(
      egressInterface.macAddress,  // Our MAC
      nextHopMAC,                  // Resolved next-hop MAC
      ipPacket.srcIP,
      ipPacket.dstIP,
      ipPacket.protocol,
      ipPacket.ttl,
      ipPacket.payload
    );

    // Forward out the egress interface
    if (egressInterface.physicalPort?.link) {
      egressInterface.physicalPort.link.transmitPacket(outgoingFrame, egressInterface.physicalPort);
      this._log(device, `Step 6: Packet transmitted on ${egressInterface.name}`);
    } else {
      this._log(device, `Step 6: Egress interface ${egressInterface.name} has no active link`);
    }
  }

  /**
   * Log a pipeline event.
   * @private
   */
  static _log(device, message) {
    console.log(`[${device.hostname}] ${message}`);
    // TODO: integrate with simulation logging/visualization
  }
}
