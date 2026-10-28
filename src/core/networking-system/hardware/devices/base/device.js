function vector3(value, field) {
  if (!Array.isArray(value) || value.length !== 3 || value.some((part) => !Number.isFinite(part))) {
    throw new TypeError(`${field} must be a three-number array in meters/radians.`);
  }
  return [...value];
}

export class Device {
  constructor({ id, name, model = "generic", floorId = null, position = [0, 0, 0], rotation = [0, 0, 0], hardwareProfile = null }) {
    if (new.target === Device) {
      throw new TypeError("Device is an abstract base class.");
    }
    if (!id || !name) {
      throw new TypeError("A device requires an id and name.");
    }
    this.id = id;
    this.name = name;
    this.model = model;
    this.floorId = floorId;
    this.transform = {
      position: vector3(position, "position"),
      rotation: vector3(rotation, "rotation"),
    };
    this.hardwareProfile = hardwareProfile ? structuredClone(hardwareProfile) : null;
    this.ports = new Map();
    this.interfaces = new Map();
    this.receivedFrames = [];
  }

  addPort(port) {
    if (!port?.id || !port?.name) {
      throw new TypeError("A device port must have an id and name.");
    }
    if (this.ports.has(port.id)) {
      throw new Error(`Port ${port.id} already exists on device ${this.id}.`);
    }
    this.ports.set(port.id, port);
    return port;
  }

  addInterface(networkInterface) {
    if (!networkInterface?.id || !networkInterface?.name) {
      throw new TypeError("A device interface must have an id and name.");
    }
    if (this.interfaces.has(networkInterface.id)) {
      throw new Error(`Interface ${networkInterface.id} already exists on device ${this.id}.`);
    }
    if (networkInterface.physicalPortId) {
      const port = this.ports.get(networkInterface.physicalPortId);
      if (!port) {
        throw new Error(`Interface ${networkInterface.name} references an unknown physical port.`);
      }
      const alreadyBound = [...this.interfaces.values()].some(
        (existing) => existing.physicalPortId === networkInterface.physicalPortId
      );
      if (alreadyBound) {
        throw new Error(`Physical port ${port.name} is already bound to an interface.`);
      }
    }
    this.interfaces.set(networkInterface.id, networkInterface);
    return networkInterface;
  }

  toJSON() {
    return {
      id: this.id,
      kind: this.kind,
      name: this.name,
      model: this.model,
      floorId: this.floorId,
      transform: {
        position: [...this.transform.position],
        rotation: [...this.transform.rotation],
      },
      hardwareProfile: this.hardwareProfile ? structuredClone(this.hardwareProfile) : null,
      ports: [...this.ports.values()].map((port) => port.toJSON()),
      interfaces: [...this.interfaces.values()].map((networkInterface) => networkInterface.toJSON()),
    };
  }
}
