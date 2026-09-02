
export default class DeviceMesh {
    constructor(opts={}, defaultScaler) {
        this.id = opts.id;
        this.catalogId = opts.catalogId || opts.hostname || opts.name;
        this.type = opts.type;
        this.scaler = defaultScaler;

        this.transform = {
            position: opts.transform.position || { x: 0, y: 0, z: 0 },
            rotation: opts.transform.rotation || { x: 0, y: 0, z: 0 },
            scale: opts.transform.scale || { x: 1, y: 1, z: 1 }
        }
    }

    getMesh(loaders, deviceCatalog) {
        const { switches, routers, endDevices, importedDevices } = deviceCatalog; //Added importedDevices to the destructuring assignment

        const cId = this.catalogId;
        const catalogEntry = switches[cId] || routers[cId] || endDevices[cId] || importedDevices[cId]; //Added importedDevices lookup

        if (!catalogEntry)
            throw Error("Device Type is not found");

        const modelPath = catalogEntry.model3D;
        const sourceExt = (catalogEntry.sourceExtension || '').toLowerCase();
        const pathExt = (modelPath.split('.').pop() || '').toLowerCase();
        const effectiveExt = sourceExt || pathExt;

        const applyModelStyleAndTransform = (model) => {
            model.position.set(
                this.transform.position.x,
                this.transform.position.y,
                this.transform.position.z
            );
            model.rotation.set(this.transform.rotation.x, this.transform.rotation.y, this.transform.rotation.z);
            model.scale.set(this.transform.scale.x, this.transform.scale.y, this.transform.scale.z);

            model.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                    if (child.material && child.material.metalness !== undefined) {
                        child.material.metalness = 0.5;
                    }
                }
            });
        };

        return new Promise((resolve, reject) => {
            const { gltfLoader, objLoader, fbxLoader } = loaders || {};

            if (effectiveExt === 'obj') {
                if (!objLoader) {
                    reject(new Error('OBJLoader is not available'));
                    return;
                }
                objLoader.load(modelPath, (obj) => {
                    applyModelStyleAndTransform(obj);
                    resolve(obj);
                }, undefined, (err) => {
                    console.error("OBJ Load Error. Path tried:", modelPath, err);
                    reject(err);
                });
                return;
            }

            if (effectiveExt === 'fbx') {
                if (!fbxLoader) {
                    reject(new Error('FBXLoader is not available'));
                    return;
                }
                fbxLoader.load(modelPath, (fbx) => {
                    applyModelStyleAndTransform(fbx);
                    resolve(fbx);
                }, undefined, (err) => {
                    console.error("FBX Load Error. Path tried:", modelPath, err);
                    reject(err);
                });
                return;
            }

            if (!gltfLoader) {
                reject(new Error('GLTFLoader is not available'));
                return;
            }

            gltfLoader.load(modelPath, (gltf) => {
                const model = gltf.scene;
                applyModelStyleAndTransform(model);
                resolve(model);
            }, undefined, (err) => {
                console.error("GLTF Load Error. Path tried:", modelPath, err);
                reject(err);
            });
        });
    }
}