export default class Switch extends Device {
    constructor(props) {
        super({ ...props, type: 'switch' });

        this.vlans = new Map();
        this.macTable = new Map();
        this.defaultGateway = null;
    }

    addVlan(vlanId, name) {
        this.vlans.set(vlanId, {
            id: vlanId,
            ipv4: config.ipv4 || null,
            ipv6: config.ipv6 || null,
            status: 'active'
        });
    }
}