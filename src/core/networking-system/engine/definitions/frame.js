import { normalizeMacAddress } from "../utils/ipv4";

export const ETHER_TYPE = Object.freeze({ IPV4: 0x0800, ARP: 0x0806, BPDU: 0x010b });

export class EthernetFrame {
  constructor({ sourceMac, destinationMac, etherType, payload, vlanId = null, priority = 0, fcs = null }) {
    this.sourceMac = normalizeMacAddress(sourceMac);
    this.destinationMac = normalizeMacAddress(destinationMac);
    if (!Number.isInteger(etherType) || etherType < 0 || etherType > 0xffff) {
      throw new TypeError("etherType must be a 16-bit integer.");
    }
    if (vlanId !== null && (!Number.isInteger(vlanId) || vlanId < 1 || vlanId > 4094)) {
      throw new RangeError("vlanId must be null or an integer from 1 through 4094.");
    }
    if (!Number.isInteger(priority) || priority < 0 || priority > 7) {
      throw new RangeError("802.1Q priority must be an integer from 0 through 7.");
    }
    this.etherType = etherType;
    this.payload = payload;
    this.vlanId = vlanId;
    this.priority = priority;
    this.fcs = fcs;
  }

  clone(overrides = {}) {
    return new EthernetFrame({ ...this, ...overrides });
  }

  toJSON() {
    return { ...this };
  }
}