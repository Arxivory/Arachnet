import { NetworkInterface } from "../network-interface";

export class WirelessInterface extends NetworkInterface {
  constructor({ supportedBands = [], supportedStandards = [], channel = null, ...options }) {
    super(options);
    this.supportedBands = [...supportedBands];
    this.supportedStandards = [...supportedStandards];
    this.channel = channel;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      supportedBands: [...this.supportedBands],
      supportedStandards: [...this.supportedStandards],
      channel: this.channel,
    };
  }
}
