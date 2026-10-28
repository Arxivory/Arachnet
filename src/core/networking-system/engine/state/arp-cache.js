import { normalizeMacAddress } from "../utils/ipv4";

export class ArpCache {
  constructor({ agingTimeMs = 300000, retryLimit = 3, retryIntervalMs = 1000, clock = () => Date.now() } = {}) {
    if (!Number.isFinite(agingTimeMs) || agingTimeMs <= 0 ||
      !Number.isInteger(retryLimit) || retryLimit < 1 ||
      !Number.isFinite(retryIntervalMs) || retryIntervalMs <= 0) {
      throw new TypeError("ARP aging and retry settings must be positive.");
    }
    this.agingTimeMs = agingTimeMs;
    this.retryLimit = retryLimit;
    this.retryIntervalMs = retryIntervalMs;
    this.clock = clock;
    this.entries = new Map();
    this.pending = new Map();
  }

  lookup(ipAddress) {
    const entry = this.entries.get(ipAddress);
    if (!entry) return null;
    if (this.clock() - entry.learnedAt >= this.agingTimeMs) {
      this.entries.delete(ipAddress);
      return null;
    }
    return entry.macAddress;
  }

  learn(ipAddress, macAddress) {
    this.entries.set(ipAddress, {
      ipAddress,
      macAddress: normalizeMacAddress(macAddress),
      learnedAt: this.clock(),
    });
    const state = this.pending.get(ipAddress);
    this.pending.delete(ipAddress);
    return state?.packets ?? [];
  }

  queue(ipAddress, packet) {
    const state = this.pending.get(ipAddress) ?? { packets: [], attempts: 0, lastAttemptAt: null };
    state.packets.push(packet);
    this.pending.set(ipAddress, state);
    return state;
  }

  recordRequest(ipAddress) {
    const state = this.pending.get(ipAddress) ?? { packets: [], attempts: 0, lastAttemptAt: null };
    if (state.attempts >= this.retryLimit) {
      this.pending.delete(ipAddress);
      return { exhausted: true, packets: state.packets };
    }
    state.attempts += 1;
    state.lastAttemptAt = this.clock();
    this.pending.set(ipAddress, state);
    return { exhausted: false, attempts: state.attempts };
  }

  dueRequests() {
    const now = this.clock();
    return [...this.pending.entries()]
      .filter(([, state]) => state.lastAttemptAt === null ||
        now - state.lastAttemptAt >= this.retryIntervalMs)
      .map(([ipAddress]) => ipAddress);
  }
}