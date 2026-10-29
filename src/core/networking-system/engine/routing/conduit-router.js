function vector3(value, field) {
  if (!Array.isArray(value) || value.length !== 3 ||
    value.some((coordinate) => !Number.isFinite(coordinate))) {
    throw new TypeError(`${field} must be a finite [x, y, z] coordinate in meters.`);
  }
  return [...value];
}

function distance3D(first, second) {
  return Math.hypot(
    first[0] - second[0],
    first[1] - second[1],
    first[2] - second[2]
  );
}

class MinHeap {
  constructor() {
    this.items = [];
  }

  push(item) {
    this.items.push(item);
    let index = this.items.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.items[parent].priority <= item.priority) break;
      this.items[index] = this.items[parent];
      index = parent;
    }
    this.items[index] = item;
  }

  pop() {
    if (this.items.length === 0) return null;
    const first = this.items[0];
    const last = this.items.pop();
    if (this.items.length > 0) {
      let index = 0;
      while (true) {
        const left = index * 2 + 1;
        const right = left + 1;
        if (left >= this.items.length) break;
        const child = right < this.items.length &&
          this.items[right].priority < this.items[left].priority
          ? right
          : left;
        if (this.items[child].priority >= last.priority) break;
        this.items[index] = this.items[child];
        index = child;
      }
      this.items[index] = last;
    }
    return first;
  }

  get size() {
    return this.items.length;
  }
}

export class ConduitRouter {
  constructor({ junctions = [], segments = [] } = {}) {
    this.junctions = new Map();
    this.segments = new Map();
    this.adjacency = new Map();
    this.reservations = new Map();

    for (const junction of junctions) {
      if (!junction?.id || this.junctions.has(junction.id)) {
        throw new Error(`Invalid or duplicate structural junction id: ${junction?.id}`);
      }
      const normalized = {
        ...junction,
        position: vector3(junction.position, `Junction ${junction.id} position`),
      };
      this.junctions.set(normalized.id, normalized);
      this.adjacency.set(normalized.id, []);
    }

    for (const segment of segments) {
      if (!segment?.id || this.segments.has(segment.id)) {
        throw new Error(`Invalid or duplicate conduit segment id: ${segment?.id}`);
      }
      if (!this.junctions.has(segment.startJunctionId) ||
        !this.junctions.has(segment.endJunctionId) ||
        segment.startJunctionId === segment.endJunctionId) {
        throw new TypeError(`Conduit segment ${segment.id} must connect two distinct known junctions.`);
      }
      const capacityMm2 = segment.capacityMm2 ?? 4000;
      const maxFillRatio = segment.maxFillRatio ?? 0.4;
      if (!Number.isFinite(capacityMm2) || capacityMm2 <= 0 ||
        !Number.isFinite(maxFillRatio) || maxFillRatio <= 0 || maxFillRatio > 0.4) {
        throw new RangeError(`Conduit segment ${segment.id} must have positive capacity and at most 40% fill.`);
      }
      const start = this.junctions.get(segment.startJunctionId);
      const end = this.junctions.get(segment.endJunctionId);
      const normalized = {
        ...segment,
        capacityMm2,
        maxFillRatio,
        lengthMeters: distance3D(start.position, end.position),
      };
      this.segments.set(normalized.id, normalized);
      this.adjacency.get(normalized.startJunctionId).push(normalized);
      this.adjacency.get(normalized.endJunctionId).push(normalized);
    }
  }

  route(startPosition, endPosition, { cableAreaMm2 = 0 } = {}) {
    const start = vector3(startPosition, "Route start");
    const end = vector3(endPosition, "Route end");
    if (!Number.isFinite(cableAreaMm2) || cableAreaMm2 < 0) {
      throw new TypeError("Cable cross-sectional area must be a non-negative number.");
    }
    if (this.junctions.size === 0) throw new Error("Cannot route without structural junctions.");

    const startJunction = this.findNearestJunction(start);
    const endJunction = this.findNearestJunction(end);
    const distances = new Map([[startJunction.id, 0]]);
    const previous = new Map();
    const open = new MinHeap();
    open.push({
      junctionId: startJunction.id,
      priority: distance3D(startJunction.position, endJunction.position),
      distance: 0,
    });

    while (open.size > 0) {
      const current = open.pop();
      if (current.distance !== distances.get(current.junctionId)) continue;
      if (current.junctionId === endJunction.id) break;

      for (const segment of this.adjacency.get(current.junctionId)) {
        if (!this.hasCapacity(segment, cableAreaMm2)) continue;
        const neighborId = segment.startJunctionId === current.junctionId
          ? segment.endJunctionId
          : segment.startJunctionId;
        const candidateDistance = current.distance + segment.lengthMeters;
        if (candidateDistance >= (distances.get(neighborId) ?? Infinity)) continue;
        distances.set(neighborId, candidateDistance);
        previous.set(neighborId, { junctionId: current.junctionId, segmentId: segment.id });
        const neighbor = this.junctions.get(neighborId);
        open.push({
          junctionId: neighborId,
          distance: candidateDistance,
          priority: candidateDistance + distance3D(neighbor.position, endJunction.position),
        });
      }
    }

    if (!distances.has(endJunction.id)) {
      throw new Error(`No conduit route is available from ${startJunction.id} to ${endJunction.id}.`);
    }

    const junctionIds = [endJunction.id];
    const segmentIds = [];
    while (junctionIds[junctionIds.length - 1] !== startJunction.id) {
      const step = previous.get(junctionIds[junctionIds.length - 1]);
      if (!step) throw new Error("Conduit route reconstruction failed.");
      junctionIds.push(step.junctionId);
      segmentIds.push(step.segmentId);
    }
    junctionIds.reverse();
    segmentIds.reverse();
    const routePoints = [
      start,
      ...junctionIds.map((id) => [...this.junctions.get(id).position]),
      end,
    ];
    const accessLengthMeters =
      distance3D(start, startJunction.position) +
      distance3D(end, endJunction.position);
    const conduitLengthMeters = distances.get(endJunction.id);

    return {
      algorithm: "astar-3d",
      junctionIds,
      segmentIds,
      routePoints,
      accessLengthMeters,
      conduitLengthMeters,
      lengthMeters: accessLengthMeters + conduitLengthMeters,
      distanceComplianceStatus: accessLengthMeters + conduitLengthMeters <= 100
        ? "compliant"
        : "violated",
    };
  }

  reserveRoute(reservationId, route, cableAreaMm2) {
    if (!reservationId || this.reservations.has(reservationId)) {
      throw new Error(`Invalid or duplicate route reservation id: ${reservationId}`);
    }
    if (!route || !Array.isArray(route.segmentIds) ||
      !Number.isFinite(cableAreaMm2) || cableAreaMm2 <= 0) {
      throw new TypeError("A route reservation requires segments and a positive cable area.");
    }
    const segments = route.segmentIds.map((id) => {
      const segment = this.segments.get(id);
      if (!segment) throw new Error(`Unknown conduit segment: ${id}`);
      if (!this.hasCapacity(segment, cableAreaMm2)) {
        throw new Error(`Conduit segment ${id} would exceed its ${segment.maxFillRatio * 100}% fill limit.`);
      }
      return segment;
    });
    for (const segment of segments) {
      segment.usedCrossSectionMm2 = (segment.usedCrossSectionMm2 ?? 0) + cableAreaMm2;
    }
    this.reservations.set(reservationId, { segmentIds: [...route.segmentIds], cableAreaMm2 });
  }

  releaseRoute(reservationId) {
    const reservation = this.reservations.get(reservationId);
    if (!reservation) return false;
    for (const id of reservation.segmentIds) {
      const segment = this.segments.get(id);
      segment.usedCrossSectionMm2 -= reservation.cableAreaMm2;
      if (segment.usedCrossSectionMm2 < 1e-9) segment.usedCrossSectionMm2 = 0;
    }
    this.reservations.delete(reservationId);
    return true;
  }

  getSegmentFillRatio(segmentId) {
    const segment = this.segments.get(segmentId);
    if (!segment) throw new Error(`Unknown conduit segment: ${segmentId}`);
    return (segment.usedCrossSectionMm2 ?? 0) / segment.capacityMm2;
  }

  findNearestJunction(position) {
    let nearest = null;
    let nearestDistance = Infinity;
    for (const junction of this.junctions.values()) {
      const distance = distance3D(position, junction.position);
      if (distance < nearestDistance) {
        nearest = junction;
        nearestDistance = distance;
      }
    }
    return nearest;
  }

  hasCapacity(segment, cableAreaMm2) {
    const maximumArea = segment.capacityMm2 * segment.maxFillRatio;
    return (segment.usedCrossSectionMm2 ?? 0) + cableAreaMm2 <= maximumArea + 1e-9;
  }
}
