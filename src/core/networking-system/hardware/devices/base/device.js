import { EthernetInterface } from "../../components/interfaces/ethernet/ethernet-interface";
import { PhysicalPort } from "../../components/ports/physical-port";
import { DeviceCatalog } from "../library/device-catalog";

function vector3(value, field) {
  if (!Array.isArray(value) || value.length !== 3 || value.some((part) => !Number.isFinite(part))) {
    throw new TypeError(`${field} must be a three-number array in meters/radians.`);
  }
  return [...value];
}

function cloneProfile(profile) {
  return JSON.parse(JSON.stringify(profile));
}

function simulatedMacAddress(deviceId, interfaceName) {
  const value = `${deviceId}:${interfaceName}`;
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  }
  let secondaryHash = 0x811c9dc5;
  for (let index = value.length - 1; index >= 0; index -= 1) {
    secondaryHash = Math.imul(secondaryHash ^ value.charCodeAt(index), 0x01000193);
  }
  const suffix = `${(hash >>> 0).toString(16).padStart(8, "0")}${(secondaryHash >>> 0).toString(16).padStart(8, "0")}`.slice(0, 10);
  return `02:${suffix.slice(0, 2)}:${suffix.slice(2, 4)}:${suffix.slice(4, 6)}:${suffix.slice(6, 8)}:${suffix.slice(8, 10)}`;
}

export class Device {
  constructor({
    id,
    name,
    model = null,
    profileId = null,
    floorId = null,
    position = [0, 0, 0],
    rotation = [0, 0, 0],
    hardwareProfile = null,
  }) {
    if (new.target === Device) {
      throw new TypeError("Device is an abstract base class.");
    }
    if (!id || !name) {
      throw new TypeError("A device requires an id and name.");
    }
    if (profileId && hardwareProfile) {
      throw new TypeError("Specify either profileId or hardwareProfile, not both.");
    }
    const resolvedProfile = profileId
      ? DeviceCatalog.getProfile(profileId)
      : hardwareProfile
        ? cloneProfile(hardwareProfile)
        : null;
    this.id = id;
    this.name = name;
    this.model = model ?? resolvedProfile?.model ?? "generic";
    this.profileId = resolvedProfile?.id ?? profileId;
    this.floorId = floorId;
    this.transform = {
      position: vector3(position, "position"),
      rotation: vector3(rotation, "rotation"),
    };
    this.hardwareProfile = resolvedProfile;
    this.ports = new Map();
    this.interfaces = new Map();
    this.receivedFrames = [];
    if (resolvedProfile) this.loadProfileInventory(resolvedProfile);
  }

  static loadHardwareProfile(profileId) {
    return DeviceCatalog.getProfile(profileId);
  }

  assertHardwareProfileKind(expectedKinds) {
    const kinds = Array.isArray(expectedKinds) ? expectedKinds : [expectedKinds];
    if (this.hardwareProfile && !kinds.includes(this.hardwareProfile.kind)) {
      throw new TypeError(
        `Hardware profile ${this.hardwareProfile.id} is for ${this.hardwareProfile.kind}, not ${kinds.join(" or ")}.`
      );
    }
  }

  loadProfileInventory(profile) {
    let portIndex = 0;
    for (const group of profile.portGroups) {
      for (let offset = 0; offset < group.count; offset += 1) {
        portIndex += 1;
        const index = (group.startIndex ?? 1) + offset;
        const name = group.namePattern.replace(/\{index\}/g, String(index));
        const portId = `${this.id}-port-${portIndex}`;
        this.addPort(new PhysicalPort({
          id: portId,
          name,
          media: group.media ?? "copper",
          connector: group.connector ?? "8P8C",
          supportedSpeedsMbps: group.supportedSpeedsMbps,
          supportedDuplexModes: group.supportedDuplexModes ?? ["full"],
          autoMdix: group.autoMdix ?? true,
          poe: group.poe ?? null,
        }));
        if (group.interfaceType === "ethernet") {
          this.addInterface(new EthernetInterface({
            id: `${this.id}-interface-${portIndex}`,
            name,
            physicalPortId: portId,
            macAddress: group.macAddress ?? simulatedMacAddress(this.id, name),
          }));
        } else if (group.interfaceType) {
          throw new TypeError(
            `Unsupported interface type "${group.interfaceType}" in hardware profile ${profile.id}.`
          );
        }
      }
    }
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
      profileId: this.profileId,
      floorId: this.floorId,
      transform: {
        position: [...this.transform.position],
        rotation: [...this.transform.rotation],
      },
      hardwareProfile: this.hardwareProfile ? cloneProfile(this.hardwareProfile) : null,
      ports: [...this.ports.values()].map((port) => port.toJSON()),
      interfaces: [...this.interfaces.values()].map((networkInterface) => networkInterface.toJSON()),
    };
  }
}
