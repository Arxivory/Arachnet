import { Undo2, Redo2 } from "lucide-react";
import { useRef, useState } from "react";
import {
  Network,
  FileDown,
  Save,
  MousePointer,
  Hand,
  Trash2,
  Copy,
  Building,
  LayoutGrid,
  Map,
  Box,
  Compass,
  LoaderCircle,
  X,
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
  onImportBim = async () => ({}),
}) {
  const viewState = useViewState(viewController);
  const fileInputRef = useRef(null);
  const importControllerRef = useRef(null);
  const [importState, setImportState] = useState({ status: "idle", message: "" });

  async function handleImportSelection(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const controller = new AbortController();
    importControllerRef.current = controller;
    setImportState({ status: "processing", message: `Uploading ${file.name}...`, progress: 0 });
    try {
      const summary = await onImportBim(file, {
        signal: controller.signal,
        onJobUpdate: (job) => setImportState({
          status: "processing",
          message: `${job.stage} - ${job.progress}%`,
          progress: job.progress,
        }),
      });
      setImportState({
        status: "success",
        message: `Imported ${summary.floorCount} floors - ${summary.nodeCount} junctions - ${summary.edgeCount} conduits${
          summary.unassignedModelCount ? ` - ${summary.unassignedModelCount} unassigned models` : ""
        }`,
      });
    } catch (error) {
      setImportState({
        status: controller.signal.aborted ? "idle" : "error",
        message: controller.signal.aborted ? "Import canceled." : error.message,
      });
    } finally {
      if (importControllerRef.current === controller) importControllerRef.current = null;
    }
  }

  return (
    <div className="toolbar">
      <div className="toolbar-group">
        <div className="toolbar-row">
          <button
            className="toolbar-btn"
            type="button"
            disabled={importState.status === "processing"}
            onClick={() => fileInputRef.current?.click()}
          >
            {importState.status === "processing"
              ? <LoaderCircle className="bim-import-spinner" size={16} />
              : <Building size={16} />}
            Import BIM
          </button>
          <input
            ref={fileInputRef}
            className="bim-import-input"
            type="file"
            accept=".ifc"
            aria-label="Select IFC file"
            onChange={handleImportSelection}
          />
          {importState.status === "processing" && (
            <button
              className="toolbar-btn-icon"
              type="button"
              title="Cancel BIM import"
              aria-label="Cancel BIM import"
              onClick={() => importControllerRef.current?.abort()}
            >
              <X size={15} />
            </button>
          )}
          <button className="toolbar-btn"><FileDown size={16} />Export Layout</button>
          <button className="toolbar-btn"><Save size={16} /> Save</button>
        </div>
        {importState.message && (
          <span
            className={`bim-import-status${importState.status === "error" ? " error" : ""}`}
            role={importState.status === "error" ? "alert" : "status"}
            title={importState.message}
          >
            {importState.message}
          </span>
        )}
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
            <Network size={16} /> Route Cables
          </button>
        </div>
        <span className="toolbar-label">Network</span>
      </div>
    </div>
  );
}
