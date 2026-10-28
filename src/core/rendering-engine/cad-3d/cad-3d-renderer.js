import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";

export class Cad3DRenderer {
  constructor(canvas, { background = 0xf1f5f9 } = {}) {
    if (!canvas) throw new TypeError("Cad3DRenderer requires a canvas element.");
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(background);
    this.camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.01, 100000);
    this.camera.up.set(0, 0, 1);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = false;
    this.controls.enablePan = true;
    this.controls.screenSpacePanning = true;
    this.controls.minZoom = 0.1;
    this.controls.maxZoom = 20;
    this.controls.addEventListener("change", () => this.render());
    this.floorRoot = new THREE.Group();
    this.scene.add(this.floorRoot);
    this.floorId = null;
    this.target = new THREE.Vector3();
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.5));
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x64748b, 1));
    this.resizeObserver = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(() => this.resize());
    this.resizeObserver?.observe(canvas);
    this.resize();
  }

  setFloor(floorId, models = []) {
    if (floorId === null || floorId === undefined) throw new TypeError("CAD mode requires a floor id.");
    this.floorRoot.clear();
    this.floorId = floorId;
    for (const model of models) {
      if (model.floorId !== floorId) continue;
      if (!model.object3D?.isObject3D) {
        throw new TypeError(`CAD model ${model.id ?? "(unknown)"} has no Three.js Object3D.`);
      }
      this.floorRoot.add(model.object3D);
    }
    this.frameFloor();
  }

  frameFloor() {
    const bounds = new THREE.Box3().setFromObject(this.floorRoot);
    if (bounds.isEmpty()) return;
    const size = bounds.getSize(new THREE.Vector3());
    this.target.copy(bounds.getCenter(new THREE.Vector3()));
    const halfHeight = Math.max(size.x / 2, size.y / 2, size.z / 2, 1) * 1.15;
    const aspect = this.canvas.clientWidth / Math.max(this.canvas.clientHeight, 1);
    this.camera.left = -halfHeight * aspect;
    this.camera.right = halfHeight * aspect;
    this.camera.top = halfHeight;
    this.camera.bottom = -halfHeight;
    this.camera.near = 0.01;
    this.camera.far = Math.max(size.length() * 4, 1000);
    this.camera.position.copy(this.target).add(new THREE.Vector3(1, -1, 1).normalize().multiplyScalar(halfHeight * 4));
    this.camera.up.set(0, 0, 1);
    this.controls.target.copy(this.target);
    this.controls.update();
    this.camera.updateProjectionMatrix();
    this.render();
  }

  resize() {
    const width = Math.max(this.canvas.clientWidth, 1);
    const height = Math.max(this.canvas.clientHeight, 1);
    this.renderer.setSize(width, height, false);
    const aspect = width / height;
    const halfHeight = Math.max(Math.abs(this.camera.top), 1);
    this.camera.left = -halfHeight * aspect;
    this.camera.right = halfHeight * aspect;
    this.camera.updateProjectionMatrix();
    this.render();
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.resizeObserver?.disconnect();
    this.controls.dispose();
    this.renderer.dispose();
  }
}
