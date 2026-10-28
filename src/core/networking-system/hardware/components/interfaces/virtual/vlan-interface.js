import { NetworkInterface } from "../network-interface";

export class VlanInterface extends NetworkInterface {
  constructor({ vlanId, ...options }) {
    super({ ...options, physicalPortId: null });
    if (!Number.isInteger(vlanId) || vlanId < 1 || vlanId > 4094) {
      throw new RangeError("vlanId must be an integer from 1 through 4094.");
    }
    this.vlanId = vlanId;
  }

  toJSON() {
    return { ...super.toJSON(), vlanId: this.vlanId };
  }
}
