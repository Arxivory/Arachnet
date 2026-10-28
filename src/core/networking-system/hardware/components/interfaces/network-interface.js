const LINE_STATUSES = new Set(["up", "down"]);

export class NetworkInterface {
  constructor({ id, name, physicalPortId = null, adminEnabled = true, lineStatus = "down", macAddress = null, ipv4Addresses = [] }) {
    if (!id || !name) {
      throw new TypeError("A network interface requires an id and name.");
    }
    if (!LINE_STATUSES.has(lineStatus)) {
      throw new RangeError(`Invalid interface line status: ${lineStatus}`);
    }
    this.id = id;
    this.name = name;
    this.physicalPortId = physicalPortId;
    this.adminEnabled = Boolean(adminEnabled);
    this.lineStatus = lineStatus;
    this.macAddress = macAddress;
    this.ipv4Addresses = [...ipv4Addresses];
  }

  isOperational(physicalPort) {
    if (!this.adminEnabled || this.lineStatus !== "up") return false;
    if (!this.physicalPortId) return true;
    return Boolean(
      physicalPort &&
      physicalPort.id === this.physicalPortId &&
      physicalPort.status === "up"
    );
  }

  toJSON() {
    return { ...this, ipv4Addresses: [...this.ipv4Addresses] };
  }
}
