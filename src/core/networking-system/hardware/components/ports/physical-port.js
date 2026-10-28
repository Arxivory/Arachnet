const PORT_STATUSES = new Set(["up", "down", "err-disabled"]);

export class PhysicalPort {
  constructor({
    id,
    name,
    media = "copper",
    connector = "8P8C",
    supportedSpeedsMbps = [10, 100, 1000],
    supportedDuplexModes = ["half", "full"],
    autoMdix = true,
    poe = null,
    enabled = true,
  }) {
    if (!id || !name) {
      throw new TypeError("A physical port requires an id and name.");
    }
    if (!Array.isArray(supportedSpeedsMbps) || supportedSpeedsMbps.length === 0 ||
      supportedSpeedsMbps.some((speed) => !Number.isFinite(speed) || speed <= 0)) {
      throw new TypeError("supportedSpeedsMbps must contain positive finite speeds.");
    }
    if (!Array.isArray(supportedDuplexModes) ||
      supportedDuplexModes.some((mode) => !["half", "full"].includes(mode))) {
      throw new TypeError("supportedDuplexModes must contain only half or full.");
    }

    this.id = id;
    this.name = name;
    this.media = media;
    this.connector = connector;
    this.supportedSpeedsMbps = [...new Set(supportedSpeedsMbps)].sort((a, b) => a - b);
    this.supportedDuplexModes = [...new Set(supportedDuplexModes)];
    this.autoMdix = Boolean(autoMdix);
    this.poe = poe ? { ...poe } : null;
    this.enabled = Boolean(enabled);
    this.status = "down";
    this.linkId = null;
  }

  attachLink(linkId) {
    if (this.linkId) {
      throw new Error(`Port ${this.name} is already connected to link ${this.linkId}.`);
    }
    this.linkId = linkId;
    this.status = this.enabled ? "up" : "down";
  }

  detachLink() {
    this.linkId = null;
    this.status = "down";
  }

  setStatus(status) {
    if (!PORT_STATUSES.has(status)) {
      throw new RangeError(`Invalid physical port status: ${status}`);
    }
    this.status = status;
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    if (!this.enabled && this.status !== "err-disabled") this.status = "down";
    else if (this.enabled && this.linkId) this.status = "up";
  }

  toJSON() {
    return { ...this, supportedSpeedsMbps: [...this.supportedSpeedsMbps], supportedDuplexModes: [...this.supportedDuplexModes] };
  }
}
