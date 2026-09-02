import * as THREE from 'three';

export default class FurnitureMesh {
    constructor(opts={}, defaultScaler) {
        this.id = opts.id;
        this.type = opts.type;
        this.scaler = defaultScaler;

        this.transform = {
            position: opts.transform.position || { x: 0, y: 0, z: 0 },
            rotation: opts.transform.rotation || { x: 0, y: 0, z: 1 },
            scale: opts.transform.scale || { x: 1, y: 1, z: 1 }
        }

        console.log('Opts for FurnitureMesh:', opts);
    }

    getMesh(gltfLoader, furnitureCatalog) {
        const cId = this.type;
        const catalogEntry = furnitureCatalog[cId];

        if (!catalogEntry) throw Error("Furniture Type is not found.");

        let modelPath = catalogEntry.model3D;
        if (modelPath.endsWith('.obj')) {
            console.warn(`Redirecting ${modelPath} to .glb for GLTFLoader`);
            modelPath = modelPath.replace('.obj', '.glb');
        }

        return new Promise((resolve, reject) => {
            gltfLoader.load(modelPath, (gltf) => {
                const model = gltf.scene;

                // Position, Rotation, and Scale are now inherited directly from the Store's physical transform
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
                        if (child.material) {
                            child.material.metalness = 0.5;
                        }
                    }
                });

                console.log(`Successfully loaded ${cId} from: ${modelPath}`);
                resolve(model);
            }, undefined, (err) => {
                console.error("GLB Load Error. Path tried:", modelPath, err);
                reject(err);
            });
        });
    }
}