import { Device } from "../base/device";

export class WirelessAP extends Device {
  constructor({ radios = null, poeDrawWatts = 0, ...options }) {
    super(options);
    this.assertHardwareProfileKind("wireless-ap");
    this.kind = "wireless-ap";
    this.radios = (radios ?? this.hardwareProfile?.radios ?? []).map((radio) => ({ ...radio }));
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
