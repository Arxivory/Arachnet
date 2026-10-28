import { Device } from "../base/device";

export class PC extends Device {
  constructor(options) {
    super(options);
    this.kind = "pc";
  }
}
