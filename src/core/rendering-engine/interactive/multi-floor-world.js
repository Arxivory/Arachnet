import * as THREE from "three";

export class MultiFloorWorld {
  constructor(renderer, { scene = new THREE.Scene(), camera = null } = {}) {
    if (!renderer?.render) throw new TypeError("MultiFloorWorld requires a Three.js renderer.");
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera ?? new THREE.PerspectiveCamera(75, 1, 0.1, 10000);
    this.camera.up.set(0, 0, 1);
    this.floorRoots = new Map();
  }

  setFloors(floors) {
    const floorIds = new Set(floors.map((floor) => floor.id));
    for (const [floorId, root] of this.floorRoots) {
      if (floorIds.has(floorId)) continue;
      this.scene.remove(root);
      this.floorRoots.delete(floorId);
    }
    for (const floor of floors) {
      if (!floor?.id) throw new TypeError("Every world floor requires an id.");
      if (!this.floorRoots.has(floor.id)) {
        const root = new THREE.Group();
        root.name = `floor:${floor.id}`;
        root.userData.floorId = floor.id;
        this.floorRoots.set(floor.id, root);
        this.scene.add(root);
      }
    }
  }

  setFloorContent(floorId, objects = []) {
    const root = this.floorRoots.get(floorId);
    if (!root) throw new Error(`Unknown world floor: ${floorId}`);
    root.clear();
    for (const object of objects) {
      if (!object?.isObject3D) throw new TypeError("World floor content must be Three.js Object3D instances.");
      root.add(object);
    }
  }

  addGlobalContent(object) {
    if (!object?.isObject3D) throw new TypeError("Global world content must be a Three.js Object3D.");
    this.scene.add(object);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    for (const root of this.floorRoots.values()) this.scene.remove(root);
    this.floorRoots.clear();
  }
}
