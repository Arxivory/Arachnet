import { parseIpv4Cidr } from "../utils/ipv4";

export class Rib {
  constructor() {
    this.routes = [];
  }

  add(route) {
    const prefix = parseIpv4Cidr(route.destination);
    if (!Number.isInteger(route.administrativeDistance ?? 1) ||
      (route.administrativeDistance ?? 1) < 0 ||
      !Number.isFinite(route.metric ?? 0) || (route.metric ?? 0) < 0) {
      throw new TypeError("Route administrative distance and metric must be non-negative.");
    }
    const normalized = {
      ...route,
      ...prefix,
      administrativeDistance: route.administrativeDistance ?? 1,
      metric: route.metric ?? 0,
      type: route.type ?? "static",
    };
    this.routes.push(normalized);
    return normalized;
  }

  removeStatic(destination, nextHop = null, interfaceId = null) {
    const before = this.routes.length;
    this.routes = this.routes.filter((route) =>
      route.type !== "static" ||
      route.destination !== destination ||
      route.nextHop !== nextHop ||
      route.interfaceId !== interfaceId
    );
    return this.routes.length !== before;
  }

  getRoutes() {
    return this.routes.map((route) => ({ ...route }));
  }
}