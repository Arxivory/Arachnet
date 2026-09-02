import { useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import LogicalCanvasController from "../../core/LogicalCanvasController";
import appState from "../../state/AppState";
import { showErrorModal } from "../../util/ErrorHandling"; 

const LogicalMode = forwardRef(function LogicalMode(
  { className = "", style = {}, gridSize = 24, snap = true, canvasControllerRef },
  ref
) {
  const containerRef = useRef(null);
  const controllerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    controllerRef.current = new LogicalCanvasController(container, {
      width: Math.max(rect.width, 1),
      height: Math.max(rect.height, 1),
      gridSize,
      snap
    });

    if (canvasControllerRef) {
      canvasControllerRef.current = controllerRef.current;
    }

    const handleResize = () => {
      if (!controllerRef.current || !container) return;
      const r = container.getBoundingClientRect();
      controllerRef.current.setSize(Math.max(r.width, 1), Math.max(r.height, 1));
    };

    const ro = new ResizeObserver(handleResize);
    ro.observe(container);

    return () => {
      ro.disconnect();
      controllerRef.current?.destroy();
      controllerRef.current = null;
    };
  }, [gridSize, snap, canvasControllerRef]);

  useEffect(() => {
    const handleUpdate = () => {
      if (!controllerRef.current) return;

      const isFocusedOnFloor = appState.selection.focusedType === 'floor';
      const nextFloorId = isFocusedOnFloor ? appState.selection.focusedId : null;

      const currentFloorId = appState.ui.activeFloorId;

      if (currentFloorId === nextFloorId) return;

      appState.ui.setActiveFloor(nextFloorId);
    };

    const unsubSel = appState.selection.subscribe(() => {
      handleUpdate();
    });

    return () => {
      unsubSel();
    };
  }, []);

 useImperativeHandle(ref, () => ({
    startDrawRectangle: (type) => {
      const currentFocusType = appState.selection.focusedType;

      if (type === 'site' && currentFocusType !== 'domain') {
        showErrorModal("You must select a Domain from the Hierarchy panel first before drawing a Site.", "Invalid Hierarchy");
        return; 
      }
      if (type === 'floor' && currentFocusType !== 'site') {
        showErrorModal("You must select a Site from the Hierarchy panel first before drawing a Floor.", "Invalid Hierarchy");
        return;
      }
      if (type === 'space' && currentFocusType !== 'floor') {
        showErrorModal("You must select a Floor from the Hierarchy panel first before drawing a Space.", "Invalid Hierarchy");
        return;
      }

      controllerRef.current?.startDrawRectangle(type);
    },

    startDrawPolygon: (type) => {
      const currentFocusType = appState.selection.focusedType;

      if (type === 'site' && currentFocusType !== 'domain') {
        showErrorModal("You must select a Domain from the Hierarchy panel first before drawing a Site.", "Invalid Hierarchy");
        return;
      }
      if (type === 'floor' && currentFocusType !== 'site') {
        showErrorModal("You must select a Site from the Hierarchy panel first before drawing a Floor.", "Invalid Hierarchy");
        return;
      }
      if (type === 'space' && currentFocusType !== 'floor') {
        showErrorModal("You must select a Floor from the Hierarchy panel first before drawing a Space.", "Invalid Hierarchy");
        return;
      }

      controllerRef.current?.startDrawPolygon(type);
    },

    startDrawCircle: (type) => controllerRef.current?.startDrawCircle(type),
    startDrawWall: () => controllerRef.current?.startDrawWall(),
    startDrawCable: () => controllerRef.current?.startDrawCable(),
    cancelDrawing: () => controllerRef.current?.cancelDrawing(),
    addDevice: (data, x, y) => controllerRef.current?.addDevice(data, x, y),
    enableSnap: (v) => controllerRef.current?.enableSnap(v),
    setGridSize: (n) => controllerRef.current?.setGridSize(n),
    clear: () => controllerRef.current?.clear(),
    getSnappedCoords: (x, y) => controllerRef.current?.getSnappedCoords(x, y),
  }));
  const onDragOver = (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  };

const onDrop = (event) => {
  event.preventDefault();

  const dataString = event.dataTransfer.getData("application/reactflow");
  if (!dataString) return;

  try {
    const data = JSON.parse(dataString);
    console.log('Dropped data:', data);

    const currentFocusType = appState.selection.focusedType;

    // --- 1. LOGICAL CHECK (Hierarchy) ---
    if (currentFocusType !== 'floor' && currentFocusType !== 'space') {
      showErrorModal(
        `You cannot place a ${data.entityType || 'device'} here.\nPlease select a Floor or Space from the Hierarchy Panel first.`, 
        "Placement Error"
      );
      return; // Stop immediately
    }

    const coords = controllerRef.current?.getSnappedCoords(event.clientX, event.clientY);

    if (coords && controllerRef.current) {
      // --- 2. PHYSICAL CHECK (Bounds) ---
      if (typeof controllerRef.current.validateDropLocation === 'function') {
        const isInside = controllerRef.current.validateDropLocation(coords.x, coords.y);
        
        if (!isInside) {
          // Capitalize the word (e.g. 'floor' -> 'Floor') for a prettier error
          const typeName = currentFocusType.charAt(0).toUpperCase() + currentFocusType.slice(1);
          
          showErrorModal(
            `You dropped the item outside the physical boundaries of the selected ${typeName}. Please drop it inside the shape.`, 
            "Out of Bounds"
          );
          return; // Stop the drop process immediately!
        }
      }

      // --- 3. FINAL PLACEMENT ---
      // If it passes both checks, we finally add it to the canvas
      if (data.entityType === "furniture") {
        controllerRef.current.addFurniture(data, coords.x, coords.y);
      } else {
        console.log('Data from LogicalMode.jsx: ', data)
        controllerRef.current.addDevice(data, coords.x, coords.y);
      }
    }
  } catch (err) {
    console.error("Error dropping device:", err);
  }
};

  return (
    <div
      ref={containerRef}
      className={("logical-mode-container " + className).trim()}
      style={style}
      onDragOver={onDragOver}
      onDrop={onDrop}
    />
  );
});

export default LogicalMode;