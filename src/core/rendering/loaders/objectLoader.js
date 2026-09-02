import { OBJLoader } from "three/examples/jsm/Addons.js";
import { MTLLoader } from "three/examples/jsm/Addons.js";

class AssetManager {
    constructor() {
        this.objLoader = new OBJLoader();
        this.mtlLoader = new MTLLoader();
        this.cache = new Map();
    }

    async loadDeviceModel(url) {
        if (this.cache.has(url)) {
            return this.cache.get(url).clone();
        }

        return new Promise((resolve, reject) => {
            this.objLoader.load(url, (obj) => {
                this.cache.set(url, obj);
                resolve(obj.clone());
            }, undefined, reject);
        });
    }
}

export const assetManager = new AssetManager();