import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { FpsController, MultiFloorWorld } from "../../core/rendering-engine";
import { createDemoFloorModel, DEMO_FLOORS } from "./demo-data";

function disposeObject(object) {
  object.traverse((child) => {
    child.geometry?.dispose?.();
    if (Array.isArray(child.material)) child.material.forEach((material) => material.dispose());
    else child.material?.dispose?.();
  });
}

export default function InteractiveModeView() {
  const canvasRef = useRef(null);
  const [renderError, setRenderError] = useState("");

  useEffect(() => {
    const canvas = canvasRef.current;
    let renderer;
    let world;
    let controller;
    let frameId;
    let resize;
    const models = [];
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
      renderer.setPixelRatio(window.devicePixelRatio || 1);
      renderer.setClearColor(0xe2e8f0);
      const scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight(0xffffff, 0x64748b, 2));
      const light = new THREE.DirectionalLight(0xffffff, 2);
      light.position.set(12, -8, 24);
      scene.add(light);
      world = new MultiFloorWorld(renderer, { scene });
      world.setFloors(DEMO_FLOORS);
      for (const floor of DEMO_FLOORS) {
        const model = createDemoFloorModel(floor.id);
        models.push(model);
        world.setFloorContent(floor.id, [model]);
      }

      world.camera.position.set(24, -25, 16);
      world.camera.lookAt(10, 6, 4);
      controller = new FpsController({ moveSpeed: 5 });
      controller.start(world.camera, canvas);
      resize = () => {
        const bounds = canvas.getBoundingClientRect();
        const width = Math.max(bounds.width || 900, 1);
        const height = Math.max(bounds.height || 560, 1);
        renderer.setSize(width, height, false);
        world.camera.aspect = width / height;
        world.camera.updateProjectionMatrix();
      };
      resize();
      const clock = new THREE.Clock();
      const animate = () => {
        frameId = window.requestAnimationFrame(animate);
        controller.update(Math.min(clock.getDelta(), 0.05));
        world.render();
      };
      animate();
      window.addEventListener("resize", resize);
      setRenderError("");
    } catch (error) {
      renderer?.dispose();
      setRenderError(error.message);
    }

    return () => {
      if (frameId) window.cancelAnimationFrame(frameId);
      if (resize) window.removeEventListener("resize", resize);
      controller?.stop();
      world?.dispose();
      models.forEach(disposeObject);
      renderer?.dispose();
    };
  }, []);

  return (
    <div className="render-surface interactive-surface">
      <canvas
        ref={canvasRef}
        className="render-canvas"
        aria-label="Interactive multi-floor building view"
        title="Click to capture the pointer. Move with W, A, S, D; use Space and Shift to change height."
      />
      {renderError && <p className="render-error" role="status">Interactive 3D unavailable: {renderError}</p>}
    </div>
  );
}
