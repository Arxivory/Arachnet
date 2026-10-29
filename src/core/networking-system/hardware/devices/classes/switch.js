import { Device } from "../base/device";
import { PoeManager } from "../../components/power/poe/poe-manager";
import { CamTable } from "../../../engine/state/cam-table";
import { SpanningTree } from "../../../engine/protocols/l2/stp";
import { VlanInterface } from "../../components/interfaces/virtual/vlan-interface";
import { parseIpv4Cidr } from "../../../engine/utils/ipv4";

export class Switch extends Device {
  constructor({ switchingMode = null, poeBudgetWatts = null, ...options }) {
    super(options);
    this.assertHardwareProfileKind("switch");
    if (switchingMode === null) switchingMode = this.hardwareProfile?.switchingMode ?? "layer2";
    if (poeBudgetWatts === null) poeBudgetWatts = this.hardwareProfile?.poeBudgetWatts ?? 0;
    if (!["layer2", "layer3"].includes(switchingMode)) {
      throw new RangeError(`Invalid switch mode: ${switchingMode}`);
    }
    this.kind = "switch";
    this.switchingMode = switchingMode;
    this.poeManager = new PoeManager({ budgetWatts: poeBudgetWatts });
    this.vlans = new Map([[1, { id: 1, name: "default" }]]);
    this.vlanInterfaces = new Map();
    this.portModes = new Map();
    this.camTable = new CamTable();
    this.spanningTree = new SpanningTree({ bridgeId: this.id });
    this.ensureVlanInterface(1);
  }

  addVlan(id, name) {
    if (!Number.isInteger(id) || id < 1 || id > 4094 || !name) {
      throw new TypeError("A VLAN requires an id from 1 through 4094 and a name.");
    }
    this.vlans.set(id, { id, name });
    this.ensureVlanInterface(id);
  }

  ensureVlanInterface(vlanId) {
    if (this.vlanInterfaces.has(vlanId)) return this.vlanInterfaces.get(vlanId);
    const suffix = vlanId.toString(16).padStart(2, "0");
    const networkInterface = new VlanInterface({
      id: `${this.id}-svi-${vlanId}`,
      name: `Vlan${vlanId}`,
      vlanId,
      macAddress: `02:00:00:00:${suffix.slice(-2)}:${suffix.slice(0, 2)}`,
      lineStatus: "down",
    });
    this.addInterface(networkInterface);
    this.vlanInterfaces.set(vlanId, networkInterface);
    return networkInterface;
  }

  configureSvi(vlanId, address) {
    if (!this.vlans.has(vlanId)) {
      throw new Error(`VLAN ${vlanId} is not defined on switch ${this.name}.`);
    }
    const networkInterface = this.ensureVlanInterface(vlanId);
    if (!address) {
      networkInterface.ipv4Addresses = [];
      return networkInterface;
    }
    const parsedAddress = parseIpv4Cidr(address);
    networkInterface.ipv4Addresses = [`${parsedAddress.address}/${parsedAddress.prefixLength}`];
    return networkInterface;
  }

  removeVlan(vlanId) {
    if (vlanId === 1) throw new TypeError("VLAN 1 cannot be removed.");
    this.vlans.delete(vlanId);
    const networkInterface = this.vlanInterfaces.get(vlanId);
    if (networkInterface) this.interfaces.delete(networkInterface.id);
    this.vlanInterfaces.delete(vlanId);
    for (const [portId, mode] of this.portModes) {
      if (mode.mode === "access" && mode.accessVlan === vlanId) {
        this.portModes.delete(portId);
      } else if (mode.mode === "trunk") {
        const allowedVlans = mode.allowedVlans.filter((allowedId) => allowedId !== vlanId);
        if (!allowedVlans.includes(mode.nativeVlan)) {
          this.portModes.delete(portId);
        } else {
          this.portModes.set(portId, { ...mode, allowedVlans });
        }
      }
    }
  }

  syncVlanInterfaceState(vlanId) {
    const networkInterface = this.vlanInterfaces.get(vlanId);
    if (!networkInterface) return;
    const hasActiveMember = [...this.ports.values()].some((port) => {
      if (port.status !== "up") return false;
      const mode = this.portModes.get(port.id) ?? { mode: "access", accessVlan: 1 };
      return mode.mode === "access"
        ? mode.accessVlan === vlanId
        : mode.mode === "trunk" && mode.allowedVlans.includes(vlanId);
    });
    networkInterface.lineStatus = this.vlans.has(vlanId) && hasActiveMember ? "up" : "down";
  }

  configureAccessPort(portId, vlanId = 1) {
    this.requirePortAndVlan(portId, vlanId);
    this.portModes.set(portId, { mode: "access", accessVlan: vlanId });
  }

  configureTrunkPort(portId, allowedVlans = [1], nativeVlan = 1) {
    if (!Array.isArray(allowedVlans) || !allowedVlans.includes(nativeVlan)) {
      throw new TypeError("A trunk must include its native VLAN in allowedVlans.");
    }
    this.requirePortAndVlan(portId, nativeVlan);
    allowedVlans.forEach((vlanId) => this.requirePortAndVlan(portId, vlanId));
    this.portModes.set(portId, {
      mode: "trunk",
      allowedVlans: [...new Set(allowedVlans)].sort((a, b) => a - b),
      nativeVlan,
    });
  }

  allocatePoe(portId, deviceId, watts, standard = this.ports.get(portId)?.poe?.standard) {
    const port = this.ports.get(portId);
    if (!port) throw new Error(`Unknown switch port: ${portId}`);
    if (!port.poe) throw new Error(`Port ${port.name} does not support PoE.`);
    const supportedStandards = port.poe.standards ?? [port.poe.standard].filter(Boolean);
    if (!standard || !supportedStandards.includes(standard)) {
      throw new Error(`Port ${port.name} does not support PoE standard ${standard || "(unspecified)"}.`);
    }
    if (Number.isFinite(port.poe.maxWatts) && watts > port.poe.maxWatts) {
      throw new RangeError(`Port ${port.name} supports at most ${port.poe.maxWatts} W.`);
    }
    this.poeManager.allocate(deviceId, watts, standard, portId);
  }

  releasePoe(deviceId) {
    return this.poeManager.release(deviceId);
  }

  requirePortAndVlan(portId, vlanId) {
    if (!this.ports.has(portId)) throw new Error(`Unknown switch port: ${portId}`);
    if (!this.vlans.has(vlanId)) throw new Error(`VLAN ${vlanId} is not defined on switch ${this.name}.`);
  }

  toJSON() {
    return {
      ...super.toJSON(),
      switchingMode: this.switchingMode,
      poeManager: this.poeManager.toJSON(),
      vlans: [...this.vlans.values()].map((vlan) => ({ ...vlan })),
      vlanInterfaces: [...this.vlanInterfaces.values()].map((networkInterface) => networkInterface.toJSON()),
      portModes: Object.fromEntries(this.portModes),
      camTable: this.camTable.toJSON(),
      spanningTree: {
        rootId: this.spanningTree.rootId,
        rootPriority: this.spanningTree.rootPriority ?? this.spanningTree.priority,
        priority: this.spanningTree.priority,
        rootPathCost: this.spanningTree.rootPathCost,
        rootPortId: this.spanningTree.rootPortId,
        portStates: Object.fromEntries(this.spanningTree.portStates),
      },
    };
  }
}
