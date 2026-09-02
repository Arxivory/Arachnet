let renderer, scene, camera;

export function setRendererContext(ctx) {
    renderer = ctx.renderer;
    scene = ctx.scene;
    camera = ctx.camera;
}

export function getScene() {
    if (!scene) throw new Error("Scene not initialized");
    return scene;
}

export function getCamera() {
    if (!camera) throw new Error("Camera not initialized");
    return camera;
}

export function getRenderer() {
    if (!renderer) throw new Error("Renderer not initialized");
    return renderer;
}

export function clearRendererContext() {
    renderer = null;
    scene = null;
    camera = null;
}