import { Device } from "../base/device";

export class WirelessAP extends Device {
  constructor({ radios = [], poeDrawWatts = 0, ...options }) {
    super(options);
    this.kind = "wireless-ap";
    this.radios = radios.map((radio) => ({ ...radio }));
    this.poeDrawWatts = poeDrawWatts;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      radios: this.radios.map((radio) => ({ ...radio })),
      poeDrawWatts: this.poeDrawWatts,
    };
  }
}
