import * as THREE from 'three';

let yaw = 0;
let pitch = 0;
const sensitivity = 0.0027;
const keys = { w: false, a: false, s: false, d: false, q: false, e: false };
let eventListeners = {};

export function initEditorControls(camera, domElement) {
    const mouseMoveHandler = (e) => {
        if (e.buttons === 2) { 
            yaw -= e.movementX * sensitivity;
            pitch -= e.movementY * sensitivity;

            const limit = Math.PI / 2 - 0.01;
            pitch = Math.max(-limit, Math.min(limit, pitch));

            camera.quaternion.setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
        }
    };

    const wheelHandler = (e) => {
        const zoomSpeed = 2.0;
        camera.fov = Math.max(1, Math.min(100, camera.fov + (e.deltaY * 0.05)));
        camera.updateProjectionMatrix();
    };

    const contextMenuHandler = (e) => e.preventDefault();

    const keyDownHandler = (e) => {
        const k = e.code.replace('Key', '').toLowerCase();
        if (k in keys) keys[k] = true;
    };

    const keyUpHandler = (e) => {
        const k = e.code.replace('Key', '').toLowerCase();
        if (k in keys) keys[k] = false;
    };

    domElement.addEventListener('mousemove', mouseMoveHandler);
    domElement.addEventListener('wheel', wheelHandler);
    domElement.addEventListener('contextmenu', contextMenuHandler);
    window.addEventListener('keydown', keyDownHandler);
    window.addEventListener('keyup', keyUpHandler);

    eventListeners = {
        mouseMoveHandler,
        wheelHandler,
        contextMenuHandler,
        keyDownHandler,
        keyUpHandler,
        domElement
    };
}

export function cleanupEditorControls() {
    if (!eventListeners.domElement) return;

    eventListeners.domElement.removeEventListener('mousemove', eventListeners.mouseMoveHandler);
    eventListeners.domElement.removeEventListener('wheel', eventListeners.wheelHandler);
    eventListeners.domElement.removeEventListener('contextmenu', eventListeners.contextMenuHandler);
    window.removeEventListener('keydown', eventListeners.keyDownHandler);
    window.removeEventListener('keyup', eventListeners.keyUpHandler);

    eventListeners = {};
}

export function updateEditorControls(camera, delta) {
    const moveSpeed = 55 * delta;
    const zoomSpeed = 30 * delta; 

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);

    if (keys.w) camera.position.addScaledVector(forward, moveSpeed);
    if (keys.s) camera.position.addScaledVector(forward, -moveSpeed);
    if (keys.a) camera.position.addScaledVector(right, -moveSpeed);
    if (keys.d) camera.position.addScaledVector(right, moveSpeed);

    if (keys.q) {
        camera.fov = Math.min(100, camera.fov + zoomSpeed);
        camera.updateProjectionMatrix();
    }
    if (keys.e) {
        camera.fov = Math.max(1, camera.fov - zoomSpeed);
        camera.updateProjectionMatrix();
    }
}