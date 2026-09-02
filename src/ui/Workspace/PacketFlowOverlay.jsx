import { useEffect, useRef, useState } from "react";

const MAX_FLOW_AGE = 2800;
const DOT_RADIUS = 5;
const FLOW_LINE_COLOR = "rgba(0, 200, 255, 0.45)";
const FLOW_DOT_COLOR = "#00d5ff";

function lerp(a, b, t) {
  return a + (b - a) * t;
}

export default function PacketFlowOverlay({ canvasControllerRef, networkManager }) {
  const [flows, setFlows] = useState([]);
  const rafRef = useRef(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const updateSize = () => {
      const canvas = canvasControllerRef?.current?.layout?.canvas;
      if (canvas) {
        setCanvasSize({ width: canvas.clientWidth, height: canvas.clientHeight });
      }
    };

    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, [canvasControllerRef]);

  useEffect(() => {
    if (!networkManager) return;

    const handleTransmission = (event) => {
      const srcDevice = event.srcDevice || event.device;
      const dstDevice = event.nextDevice || event.dstDevice;
      if (!srcDevice || !dstDevice) return;

      setFlows((prevFlows) => [
        ...prevFlows,
        {
          id: event.packetId || `${Date.now()}-${Math.random()}`,
          srcId: srcDevice.id,
          dstId: dstDevice.id,
          startTime: performance.now(),
          duration: Math.max(event.viaLink?.latencyMs || 300, 150),
          type: event.packet?.type || "ip",
          progress: 0,
        },
      ]);
    };

    networkManager.addEventListener("packetTransmissionScheduled", handleTransmission);
    return () => networkManager.removeEventListener("packetTransmissionScheduled", handleTransmission);
  }, [networkManager]);

  useEffect(() => {
    const animate = () => {
      const now = performance.now();
      setFlows((prev) => prev
        .map((flow) => {
          const elapsed = now - flow.startTime;
          return {
            ...flow,
            progress: Math.min(elapsed / flow.duration, 1),
          };
        })
        .filter((flow) => now - flow.startTime < MAX_FLOW_AGE)
      );
      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const getDevicePosition = (deviceId) => {
    const controller = canvasControllerRef?.current;
    if (!controller || typeof controller.getEntityScreenPosition !== "function") return null;
    return controller.getEntityScreenPosition(deviceId);
  };

  if (!networkManager || !canvasControllerRef?.current || canvasSize.width === 0 || canvasSize.height === 0) {
    return null;
  }

  return (
    <svg
      className="packet-flow-overlay"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 50,
      }}
      viewBox={`0 0 ${canvasSize.width} ${canvasSize.height}`}
    >
      {flows.map((flow) => {
        const src = getDevicePosition(flow.srcId);
        const dst = getDevicePosition(flow.dstId);
        if (!src || !dst) return null;

        const centerX = lerp(src.x, dst.x, flow.progress);
        const centerY = lerp(src.y, dst.y, flow.progress);
        const alpha = 1 - Math.min(flow.progress * 1.2, 0.85);
        const lineOpacity = 0.35 + alpha * 0.25;

        return (
          <g key={flow.id}>
            <line
              x1={src.x}
              y1={src.y}
              x2={dst.x}
              y2={dst.y}
              stroke={FLOW_LINE_COLOR}
              strokeWidth={2}
              opacity={lineOpacity}
            />
            <circle cx={centerX} cy={centerY} r={DOT_RADIUS} fill={FLOW_DOT_COLOR} opacity={0.95} />
          </g>
        );
      })}
    </svg>
  );
}
