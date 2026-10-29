import { Device } from "../base/device";

export class Server extends Device {
  constructor({ services = [], ...options }) {
    super(options);
    this.assertHardwareProfileKind("server");
    this.kind = "server";
    this.services = [...services];
  }

  toJSON() {
    return { ...super.toJSON(), services: [...this.services] };
  }
}
