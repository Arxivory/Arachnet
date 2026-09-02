import { Undo2, Redo2 } from "lucide-react"; // Add to existing lucide-react imports
import {
  Mountain, Building, Grid, RectangleHorizontal, House, DoorOpen,
  Square, Play, File, FilePlus, Save, MousePointer, Hand, ZoomIn, ZoomOut, Trash2, Copy, Cable
} from "lucide-react";
// import { useEffect, useState } from "react";
import { useCallback, useEffect, useState } from "react";
import appState from "../../state/AppState";
import {
  StartDrawRectangleCommand, StartDrawCircleCommand, StartDrawPolygonCommand, StartDrawFreeformCommand, StartDrawWallCommand,
  StartSelectCommand, StartPanCommand, StartZoomInCommand, StartZoomOutCommand, CancelDrawingCommand,
  StartDrawDoorCommand, StartDrawWindowCommand,
  StartDrawConduitCommand, StartDrawRiserCommand, StartDrawUndergroundConduitCommand
} from "../../core/editor/DrawingCommands";
import StructuralOption from "./StructuralOption";
import PathwayOption from "./PathwayOption";

export default function Toolbar({ canvasController, networkManager, networkRunning, setNetworkRunning }) {
  const [activeTool, setActiveTool] = useState("select");

  // 1. Update the state hooks
const [canUndo, setCanUndo] = useState(false);
const [canRedo, setCanRedo] = useState(false);

useEffect(() => {
  // 2. Subscribe directly to the global appState
  // Your AppState calls notifyListeners() whenever this.commands updates
  const unsubscribe = appState.subscribe((state) => {
    setCanUndo(state.canUndo()); // Uses the delegation methods in your AppState.js
    setCanRedo(state.canRedo());
  });

  // Set initial state
  setCanUndo(appState.canUndo());
  setCanRedo(appState.canRedo());

  return unsubscribe;
}, []);

// 3. Update the handler functions to use your AppState delegation
const handleUndo = () => {
  if (canvasController?.undo) {
    canvasController.undo();
  }
};

const handleRedo = () => {
  if (canvasController?.redo) {
    canvasController.redo();
  }
};

  useEffect(() => {
    const unsubscribe = appState.tools.subscribe(() => {
      setActiveTool(appState.tools.getActiveTool() || "select");
    });
    return unsubscribe;
  }, []);

  const executeCommand = (Command, ...args) => {
    if (!canvasController) return;
    const cmd = new Command(canvasController, appState, ...args);
    cmd.execute();
  };

  const isActive = (mode) => activeTool === mode;

// const handleDelete = () => {
const handleDelete = () => {
    if (!appState || !appState.selection) return;

    let ids = appState.selection.getSelectedDeviceIds();
    if (!ids || ids.length === 0) {
      const focused = appState.selection.getFocusedId();
      if (focused) ids = [focused];
    }

    if (ids && ids.length > 0) {
      // BEHAVIOR 1: Something is selected. Delete it instantly!
      if (canvasController && canvasController.executeDelete) {
          canvasController.executeDelete(ids[0]);
      }
    } else {
      // BEHAVIOR 2: Nothing is selected. Toggle "Delete Mode" on/off!
      if (appState.tools) {
          const isDeleteMode = appState.tools.activeTool === 'delete';
          
          if (isDeleteMode) {
              executeCommand(StartSelectCommand);
              appState.tools.setActiveTool('select');
          } else {
              executeCommand(StartSelectCommand); 
              appState.tools.setActiveTool('delete');
          }
      }
    }
  };


// Handler for duplication - will call the canvasController's duplicateSelection method if it exists
  const handleDuplicate = useCallback(() => {
    if (!canvasController?.duplicateSelection) return;
    return canvasController.duplicateSelection();
  }, [canvasController]);

  const handleSimulationToggle = () => {
    if (!networkManager) return;
    if (networkRunning) {
      networkManager.stop();
      setNetworkRunning(false);
    } else {
      networkManager.start();
      setNetworkRunning(true);
    }
  };

  useEffect(() => {
    const handleKeyDown = (event) => {
      const activeElement = document.activeElement;
      const isTyping =
        activeElement?.tagName === "INPUT" ||
        activeElement?.tagName === "TEXTAREA" ||
        activeElement?.isContentEditable;

      if (isTyping) return;

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d") {
        const duplicated = handleDuplicate();
        if (duplicated) {
          event.preventDefault();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleDuplicate]);

  // const handleStructuralShape = (structureType, shape) => {
  const handleStructuralShape = (structureType, shape) => {
    if (!canvasController) return;
    
    let Command;
    switch (shape) {
      case "Rectangle":
        Command = StartDrawRectangleCommand;
        break;
      case "Circular":
        Command = StartDrawCircleCommand;
        break;
      case "Polygon":
        Command = StartDrawPolygonCommand;
        break;
      default:
        Command = StartDrawRectangleCommand;
    }

    const cmd = new Command(canvasController, appState, structureType);
    cmd.execute();
    appState.tools.setActiveTool(structureType.toLowerCase());
  };

  const handlePathwayComponent = (component) => {
    if (!canvasController) return;

    let Command;
    switch (component) {
      case "Conduit":
        Command = StartDrawConduitCommand;
        break;
      case "Riser":
        Command = StartDrawRiserCommand;
        break;
      case "Underground Conduit":
        Command = StartDrawUndergroundConduitCommand;
        break;
      default:
        //Conduit for now
        Command = StartDrawConduitCommand;
    }

    const cmd = new Command(canvasController, appState);
    cmd.execute();
    appState.tools.setActiveTool(component.toLowerCase());
  }

  return (
    <div className="toolbar">
      <div className="toolbar-group">
        <div className="toolbar-row">
          <button className="toolbar-btn"><FilePlus size={16} /> New</button>
          <button className="toolbar-btn"><File size={16} /> Open</button>
          <button className="toolbar-btn"><Save size={16} /> Save</button>

          {/* INSERT IT HERE */}
          <div className="toolbar-v-separator" /> 
          <button 
  className="toolbar-btn-icon" 
  onClick={handleUndo}
  title="Undo (Ctrl+Z)"
>
  <Undo2 size={16} className={!canUndo ? "opacity-20" : ""} />
</button>

<button 
  className="toolbar-btn-icon" 
  onClick={handleRedo} 
  title="Redo (Ctrl+Y)"
>
  <Redo2 size={16} className={!canRedo ? "opacity-20" : ""} />
</button>
        </div>
        <span className="toolbar-label">Files</span>
      </div>

      <div className="toolbar-divider" />

      <div className="toolbar-group">
        <div className="toolbar-row">
          <button
            onClick={() => executeCommand(StartSelectCommand)}
            className={`toolbar-btn ${isActive("select") ? "active" : ""}`}
          >
            <MousePointer size={16} /> Select
          </button>
         <button 
            onClick={handleDelete} 
            className={`toolbar-btn ${isActive("delete") ? "active" : ""}`} 
            title="Delete Selected or Toggle Eraser"
          >
            <Trash2 size={16} /> Delete
          </button>
          <button
            onClick={handleDuplicate}
            className="toolbar-btn"
            title="Duplicate Selected (Ctrl+D)"
          >
            <Copy size={16} /> Duplicate
          </button>
          <button
            onClick={() => executeCommand(StartPanCommand)}
            className={`toolbar-btn ${isActive("pan") ? "active" : ""}`}
          >
            <Hand size={16} /> Pan
          </button>
          <button
            onClick={() => executeCommand(StartZoomInCommand)}
            className={`toolbar-btn ${isActive("zoom in") ? "active" : ""}`}>
            <ZoomIn size={16} />
          </button>
          <button
            onClick={() => executeCommand(StartZoomOutCommand)}
            className={`toolbar-btn ${isActive("zoom out") ? "active" : ""}`}>
            <ZoomOut size={16} />
          </button>
          
        </div>
        <span className="toolbar-label">Controls</span>
      </div>

      <div className="toolbar-divider" />

      <div className="toolbar-group">
        <div className="toolbar-row">
          <StructuralOption
            label="Domain" icon={Mountain} isActive={activeTool === "domain"}
            onSelectShape={(shape) => handleStructuralShape('Domain', shape)}
          />
          <StructuralOption
            label="Site" icon={Building} isActive={activeTool === "site"}
            onSelectShape={(shape) => handleStructuralShape('Site', shape)}
          />
          <StructuralOption
            label="Space" icon={Grid} isActive={activeTool === "space"}
            onSelectShape={(shape) => handleStructuralShape('Space', shape)}
          />
        </div>
        <span className="toolbar-label">Structure</span>
      </div>

      <div className="toolbar-divider" />

      <div className="toolbar-group">
        <div className="toolbar-row">
          <button
            onClick={() => executeCommand(StartDrawWallCommand)}
            className={`toolbar-btn ${isActive("wall") ? "active" : ""}`}
          >
            <RectangleHorizontal size={16} /> Wall
          </button>
          <button className="toolbar-btn"
            onClick={() => executeCommand(StartDrawDoorCommand)}
            className={`toolbar-btn ${isActive("door") ? "active" : ""}`}
          ><DoorOpen size={16}/> Door</button>
          <button className="toolbar-btn"
            onClick={() => executeCommand(StartDrawWindowCommand)}
            className={`toolbar-btn ${isActive("window") ? "active" : ""}`}
          ><Square size={16} /> Window</button>
          <PathwayOption
          label="Pathway" icon={Cable} isActive={activeTool === "pathway"}
          onSelectComponent={(component) => handlePathwayComponent(component)}
          ></PathwayOption>
        </div>
        <span className="toolbar-label">Fenestration</span>
      </div>

      <div className="toolbar-group ml-auto">
        <button className="simulate-btn" onClick={handleSimulationToggle}>
          <Play size={16} /> {networkRunning ? 'Stop' : 'Simulate'}
        </button>
        <span className="toolbar-label invisible">Simulate</span>
      </div>
    </div>
  );
}
