import { useRef, useState } from "react";

export default function usePanInteraction(interactionMode) {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const pointerStart = useRef(null);

  function onPointerDown(event) {
    if (interactionMode !== "pan" || (event.button != null && event.button !== 0)) return;
    event.preventDefault();
    pointerStart.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      offsetX: offset.x,
      offsetY: offset.y,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setIsPanning(true);
  }

  function onPointerMove(event) {
    const start = pointerStart.current;
    if (!start || start.pointerId !== event.pointerId) return;
    setOffset({
      x: start.offsetX + event.clientX - start.x,
      y: start.offsetY + event.clientY - start.y,
    });
  }

  function stopPanning(event) {
    if (!pointerStart.current || pointerStart.current.pointerId !== event.pointerId) return;
    pointerStart.current = null;
    setIsPanning(false);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  return {
    offset,
    isPanning,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: stopPanning,
      onPointerCancel: stopPanning,
    },
  };
}
