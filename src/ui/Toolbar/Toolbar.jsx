import { Undo2, Redo2 } from "lucide-react";
import {
  Network,
  RefreshCw,
  File,
  FileDown,
  FilePlus,
  Save,
  MousePointer,
  Hand,
  Trash2,
  Copy,
  Building,
  Play,
  LayoutGrid,
  Map,
  Box,
  Compass,
} from "lucide-react";
import { VIEW_MODES } from "../../core/rendering-engine";
import { useViewState } from "../Workspace/useViewState";

const MODES = [
  { id: VIEW_MODES.LOGICAL, label: "Logical", Icon: LayoutGrid },
  { id: VIEW_MODES.PHYSICAL, label: "Physical", Icon: Map },
  { id: VIEW_MODES.CAD, label: "3D", Icon: Box },
  { id: VIEW_MODES.INTERACTIVE, label: "Interactive", Icon: Compass },
];

export default function Toolbar({
  viewController,
  interactionMode = "select",
  onInteractionModeChange = () => {},
}) {
  const viewState = useViewState(viewController);

  return (
    <div className="toolbar">
      <div className="toolbar-group">
        <div className="toolbar-row">
          <button className="toolbar-btn"><Building size={16} />Import BIM</button>
          <button className="toolbar-btn"><FileDown size={16} />Export Layout</button>
          <button className="toolbar-btn"><Save size={16} /> Save</button>
        </div>
        <span className="toolbar-label">Files</span>
      </div>

      <div className="toolbar-divider" />

      <div className="toolbar-group">
        <div className="toolbar-row">
          <button 
              className="toolbar-btn-icon"
              title="Undo (Ctrl+Z)"
            >
              <Undo2 size={16} />
            </button>

            <button 
              className="toolbar-btn-icon"
              title="Redo (Ctrl+Y)"
            >
              <Redo2 size={16} />
            </button>
          <button
            className={`toolbar-btn${interactionMode === "select" ? " active" : ""}`}
            type="button"
            aria-pressed={interactionMode === "select"}
            onClick={() => onInteractionModeChange("select")}
          >
            <MousePointer size={16} /> Select
          </button>
          {(viewState.mode === VIEW_MODES.LOGICAL || viewState.mode === VIEW_MODES.PHYSICAL) && (
            <button
              className={`toolbar-btn${interactionMode === "pan" ? " active" : ""}`}
              type="button"
              aria-pressed={interactionMode === "pan"}
              onClick={() => onInteractionModeChange("pan")}
            >
              <Hand size={16} /> Pan
            </button>
          )}
         <button 
            className="toolbar-btn"
            title="Delete Selected or Toggle Eraser"
          >
            <Trash2 size={16} /> Delete
          </button>
          <button
            className="toolbar-btn"
            title="Duplicate Selected (Ctrl+D)"
          >
            <Copy size={16} /> Duplicate
          </button>
          
        </div>
        <span className="toolbar-label">Controls</span>
      </div>

      <div className="toolbar-divider" />

      <div className="toolbar-group">
        <div className="toolbar-row">
          {MODES.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              className={`toolbar-btn${viewState.mode === id ? " active" : ""}`}
              aria-pressed={viewState.mode === id}
              onClick={() => viewController.setMode(id)}
            >
              <Icon size={15} />{label}
            </button>
          ))}
        </div>
        <span className="toolbar-label">Modes</span>
      </div>

      <div className="toolbar-divider" />

      <div className="toolbar-group ml-auto">
        <div className="toolbar-row">
          <button className="simulate-btn">
            <Network size={16} /> Generate Topology
          </button>
          <button className="simulate-btn">
            <RefreshCw size={16} /> Sync Twin
          </button>
          <button className="simulate-btn">
            <Play size={16} /> Simulate
          </button>
        </div>
        <span className="toolbar-label">Network</span>
      </div>
    </div>
  );
}
