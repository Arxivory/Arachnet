const STANDARD_LIMITS_W = {
  "802.3af": 15.4,
  "802.3at": 30,
  "802.3bt-type-3": 60,
  "802.3bt-type-4": 90,
};

export class PoeManager {
  constructor({ budgetWatts = 0, standard = null } = {}) {
    if (!Number.isFinite(budgetWatts) || budgetWatts < 0) {
      throw new TypeError("budgetWatts must be a non-negative finite number.");
    }
    this.budgetWatts = budgetWatts;
    this.standard = standard;
    this.allocations = new Map();
  }

  get allocatedWatts() {
    return [...this.allocations.values()].reduce((total, allocation) => total + allocation.watts, 0);
  }

  get availableWatts() {
    return Math.max(0, this.budgetWatts - this.allocatedWatts);
  }

  allocate(deviceId, watts, standard = this.standard, portId = null) {
    if (!deviceId || !Number.isFinite(watts) || watts <= 0) {
      throw new TypeError("A PoE allocation requires a device id and positive finite wattage.");
    }
    if (this.allocations.has(deviceId)) {
      throw new Error(`PoE is already allocated to device ${deviceId}.`);
    }
    const standardLimit = STANDARD_LIMITS_W[standard];
    if (standard && !standardLimit) {
      throw new RangeError(`Unsupported IEEE PoE standard: ${standard}`);
    }
    if (standardLimit && watts > standardLimit) {
      throw new RangeError(`${standard} supports at most ${standardLimit} W at the powered-device interface.`);
    }
    if (watts > this.availableWatts) {
      throw new RangeError(`PoE budget exceeded: ${watts} W requested, ${this.availableWatts} W available.`);
    }
    this.allocations.set(deviceId, { watts, standard, portId });
  }

  release(deviceId) {
    return this.allocations.delete(deviceId);
  }

  toJSON() {
    return {
      budgetWatts: this.budgetWatts,
      standard: this.standard,
      allocations: Object.fromEntries(this.allocations),
    };
  }
}
