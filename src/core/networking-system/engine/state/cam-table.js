import { normalizeMacAddress } from "../utils/ipv4";

export class CamTable {
  constructor({ agingTimeMs = 300000, clock = () => Date.now() } = {}) {
    if (!Number.isFinite(agingTimeMs) || agingTimeMs <= 0) {
      throw new TypeError("agingTimeMs must be a positive finite number.");
    }
    this.agingTimeMs = agingTimeMs;
    this.clock = clock;
    this.entries = new Map();
  }

  key(vlanId, macAddress) {
    return `${vlanId}:${normalizeMacAddress(macAddress)}`;
  }

  learn(vlanId, macAddress, portId) {
    if (!Number.isInteger(vlanId) || vlanId < 1 || vlanId > 4094 || !portId) {
      throw new TypeError("CAM learning requires a valid VLAN and port.");
    }
    this.entries.set(this.key(vlanId, macAddress), {
      vlanId,
      macAddress: normalizeMacAddress(macAddress),
      portId,
      learnedAt: this.clock(),
    });
  }

  lookup(vlanId, macAddress) {
    const key = this.key(vlanId, macAddress);
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (this.clock() - entry.learnedAt >= this.agingTimeMs) {
      this.entries.delete(key);
      return null;
    }
    return entry.portId;
  }

  removePort(portId) {
    for (const [key, entry] of this.entries) {
      if (entry.portId === portId) this.entries.delete(key);
    }
  }

  age() {
    for (const [key, entry] of this.entries) {
      if (this.clock() - entry.learnedAt >= this.agingTimeMs) this.entries.delete(key);
    }
  }

  toJSON() {
    this.age();
    return [...this.entries.values()].map((entry) => ({ ...entry }));
  }
}