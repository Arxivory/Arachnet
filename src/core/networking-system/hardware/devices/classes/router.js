import { Device } from "../base/device";

export class Router extends Device {
  constructor(options) {
    super(options);
    this.kind = "router";
    this.staticRoutes = [];
  }

  addStaticRoute(route) {
    if (!route?.destination || !route?.nextHop) {
      throw new TypeError("A static route requires a destination and nextHop.");
    }
    this.staticRoutes.push({ ...route });
  }

  toJSON() {
    return { ...super.toJSON(), staticRoutes: this.staticRoutes.map((route) => ({ ...route })) };
  }
}
