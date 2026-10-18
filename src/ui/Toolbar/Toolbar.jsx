import { Undo2, Redo2 } from "lucide-react";
import {Network, RefreshCw, File, FileDown, FilePlus, Save, MousePointer, Trash2, Copy,
Building, Play} from "lucide-react";

export default function Toolbar() {
  return (
    <div className="toolbar">
      <div className="toolbar-group">
        <div className="toolbar-row">
          <button className="toolbar-btn"><FilePlus size={16} /> New</button>
          <button className="toolbar-btn"><File size={16} /> Open</button>
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
            className="toolbar-btn"
          >
            <MousePointer size={16} /> Select
          </button>
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
          <button className="toolbar-btn">
            Logical
          </button>
          <button className="toolbar-btn">
            Physical
          </button>
          <button className="toolbar-btn">
            3D
          </button>
          <button className="toolbar-btn">
            Interactive
          </button>
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
