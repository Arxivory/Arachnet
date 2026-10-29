import { PC } from "./pc";

export class Laptop extends PC {
  constructor({ batteryCapacityWh = null, ...options }) {
    super(options);
    this.assertHardwareProfileKind("laptop");
    this.kind = "laptop";
    this.batteryCapacityWh = batteryCapacityWh;
  }

  toJSON() {
    return { ...super.toJSON(), batteryCapacityWh: this.batteryCapacityWh };
  }
}
