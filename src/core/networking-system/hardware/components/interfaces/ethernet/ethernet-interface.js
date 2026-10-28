import { NetworkInterface } from "../network-interface";

export class EthernetInterface extends NetworkInterface {
  constructor({ speedMbps = null, duplex = "auto", ...options }) {
    super(options);
    if (!this.physicalPortId) {
      throw new TypeError("An Ethernet interface must bind to a physical port.");
    }
    if (duplex !== "auto" && !["half", "full"].includes(duplex)) {
      throw new RangeError(`Invalid Ethernet duplex mode: ${duplex}`);
    }
    this.speedMbps = speedMbps;
    this.duplex = duplex;
  }

  toJSON() {
    return { ...super.toJSON(), speedMbps: this.speedMbps, duplex: this.duplex };
  }
}
