import { ipv4ToInt } from "../utils/ipv4";

export class Fib {
  constructor(routes = []) {
    this.routes = [];
    this.replaceRoutes(routes);
  }

  replaceRoutes(routes) {
    this.routes = [...routes].sort((a, b) =>
      b.prefixLength - a.prefixLength ||
      a.administrativeDistance - b.administrativeDistance ||
      a.metric - b.metric
    );
  }

  lookup(ipAddress) {
    const address = ipv4ToInt(ipAddress);
    return this.routes.find((route) => (address & route.mask) === route.network) ?? null;
  }

  toJSON() {
    return this.routes.map((route) => ({ ...route }));
  }
}
