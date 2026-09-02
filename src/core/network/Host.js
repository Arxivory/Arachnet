import PacketBuilder from './routing/PacketBuilder.js';

/**
 * Host.js
 *
 * Minimal end-device network behavior for PCs/laptops.
 * Responds to ICMP echo requests (ping) and integrates with the
 * NetworkIntegrationEngine forwarding model.
 */

export function installHostBehavior(device) {
  if (device._hostInstalled) {
    console.warn(`[${device.hostname}] Host behavior already installed`);
    return device;
  }

  device._pendingReply = null;

  device.onPacketReceived = function(packet, ingressInterface) {
    if (!packet || packet.etherType !== 0x0800) return;

    const ipPacket = PacketBuilder.extractIPPacket(packet);
    if (!ipPacket || ipPacket.protocol !== 'icmp') return;

    const localInterface = this.interfaces.find(
      (iface) => iface.ipv4?.address === ipPacket.dstIP
    );
    if (!localInterface || !localInterface.isUp) return;

    const icmp = ipPacket.payload;
    if (!icmp || icmp.type !== 'echo-request') return;

    const replyFrame = PacketBuilder.buildICMPEchoReply(
      localInterface.macAddress,
      packet.srcMAC,
      ipPacket.dstIP,
      ipPacket.srcIP,
      icmp.id,
      icmp.sequence,
      icmp.data
    );

    this._pendingReply = {
      frame: replyFrame,
      outInterface: localInterface,
    };
  };

  device.onPacketForwarding = function(packet, ingressInterface) {
    if (!this._pendingReply) {
      return null;
    }

    const pending = this._pendingReply;
    this._pendingReply = null;
    return {
      outPacket: pending.frame,
      outInterface: pending.outInterface,
    };
  };

  device._hostInstalled = true;
  console.log(`[${device.hostname}] Host behavior installed ✓`);
  return device;
}
