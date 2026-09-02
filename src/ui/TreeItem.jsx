import { useState, useEffect, useRef } from "react";
import appState from "../state/AppState"; 
import { Mountain, Grid, ChevronRight, ChevronDown, Building, Server, Box, Layers, CopyPlus, Wifi, Armchair } from "lucide-react";
import FloorSpecifier from "./FloorSpecifier";
import { ChangePropertyCommand } from "../core/editor/DrawingCommands";

const icons = {
  domain: Mountain,
  site: Building,
  floor: Box,
  space: Grid,
  rack: Server,
  device: Wifi,
  furniture: Armchair,
};

export default function TreeItem({ node }) {
  const [open, setOpen] = useState(true);
  const [isFocused, setIsFocused] = useState(appState.selection.isFocused(node.id));
  const [specifierOpen, setSpecifierOpen] = useState(false);
  const [floorSpecifierCount, setFloorSpecifierCount] = useState(0);

  // --- NEW: Rename State ---
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(node.label);
  const inputRef = useRef(null);

  useEffect(() => {
    const unsubscribe = appState.selection.subscribe((store) => {
      setIsFocused(store.isFocused(node.id));
    });
    return unsubscribe;
  }, [node.id]);

  // Focus the input automatically when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const Icon = icons[node.type] || Box;
  const hasChildren = node.children && node.children.length > 0;

  const handleRowClick = (e) => {
    // Prevent standard click if we are currently typing a new name
    if (isEditing) return; 

    appState.selection.focusedNode(node.id, node.type);

    if (node.type === "floor") {
          appState.ui.setActiveFloor(node.id);
        } else if (node.type === "site") {
          const floors = appState.structural.getFloorsBySite(node.id);
          if (floors && floors.length) {
            appState.ui.setActiveFloor(floors[0].id);
          } else {
            appState.ui.setActiveFloor(null);
          }
        } else if (node.type === "device" || node.type === "furniture") {
          if (node.floorId) {
            appState.ui.setActiveFloor(node.floorId);
          }
        } else {
          appState.ui.setActiveFloor(null);
        }
      };

      const toggleOpen = (e) => {
        e.stopPropagation(); 
        setOpen(!open);
      };

      // --- NEW: Rename Handlers ---
    // --- UPDATED: Rename Handlers ---
      const handleDoubleClick = (e) => {
        e.stopPropagation();
        // Allow renaming of structures AND devices/furniture
        if (['domain', 'site', 'floor', 'space', 'device', 'furniture'].includes(node.type)) {
          setIsEditing(true);
          setEditValue(node.label);
        }
      };

      const submitRename = () => {
          if (editValue.trim() !== "" && editValue !== node.label) {
            
            // --- NEW: Use the Time Machine! ---
            const command = new ChangePropertyCommand(
                appState, 
                node.id, 
                node.type, 
                'label', 
                node.label,   // Old Value
                editValue    // New Value
            );
            
            appState.pushCommand(command);
            command.execute();
            // ----------------------------------
            
          } else {
            // Guardrail: Snap back to original name if empty
            setEditValue(node.label); 
          }
          setIsEditing(false);
        };

      const handleKeyDown = (e) => {
        if (e.key === 'Enter') submitRename();
        if (e.key === 'Escape') {
          setIsEditing(false);
          setEditValue(node.label);
        }
      };

      return (
        <div className={`tree-item ${isFocused ? "focused" : ""}`}>
          <div 
            className={`tree-item-row ${isFocused ? "selected-bg" : ""}`} 
            onClick={handleRowClick}
          >
            <div className="tree-item-wrapper">
              <div className="chevron-label">
                <div className="chevron-wrapper" onClick={toggleOpen}>
                  {hasChildren ? (
                    open ? <ChevronDown size={14} className="tree-chevron" /> : <ChevronRight size={14} className="tree-chevron" />
                  ) : (
                    <span className="tree-spacer" />
                  )}
                </div>

                {Icon && <Icon size={14} className="tree-icon" />}
                
                {/* --- NEW: Render Input or Span based on editing state --- */}
                {isEditing ? (
                  <input
                    ref={inputRef}
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={submitRename}
                    onKeyDown={handleKeyDown}
                    onClick={(e) => e.stopPropagation()}
                    style={{ background: 'transparent', border: '1px solid #007bff', color: 'inherit', outline: 'none', marginLeft: '4px', width: '80%', padding: '0 2px' }}
                  />
                ) : (
                  <span className="item-label" onDoubleClick={handleDoubleClick}>{node.label}</span>
                )}
                
              </div>

              {node.type === 'site' && <CopyPlus size={12} onClick={() => setSpecifierOpen(!specifierOpen)}/>}
            </div>
            
          </div>

          {open && (
            <div className="tree-children">
              {hasChildren &&
                node.children.map((child) => (
                  <TreeItem key={child.id} node={child} />
                ))}
              {node.type === "site" && specifierOpen && (
                  <FloorSpecifier parentId={node.id} onCloseModal={() => { setSpecifierOpen(!specifierOpen); setFloorSpecifierCount(floorSpecifierCount + 1)}} floorCount={floorSpecifierCount} />
              )}
            </div>
          )}
        </div>
      );
    }