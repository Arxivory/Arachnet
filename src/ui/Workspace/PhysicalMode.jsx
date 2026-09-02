import { useEffect, useRef } from "react";
import { initRenderer } from "../../core/rendering/Renderer";
import { startRenderLoop } from "../../core/rendering/RenderLoop";
import { PhysicalController } from "../../core/PhysicalController";
import TransformMode from "./TransformMode";

export default function PhysicalMode({ currentMode }) {
  const canvasRef = useRef(null);
  const rendererCtxRef = useRef(null);
  const controllerRef = useRef(null);
  const transformModeRef = useRef('translate');

  useEffect(() => {
    if (canvasRef.current && !rendererCtxRef.current) {
      rendererCtxRef.current = initRenderer(canvasRef.current);
      controllerRef.current = new PhysicalController(rendererCtxRef.current.scene);
      startRenderLoop();
    }
  }, []);

  useEffect(() => {
    if (currentMode === "physical" && rendererCtxRef.current) {
      const canvas = canvasRef.current;
      const { renderer, camera } = rendererCtxRef.current;
      renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
      camera.aspect = canvas.clientWidth / canvas.clientHeight;
      camera.updateProjectionMatrix();

      controllerRef.current?.syncWithState();
      
      console.log("Physical Mode Active: Meshes synced and Renderer resized.");
    }
  }, [currentMode]);

  return (
    <>
      <canvas ref={canvasRef} className="w-full h-full block" />
      <TransformMode controllerRef={controllerRef} mode={transformModeRef}/>
    </>
  );
}