import { ipv4ToInt, parseIpv4Cidr } from "../../utils/ipv4";

export class StaticRoute {
  constructor({ destination, nextHop = null, interfaceId = null, administrativeDistance = 1, metric = 0 }) {
    if (!destination || (!nextHop && !interfaceId)) {
      throw new TypeError("A static route requires a destination and nextHop or interfaceId.");
    }
    if (!Number.isInteger(administrativeDistance) || administrativeDistance < 0 ||
      !Number.isFinite(metric) || metric < 0) {
      throw new TypeError("Route administrative distance and metric must be non-negative.");
    }
    Object.assign(this, parseIpv4Cidr(destination));
    if (nextHop) ipv4ToInt(nextHop);
    this.destination = destination;
    this.nextHop = nextHop;
    this.interfaceId = interfaceId;
    this.administrativeDistance = administrativeDistance;
    this.metric = metric;
    this.type = "static";
  }

  toJSON() {
    return {
      destination: this.destination,
      nextHop: this.nextHop,
      interfaceId: this.interfaceId,
      administrativeDistance: this.administrativeDistance,
      metric: this.metric,
      type: this.type,
    };
  }
}
