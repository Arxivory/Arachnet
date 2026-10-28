import { ipv4ToInt } from "../utils/ipv4";

export const IP_PROTOCOL = Object.freeze({ ICMP: 1, TCP: 6, UDP: 17 });

export class IPv4Packet {
  constructor({
    sourceIp,
    destinationIp,
    protocol = IP_PROTOCOL.ICMP,
    ttl = 64,
    payload = null,
    identification = 0,
    dontFragment = false,
  }) {
    ipv4ToInt(sourceIp);
    ipv4ToInt(destinationIp);
    if (!Number.isInteger(protocol) || protocol < 0 || protocol > 255) {
      throw new TypeError("IPv4 protocol must be an 8-bit integer.");
    }
    if (!Number.isInteger(ttl) || ttl < 1 || ttl > 255) {
      throw new RangeError("IPv4 TTL must be an integer from 1 through 255.");
    }
    this.version = 4;
    this.sourceIp = sourceIp;
    this.destinationIp = destinationIp;
    this.protocol = protocol;
    this.ttl = ttl;
    this.payload = payload;
    this.identification = identification;
    this.dontFragment = Boolean(dontFragment);
  }

  with(changes = {}) {
    return new IPv4Packet({ ...this, ...changes });
  }

  toJSON() {
    return { ...this };
  }
}