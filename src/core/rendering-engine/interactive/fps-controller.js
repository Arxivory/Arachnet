import * as THREE from "three";

export class FpsController {
  constructor({ moveSpeed = 4, lookSensitivity = 0.002, collisionBounds = [] } = {}) {
    if (!Number.isFinite(moveSpeed) || moveSpeed <= 0) {
      throw new TypeError("FPS move speed must be positive.");
    }
    this.moveSpeed = moveSpeed;
    this.lookSensitivity = lookSensitivity;
    this.collisionBounds = [...collisionBounds];
    this.keys = new Set();
    this.yaw = 0;
    this.pitch = 0;
    this.camera = null;
    this.element = null;
    this.started = false;
    this.onKeyDown = (event) => this.keys.add(event.code);
    this.onKeyUp = (event) => this.keys.delete(event.code);
    this.onMouseMove = (event) => {
      if (this.element?.ownerDocument?.pointerLockElement !== this.element) return;
      this.yaw -= event.movementX * this.lookSensitivity;
      this.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(
        Math.PI / 2 - 0.01,
        this.pitch - event.movementY * this.lookSensitivity
      ));
      this.updateCameraDirection();
    };
    this.requestPointerLock = () => this.element?.requestPointerLock?.();
  }

  start(camera, element) {
    if (!camera || !element) throw new TypeError("FPS control requires a camera and input element.");
    this.stop();
    this.camera = camera;
    this.element = element;
    camera.up.set(0, 0, 1);
    const direction = camera.getWorldDirection(new THREE.Vector3());
    this.yaw = Math.atan2(direction.y, direction.x);
    this.pitch = Math.asin(Math.max(-1, Math.min(1, direction.z)));
    element.addEventListener("click", this.requestPointerLock);
    element.ownerDocument?.addEventListener("mousemove", this.onMouseMove);
    element.ownerDocument?.defaultView?.addEventListener("keydown", this.onKeyDown);
    element.ownerDocument?.defaultView?.addEventListener("keyup", this.onKeyUp);
    this.started = true;
  }

  update(deltaSeconds) {
    if (!this.started || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
    const forwardX = Math.cos(this.yaw);
    const forwardY = Math.sin(this.yaw);
    const rightX = -forwardY;
    const rightY = forwardX;
    let dx = 0;
    let dy = 0;
    let dz = 0;
    if (this.keys.has("KeyW")) { dx += forwardX; dy += forwardY; }
    if (this.keys.has("KeyS")) { dx -= forwardX; dy -= forwardY; }
    if (this.keys.has("KeyD")) { dx += rightX; dy += rightY; }
    if (this.keys.has("KeyA")) { dx -= rightX; dy -= rightY; }
    if (this.keys.has("Space")) dz += 1;
    if (this.keys.has("ShiftLeft") || this.keys.has("ShiftRight")) dz -= 1;
    const length = Math.hypot(dx, dy, dz);
    if (!length) return;
    const scale = this.moveSpeed * deltaSeconds / length;
    const candidate = [
      this.camera.position.x + dx * scale,
      this.camera.position.y + dy * scale,
      this.camera.position.z + dz * scale,
    ];
    if (!this.collides(candidate)) this.camera.position.set(...candidate);
  }

  setCollisionBounds(bounds) {
    this.collisionBounds = [...bounds];
  }

  collides([x, y, z]) {
    return this.collisionBounds.some((box) =>
      x >= box.min[0] && x <= box.max[0] &&
      y >= box.min[1] && y <= box.max[1] &&
      z >= box.min[2] && z <= box.max[2]
    );
  }

  updateCameraDirection() {
    const direction = {
      x: Math.cos(this.yaw) * Math.cos(this.pitch),
      y: Math.sin(this.yaw) * Math.cos(this.pitch),
      z: Math.sin(this.pitch),
    };
    this.camera.lookAt(
      this.camera.position.x + direction.x,
      this.camera.position.y + direction.y,
      this.camera.position.z + direction.z
    );
  }

  stop() {
    if (this.element) {
      this.element.removeEventListener("click", this.requestPointerLock);
      this.element.ownerDocument?.removeEventListener("mousemove", this.onMouseMove);
      this.element.ownerDocument?.defaultView?.removeEventListener("keydown", this.onKeyDown);
      this.element.ownerDocument?.defaultView?.removeEventListener("keyup", this.onKeyUp);
      if (this.element.ownerDocument?.pointerLockElement === this.element) {
        this.element.ownerDocument.exitPointerLock?.();
      }
    }
    this.keys.clear();
    this.camera = null;
    this.element = null;
    this.started = false;
  }
}
