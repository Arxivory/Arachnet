import { useState, useRef, useEffect } from "react";
import PhysicalMode from "./PhysicalMode";
import { ModeSwitch } from "./ModeSwitch";
import LogicalMode from "./LogicalMode";
import PacketFlowOverlay from "./PacketFlowOverlay";
import LogicalCanvasController from "../../core/LogicalCanvasController";
import appState from "../../state/AppState";

export default function Workspace({ canvasControllerRef, networkManager }) {
  const [currentMode, setCurrentMode] = useState(appState.getCurrentMode());

  useEffect(() => {
    const unsubscribe = appState.subscribe(() => {
      setCurrentMode(appState.getCurrentMode());
    });
    
    return () => unsubscribe();
  }, []);

  return (
    <div className="workspace relative w-full h-full overflow-hidden flex flex-col">
      <div className="flex-grow relative">
        
        <div 
          className="absolute inset-0" 
          style={{ visibility: currentMode === "logical" ? "visible" : "hidden", pointerEvents: currentMode === "logical" ? "auto" : "none" }}
        >
          <LogicalMode canvasControllerRef={canvasControllerRef} />
        </div>
        
        <div 
          className="absolute inset-0"
          style={{ visibility: currentMode === "physical" ? "visible" : "hidden", pointerEvents: currentMode === "physical" ? "auto" : "none" }}
        >
          <PhysicalMode currentMode={currentMode} />
        </div>

        <PacketFlowOverlay canvasControllerRef={canvasControllerRef} networkManager={networkManager} />
      </div>

      <ModeSwitch currentMode={currentMode} onModeChange={(m) => appState.switchMode(m)} />
    </div>
  );
}
