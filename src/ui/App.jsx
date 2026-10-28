import { useState } from "react";
import Topbar from "./Topbar";
import Toolbar from "./Toolbar/Toolbar";
import ObjectLibrary from "./ObjectLibrary";
import Workspace from "./Workspace/Workspace";
import HierarchyPanel from "./HierarchyPanel";
import PropertiesPanel from "./PropertiesPanel";
import ConsoleSimulationLogs from "./logs/ConsoleSimulationLogs";
import { ViewController } from "../core/rendering-engine";
import { DEMO_FLOORS } from "./Workspace/demo-data";

export default function App() {
  const [viewController] = useState(
    () => new ViewController({ floorId: DEMO_FLOORS[0].id })
  );

  return (
    <div className="app">
      <Topbar />
      <Toolbar viewController={viewController} />
      <div className="main-layout">
        <ObjectLibrary/>
        <div className="workspace-column">
          <Workspace viewController={viewController} />
          <ConsoleSimulationLogs />
        </div>
        <div className="right-panel">
          <HierarchyPanel />   
          <PropertiesPanel />
        </div>
      </div>
    </div>
  );
}