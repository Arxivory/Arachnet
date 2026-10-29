import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { FpsController, MultiFloorWorld } from "../../core/rendering-engine";
import { createDemoFloorModel, createDemoLinkModel, DEMO_FLOORS } from "./demo-data";

function disposeObject(object) {
  if (!object) return;
  object.traverse((child) => {
    child.geometry?.dispose?.();
    if (Array.isArray(child.material)) child.material.forEach((material) => material.dispose());
    else child.material?.dispose?.();
  });
}

export default function InteractiveModeView({ devices, links = [], active = false }) {
  const canvasRef = useRef(null);
  const rendererRef = useRef(null);
  const worldRef = useRef(null);
  const controllerRef = useRef(null);
  const modelsRef = useRef([]);
  const linkModelRef = useRef(null);
  const devicesRef = useRef(devices);
  const linksRef = useRef(links);
  devicesRef.current = devices;
  linksRef.current = links;
  const [renderError, setRenderError] = useState("");
  const deviceGeometryKey = useMemo(() => JSON.stringify(devices.map((device) => ({
    id: device.id,
    kind: device.kind,
    floorId: device.floorId,
    position: device.transform?.position ?? device.position,
  }))), [devices]);
  const linkGeometryKey = useMemo(() => JSON.stringify(links.map((link) => ({
    id: link.id,
    status: link.status,
    routePoints: link.routePoints,
  }))), [links]);

  useEffect(() => {
    const canvas = canvasRef.current;
    let resizeObserver;
    let resize;
    try {
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
      renderer.setPixelRatio(window.devicePixelRatio || 1);
      renderer.setClearColor(0xe2e8f0);
      const scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight(0xffffff, 0x64748b, 2));
      const light = new THREE.DirectionalLight(0xffffff, 2);
      light.position.set(12, -8, 24);
      scene.add(light);

      const world = new MultiFloorWorld(renderer, { scene });
      world.setFloors(DEMO_FLOORS);
      world.camera.position.set(24, -25, 16);
      world.camera.lookAt(10, 6, 4);

      rendererRef.current = renderer;
      worldRef.current = world;
      controllerRef.current = new FpsController({ moveSpeed: 5 });
      resize = () => {
        const bounds = canvas.getBoundingClientRect();
        const width = Math.max(bounds.width || 900, 1);
        const height = Math.max(bounds.height || 560, 1);
        renderer.setSize(width, height, false);
        world.camera.aspect = width / height;
        world.camera.updateProjectionMatrix();
      };
      resize();
      resizeObserver = typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(resize);
      resizeObserver?.observe(canvas);
      window.addEventListener("resize", resize);
      setRenderError("");
    } catch (error) {
      rendererRef.current?.dispose();
      rendererRef.current = null;
      worldRef.current?.dispose();
      worldRef.current = null;
      setRenderError(error.message);
    }

    return () => {
      controllerRef.current?.stop();
      if (linkModelRef.current) worldRef.current?.scene.remove(linkModelRef.current);
      worldRef.current?.dispose();
      modelsRef.current.forEach(disposeObject);
      modelsRef.current = [];
      disposeObject(linkModelRef.current);
      linkModelRef.current = null;
      rendererRef.current?.dispose();
      rendererRef.current = null;
      worldRef.current = null;
      controllerRef.current = null;
      resizeObserver?.disconnect();
      if (resize) window.removeEventListener("resize", resize);
    };
  }, []);

  useEffect(() => {
    const world = worldRef.current;
    if (!world) return;
    try {
      const nextModels = DEMO_FLOORS.map((floor) =>
        createDemoFloorModel(floor.id, devicesRef.current)
      );
      nextModels.forEach((model, index) => {
        world.setFloorContent(DEMO_FLOORS[index].id, [model]);
      });
      modelsRef.current.forEach(disposeObject);
      modelsRef.current = nextModels;
      if (linkModelRef.current) world.scene.remove(linkModelRef.current);
      disposeObject(linkModelRef.current);
      linkModelRef.current = createDemoLinkModel(linksRef.current);
      world.addGlobalContent(linkModelRef.current);
      setRenderError("");
    } catch (error) {
      setRenderError(error.message);
    }
  }, [deviceGeometryKey, linkGeometryKey]);

  useEffect(() => {
    if (!active || !worldRef.current || !controllerRef.current) return undefined;
    const canvas = canvasRef.current;
    const world = worldRef.current;
    const controller = controllerRef.current;
    let frameId;
    try {
      controller.start(world.camera, canvas);
      const clock = new THREE.Clock();
      const animate = () => {
        frameId = window.requestAnimationFrame(animate);
        controller.update(Math.min(clock.getDelta(), 0.05));
        world.render();
      };
      animate();
    } catch (error) {
      controller.stop();
      setRenderError(error.message);
    }

    return () => {
      if (frameId) window.cancelAnimationFrame(frameId);
      controller.stop();
    };
  }, [active]);

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
