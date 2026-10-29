export class SpanningTree {
  constructor({ bridgeId, priority = 32768, pathCost = 0 } = {}) {
    if (!bridgeId) throw new TypeError("STP requires a bridgeId.");
    this.bridgeId = bridgeId;
    this.priority = priority;
    this.pathCost = pathCost;
    this.rootId = bridgeId;
    this.rootPathCost = 0;
    this.rootPortId = null;
    this.portStates = new Map();
    this.neighbors = new Map();
  }

  addPort(portId) {
    if (!this.portStates.has(portId)) this.portStates.set(portId, "forwarding");
  }

  removePort(portId) {
    this.portStates.delete(portId);
    this.neighbors.delete(portId);
    if (this.rootPortId === portId) this.recomputeRoot();
  }

  getPortState(portId) {
    return this.portStates.get(portId) ?? "disabled";
  }

  setPortState(portId, state) {
    if (!["forwarding", "learning", "blocking", "disabled"].includes(state)) {
      throw new RangeError(`Invalid STP port state: ${state}`);
    }
    this.portStates.set(portId, state);
  }

  createBpdu(portId = null) {
    return {
      rootId: this.rootId,
      rootPriority: this.rootPriority ?? this.priority,
      rootPathCost: this.rootPathCost,
      bridgeId: this.bridgeId,
      bridgePriority: this.priority,
      senderPortId: portId,
    };
  }

  receiveBpdu(portId, bpdu) {
    if (!bpdu?.rootId || !bpdu?.bridgeId || !Number.isFinite(bpdu.rootPathCost)) {
      throw new TypeError("Invalid STP BPDU.");
    }
    this.addPort(portId);
    this.neighbors.set(portId, { ...bpdu });
    this.recomputeRoot();
  }

  recomputeRoot() {
    let best = {
      rootId: this.bridgeId,
      rootPriority: this.priority,
      rootPathCost: 0,
      bridgeId: this.bridgeId,
      bridgePriority: this.priority,
      portId: null,
    };
    for (const [portId, bpdu] of this.neighbors) {
      const candidate = {
        rootId: bpdu.rootId,
        rootPriority: bpdu.rootPriority ?? 32768,
        rootPathCost: bpdu.rootPathCost + this.pathCost,
        bridgeId: bpdu.bridgeId,
        bridgePriority: bpdu.bridgePriority ?? 32768,
        portId,
      };
      if (this.compare(candidate, best) < 0) best = candidate;
    }
    this.rootId = best.rootId;
    this.rootPriority = best.rootPriority;
    this.rootPathCost = best.rootPathCost;
    this.rootPortId = best.portId;
    for (const portId of this.neighbors.keys()) {
      this.portStates.set(portId, portId === this.rootPortId ? "forwarding" : "blocking");
    }
  }

  compare(a, b) {
    return a.rootPriority - b.rootPriority ||
      a.rootId.localeCompare(b.rootId) ||
      a.rootPathCost - b.rootPathCost ||
      a.bridgePriority - b.bridgePriority ||
      a.bridgeId.localeCompare(b.bridgeId) ||
      String(a.portId).localeCompare(String(b.portId));
  }
}