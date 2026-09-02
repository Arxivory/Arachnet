import Device from "../Device.js";
import StaticRouting from '../routing/protocols/StaticRouting.js';

export default class Router extends Device {
    constructor(props) {
        super({ ...props, type: 'router'});

        this.nvram = {};
        this.runningConfig = {};
        this.startupConfig = {};
    }
}