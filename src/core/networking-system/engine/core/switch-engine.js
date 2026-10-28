import { ETHER_TYPE } from "../definitions/frame";
import { isBroadcastMac, isMulticastMac } from "../utils/ipv4";
import { Vlan8021Q } from "../protocols/l2/vlan-8021q";

export class SwitchEngine {
  processIngress(switchDevice, ingressPortId, frame) {
    const ingressPort = switchDevice.ports.get(ingressPortId);
    if (!ingressPort || ingressPort.status !== "up") {
      return { outputs: [], dropped: true, reason: "ingress-port-down" };
    }

    for (const portId of switchDevice.ports.keys()) {
      switchDevice.spanningTree.addPort(portId);
    }
    const stpState = switchDevice.spanningTree.getPortState(ingressPortId);
    if (stpState === "blocking" || stpState === "disabled") {
      return { outputs: [], dropped: true, reason: `stp-${stpState}` };
    }

    const classified = Vlan8021Q.ingressFrame(switchDevice, ingressPortId, frame);
    if (!classified.accepted) {
      return { outputs: [], dropped: true, reason: classified.reason };
    }
    const vlanFrame = classified.frame;
    if (vlanFrame.etherType === ETHER_TYPE.BPDU && vlanFrame.payload?.kind === "bpdu") {
      switchDevice.spanningTree.receiveBpdu(ingressPortId, vlanFrame.payload.bpdu);
      return { outputs: [], dropped: false, reason: "bpdu-processed" };
    }

    if (!isMulticastMac(vlanFrame.sourceMac)) {
      switchDevice.camTable.learn(vlanFrame.vlanId, vlanFrame.sourceMac, ingressPortId);
    }
    if (stpState === "learning") {
      return { outputs: [], dropped: false, reason: "stp-learning" };
    }

    const learnedPort = isBroadcastMac(vlanFrame.destinationMac) || isMulticastMac(vlanFrame.destinationMac)
      ? null
      : switchDevice.camTable.lookup(vlanFrame.vlanId, vlanFrame.destinationMac);
    if (learnedPort === ingressPortId) {
      return { outputs: [], dropped: false, reason: "same-ingress-port" };
    }

    const candidates = learnedPort
      ? [learnedPort]
      : [...switchDevice.ports.keys()].filter((portId) => portId !== ingressPortId);
    const outputs = [];
    for (const portId of candidates) {
      const port = switchDevice.ports.get(portId);
      if (!port || port.status !== "up" ||
        switchDevice.spanningTree.getPortState(portId) !== "forwarding") continue;
      const egressFrame = Vlan8021Q.egressFrame(switchDevice, portId, vlanFrame);
      if (egressFrame) outputs.push({ portId, frame: egressFrame });
    }
    return {
      outputs,
      dropped: Boolean(learnedPort && outputs.length === 0),
      reason: outputs.length ? null : learnedPort ? "destination-egress-unavailable" : "no-eligible-egress",
    };
  }
}