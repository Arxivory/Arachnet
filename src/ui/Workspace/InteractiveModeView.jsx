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

export default function InteractiveModeView({
  devices,
  links = [],
  floors = DEMO_FLOORS,
  importedModels = [],
  active = false,
}) {
  const canvasRef = useRef(null);
  const rendererRef = useRef(null);
  const worldRef = useRef(null);
  const controllerRef = useRef(null);
  const modelsRef = useRef([]);
  const linkModelRef = useRef(null);
  const framedImportKeyRef = useRef("");
  const devicesRef = useRef(devices);
  const linksRef = useRef(links);
  const floorsRef = useRef(floors);
  const importedModelsRef = useRef(importedModels);
  devicesRef.current = devices;
  linksRef.current = links;
  floorsRef.current = floors;
  importedModelsRef.current = importedModels;
  const floorGeometryKey = useMemo(() => JSON.stringify(
    floors.map(({ id, zMin, zMax }) => ({ id, zMin, zMax }))
  ), [floors]);
  const importedGeometryKey = useMemo(() => JSON.stringify(
    importedModels.map(({ id, floorId }) => ({ id, floorId }))
  ), [importedModels]);
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
      world.setFloors(floorsRef.current);
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
      const currentFloors = floorsRef.current;
      const currentImportedModels = importedModelsRef.current;
      world.setFloors(currentFloors);
      const nextModels = currentFloors.map((floor) =>
        createDemoFloorModel(floor.id, devicesRef.current, [], currentFloors)
      );
      nextModels.forEach((model, index) => {
        const floorId = currentFloors[index].id;
        const content = new THREE.Group();
        for (const importedModel of currentImportedModels.filter((item) => item.floorId === floorId)) {
          content.add(importedModel.object3D.clone(true));
        }
        content.add(model);
        world.setFloorContent(floorId, [content]);
      });
      if (importedGeometryKey && framedImportKeyRef.current !== importedGeometryKey) {
        const bounds = new THREE.Box3().setFromObject(world.scene);
        if (!bounds.isEmpty()) {
          const center = bounds.getCenter(new THREE.Vector3());
          const size = bounds.getSize(new THREE.Vector3());
          const distance = Math.max(size.x, size.y, size.z, 10);
          world.camera.position.copy(center).add(
            new THREE.Vector3(distance, -distance, distance * 0.75)
          );
          world.camera.lookAt(center);
        }
        framedImportKeyRef.current = importedGeometryKey;
      }
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
  }, [deviceGeometryKey, floorGeometryKey, importedGeometryKey, linkGeometryKey]);

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
