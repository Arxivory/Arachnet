export class Vlan8021Q {
  static ingressFrame(switchDevice, portId, frame) {
    const mode = switchDevice.portModes.get(portId) ?? { mode: "access", accessVlan: 1 };
    if (mode.mode === "access") {
      if (frame.vlanId !== null && frame.vlanId !== undefined) {
        return { accepted: false, reason: "tagged-frame-on-access-port" };
      }
      if (!switchDevice.vlans.has(mode.accessVlan)) {
        return { accepted: false, reason: "access-vlan-not-present" };
      }
      return { accepted: true, frame: frame.clone({ vlanId: mode.accessVlan }) };
    }
    if (mode.mode !== "trunk") return { accepted: false, reason: "invalid-port-mode" };
    const vlanId = frame.vlanId ?? mode.nativeVlan;
    if (!mode.allowedVlans.includes(vlanId) || !switchDevice.vlans.has(vlanId)) {
      return { accepted: false, reason: "vlan-not-allowed-on-trunk" };
    }
    return { accepted: true, frame: frame.clone({ vlanId }) };
  }

  static egressFrame(switchDevice, portId, frame) {
    const mode = switchDevice.portModes.get(portId) ?? { mode: "access", accessVlan: 1 };
    if (mode.mode === "access") {
      return mode.accessVlan === frame.vlanId ? frame.clone({ vlanId: null }) : null;
    }
    if (mode.mode !== "trunk" || !mode.allowedVlans.includes(frame.vlanId)) return null;
    return frame.clone({ vlanId: frame.vlanId === mode.nativeVlan ? null : frame.vlanId });
  }
}