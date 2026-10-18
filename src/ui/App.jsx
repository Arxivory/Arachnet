import Topbar from "./Topbar";
import Toolbar from "./Toolbar/Toolbar";
import ObjectLibrary from "./ObjectLibrary";
import Workspace from "./Workspace/Workspace";
import HierarchyPanel from "./HierarchyPanel";
import PropertiesPanel from "./PropertiesPanel";
import ConsoleSimulationLogs from "./logs/ConsoleSimulationLogs";

export default function App() {

  return (
    <div className="app">
      <Topbar />
      <Toolbar/>

      <Workspace />
      <div className="main-layout">
        <ObjectLibrary/>
        <ConsoleSimulationLogs />
        <div className="right-panel">
          <HierarchyPanel />   
          <PropertiesPanel />
        </div>
      </div>
    </div>
  );
}