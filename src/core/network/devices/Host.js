import Device from '../Device.js';

export default class Host extends Device {
    constructor(props) {
        super({ ...props, type: 'host' });

        this.defaultGateway = null;
    }

    configureIPv4({ address, subnetMask, defaultGateway }) {
        const intf = this.interfaces[0];
        if (!intf) throw new Error("Host must have at least one interface.");

        intf.configureIPv4({ address, subnetMask });
        this.defaultGateway = defaultGateway;
    }
}