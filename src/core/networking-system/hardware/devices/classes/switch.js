import { Device } from "../base/device";
import { PoeManager } from "../../components/power/poe/poe-manager";
import { CamTable } from "../../../engine/state/cam-table";
import { SpanningTree } from "../../../engine/protocols/l2/stp";

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
    this.portModes = new Map();
    this.camTable = new CamTable();
    this.spanningTree = new SpanningTree({ bridgeId: this.id });
  }

  addVlan(id, name) {
    if (!Number.isInteger(id) || id < 1 || id > 4094 || !name) {
      throw new TypeError("A VLAN requires an id from 1 through 4094 and a name.");
    }
    this.vlans.set(id, { id, name });
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
      portModes: Object.fromEntries(this.portModes),
      camTable: this.camTable.toJSON(),
      spanningTree: {
        rootId: this.spanningTree.rootId,
        rootPathCost: this.spanningTree.rootPathCost,
        rootPortId: this.spanningTree.rootPortId,
        portStates: Object.fromEntries(this.spanningTree.portStates),
      },
    };
  }
}
