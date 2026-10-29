const COPPER_CABLE_TYPES = new Set(["cat5e", "cat6", "cat6a"]);
const FIBER_CABLE_TYPES = new Set(["om3", "om4", "os2"]);

function validatePoint(point) {
  if (!Array.isArray(point) || point.length !== 3 || point.some((coordinate) => !Number.isFinite(coordinate))) {
    throw new TypeError("Route points must be [x, y, z] coordinates in meters.");
  }
  return [...point];
}

function polylineLength(points) {
  return points.slice(1).reduce((total, point, index) => {
    const previous = points[index];
    return total + Math.hypot(
      point[0] - previous[0],
      point[1] - previous[1],
      point[2] - previous[2]
    );
  }, 0);
}

export class EthernetLink {
  constructor({
    id,
    portAId,
    portBId,
    cableType = "cat6",
    routePoints = [],
    junctionIds = [],
    conduitSegmentIds = [],
    routingAlgorithm = null,
    cableAreaMm2 = 0,
    patchCordLengthMeters = 0,
    status = "down",
    negotiatedSpeedMbps = null,
    negotiatedDuplex = null,
  }) {
    if (!id || !portAId || !portBId || portAId === portBId) {
      throw new TypeError("An Ethernet link requires an id and two distinct port ids.");
    }
    const media = COPPER_CABLE_TYPES.has(cableType)
      ? "copper"
      : FIBER_CABLE_TYPES.has(cableType)
        ? "fiber"
        : null;
    if (!media) {
      throw new RangeError(`Unsupported Ethernet cable type: ${cableType}`);
    }
    if (!["up", "down", "err-disabled"].includes(status)) {
      throw new RangeError(`Invalid Ethernet link status: ${status}`);
    }
    if (!Number.isFinite(patchCordLengthMeters) || patchCordLengthMeters < 0) {
      throw new TypeError("patchCordLengthMeters must be non-negative.");
    }
    if (!Array.isArray(junctionIds) || !Array.isArray(conduitSegmentIds)) {
      throw new TypeError("Conduit junction and segment ids must be arrays.");
    }
    if (!Number.isFinite(cableAreaMm2) || cableAreaMm2 < 0) {
      throw new TypeError("Cable cross-sectional area must be non-negative.");
    }

    this.id = id;
    this.kind = "ethernet";
    this.portAId = portAId;
    this.portBId = portBId;
    this.media = media;
    this.cableType = cableType;
    this.routePoints = routePoints.map(validatePoint);
    this.junctionIds = [...junctionIds];
    this.conduitSegmentIds = [...conduitSegmentIds];
    this.routingAlgorithm = routingAlgorithm;
    this.cableAreaMm2 = cableAreaMm2;
    this.patchCordLengthMeters = patchCordLengthMeters;
    this.status = status;
    this.negotiatedSpeedMbps = negotiatedSpeedMbps;
    this.negotiatedDuplex = negotiatedDuplex;
  }

  get routedLengthMeters() {
    return polylineLength(this.routePoints);
  }

  get channelLengthMeters() {
    return this.routedLengthMeters + this.patchCordLengthMeters;
  }

  get distanceComplianceStatus() {
    if (this.routePoints.length < 2) return "unverified";
    if (this.media === "fiber") return "not-applicable";
    return this.channelLengthMeters <= 100 ? "compliant" : "violated";
  }

  get distanceCompliant() {
    return this.distanceComplianceStatus === "compliant";
  }

  toJSON() {
    return {
      ...this,
      routePoints: this.routePoints.map((point) => [...point]),
      routedLengthMeters: this.routedLengthMeters,
      channelLengthMeters: this.channelLengthMeters,
      distanceComplianceStatus: this.distanceComplianceStatus,
      distanceCompliant: this.distanceCompliant,
    };
  }
}
