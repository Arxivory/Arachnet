import { updateEditorControls, cleanupEditorControls } from "./Controls";
import { moveGridandGroundToCamera, moveSkyboxToCamera, cleanupWorld } from "./DefaultScene";
import { getScene, getRenderer, getCamera, clearRendererContext } from "./SceneAccess";
import * as THREE from 'three';

let animationId;
let isRenderLoopRunning = false;

const clock = new THREE.Clock();

export function startRenderLoop() {
    if (isRenderLoopRunning) return;
    isRenderLoopRunning = true;
    
    function render() {
        const delta = clock.getDelta();
        animationId = requestAnimationFrame(render);
        updateEditorControls(getCamera(), delta);
        getRenderer().render(getScene(), getCamera());
        moveSkyboxToCamera(getCamera().position);
        moveGridandGroundToCamera(getCamera().position);
    }

    render();
}

export function stopRenderLoop() {
    if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }

    isRenderLoopRunning = false;

    try {
        const renderer = getRenderer();
        const scene = getScene();

        scene.traverse((object) => {
            if (object.geometry) {
                object.geometry.dispose();
            }
            if (object.material) {
                if (Array.isArray(object.material)) {
                    object.material.forEach(mat => mat.dispose());
                } else {
                    object.material.dispose();
                }
            }
        });

        scene.background?.dispose();
        scene.environment?.dispose();

        renderer.clear();
        renderer.dispose();
    } catch (e) {
        console.warn('Error during render loop cleanup:', e);
    }

    cleanupEditorControls();
    cleanupWorld();
    clearRendererContext();
}