import { Device } from "../base/device";
import { ArpCache } from "../../../engine/state/arp-cache";
import { Fib } from "../../../engine/state/fib";
import { Rib } from "../../../engine/state/rib";
import { StaticRoute } from "../../../engine/protocols/l3/static-route";

export class Router extends Device {
  constructor(options) {
    super(options);
    this.kind = "router";
    this.staticRoutes = [];
    this.rib = new Rib();
    this.fib = new Fib();
    this.arpCache = new ArpCache();
  }

  addStaticRoute(route) {
    if (!route?.destination || (!route.nextHop && !route.interfaceId)) {
      throw new TypeError("A static route requires a destination and nextHop or interfaceId.");
    }
    const storedRoute = new StaticRoute(route);
    this.rib.add({ ...storedRoute, type: "static" });
    this.staticRoutes.push(storedRoute);
    return storedRoute;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      staticRoutes: this.staticRoutes.map((route) => ({ ...route })),
      routingTable: this.fib.toJSON(),
      arpTable: [...this.arpCache.entries.values()].map((entry) => ({ ...entry })),
    };
  }
}
