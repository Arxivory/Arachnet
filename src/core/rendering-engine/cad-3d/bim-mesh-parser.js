import * as THREE from "three";

export class BimMeshParser {
  constructor({ loaders = {} } = {}) {
    this.loaders = new Map(Object.entries(loaders).map(([format, loader]) => [format.toLowerCase(), loader]));
  }

  registerLoader(format, loader) {
    if (!format || typeof loader !== "function") {
      throw new TypeError("A BIM loader requires a format name and loader function.");
    }
    this.loaders.set(format.toLowerCase(), loader);
    return () => this.loaders.delete(format.toLowerCase());
  }

  async parse(file, format) {
    if (!format) throw new TypeError("A BIM file format must be specified.");
    const loader = this.loaders.get(format.toLowerCase());
    if (!loader) throw new Error(`No BIM/CAD parser is registered for format "${format}".`);
    const result = await loader(file);
    const object3D = result?.isObject3D ? result : result?.scene;
    if (!object3D?.isObject3D) {
      throw new TypeError(`The "${format}" parser did not return a Three.js Object3D or scene.`);
    }
    object3D.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(object3D);
    return {
      format: format.toLowerCase(),
      object3D,
      bounds: {
        min: box.min.toArray(),
        max: box.max.toArray(),
      },
    };
  }
}
