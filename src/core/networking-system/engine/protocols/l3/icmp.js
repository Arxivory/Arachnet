import { IP_PROTOCOL, IPv4Packet } from "../../definitions/packet";

export const ICMP_TYPE = Object.freeze({
  ECHO_REPLY: 0,
  DESTINATION_UNREACHABLE: 3,
  ECHO_REQUEST: 8,
  TIME_EXCEEDED: 11,
});

export class Icmp {
  static echoReply(request, sourceIp) {
    if (request.protocol !== IP_PROTOCOL.ICMP || request.payload?.type !== ICMP_TYPE.ECHO_REQUEST) {
      throw new TypeError("ICMP echo reply requires an echo request packet.");
    }
    return new IPv4Packet({
      sourceIp,
      destinationIp: request.sourceIp,
      protocol: IP_PROTOCOL.ICMP,
      ttl: 64,
      payload: { ...request.payload, type: ICMP_TYPE.ECHO_REPLY, code: 0 },
    });
  }

  static timeExceeded(packet, sourceIp) {
    return new IPv4Packet({
      sourceIp,
      destinationIp: packet.sourceIp,
      protocol: IP_PROTOCOL.ICMP,
      ttl: 64,
      payload: { type: ICMP_TYPE.TIME_EXCEEDED, code: 0, originalPacket: packet },
    });
  }

  static destinationUnreachable(packet, sourceIp, code = 0) {
    return new IPv4Packet({
      sourceIp,
      destinationIp: packet.sourceIp,
      protocol: IP_PROTOCOL.ICMP,
      ttl: 64,
      payload: { type: ICMP_TYPE.DESTINATION_UNREACHABLE, code, originalPacket: packet },
    });
  }
}
