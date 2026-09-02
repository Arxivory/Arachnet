import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  Server,
  Router,
  Cable,
  Wifi,
  Armchair,
  Import,
  MonitorSmartphone,
  HardDriveDownload,
  X
} from "lucide-react";
import appState from "../state/AppState";
import { StartDrawCableCommand } from "../core/editor/DrawingCommands";
import deviceCatalog, { registerImportedDevice } from "../data/deviceCatalog";

// 1. DATA SOURCES
import furnitureCatalog from "../data/furnitureCatalog";
import { showErrorModal } from "../util/ErrorHandling";

// 2. ICON MAPPING FOR DYNAMIC ICONS
const ICON_MAP = {
  router: Router,
  switch: Server,
  wifi: Wifi,
  ap: Wifi,
  wireless: Wifi,
  host: MonitorSmartphone,
  pc: MonitorSmartphone,
  laptop: MonitorSmartphone,
  server: Server,
  cable: Cable,
  furniture: Armchair,
  chair: Armchair,
  table: Armchair,
};

const categoryDetails = {
  Routers: { name: "Router", icon: Router, dataKey: "routers", catalog: deviceCatalog, entityType: "device" },
  Switches: { name: "Switch", icon: Server, dataKey: "switches", catalog: deviceCatalog, entityType: "device" },
  EndDevices: { name: "End Device", icon: MonitorSmartphone, dataKey: "endDevices", catalog: deviceCatalog, entityType: "device" },
  Cables: { name: "Cable", icon: Cable, dataKey: "cables", catalog: deviceCatalog, entityType: "cable" },
  Furniture: { name: "Furniture", icon: Armchair, dataKey: "furnitures", catalog: furnitureCatalog, entityType: "furniture" },
};

export default function ObjectLibrary({ canvasController }) {
  const [showImportModal, setshowImportModal] = useState(false);
  const [importError, setImportError] = useState(null);
  const [importSuccess, setImportSuccess] = useState(null);
  
  // State for imported devices - clearly separated from catalog
  const [importedItems, setImportedItems] = useState([]);

  useEffect(() => {
    document.body.style.overflow = showImportModal ? "hidden" : "unset";
  }, [showImportModal]);

  const handleDrawCable = (cableId) => {
    if (!canvasController) return;
    appState.ui.selectedCable = cableId;
    const cmd = new StartDrawCableCommand(canvasController, appState, cableId);
    cmd.execute();
  };

  const onDragStart = (event, categoryName, item, entityType, isImported = false) => {
    const normalizedCategory = String(categoryName || '').toLowerCase();
    const iconHint =
      item.iconHint ||
      item.family ||
      (normalizedCategory.includes('switch') ? 'switch' : null) ||
      (normalizedCategory.includes('router') ? 'router' : null) ||
      (normalizedCategory.includes('end') ? 'pc' : null) ||
      (normalizedCategory.includes('imported') ? 'imported' : null);

    const data = { 
      type: categoryName, 
      label: item.displayName || item.label || item.name,
      modelId: item.modelId || item.id, 
      catalogId: item.modelId || item.id, 
      entityType: entityType,
      isImported: isImported,
      iconHint
    };
    event.dataTransfer.setData("application/reactflow", JSON.stringify(data));
    event.dataTransfer.effectAllowed = "move";
  };

  const processFile = (file) => {
    if (!file) return;
    const validExtensions = ['.obj', '.glb', '.fbx'];
    const filename = file.name.toLowerCase();
    const fileExt = '.' + filename.split('.').pop();

    if (!validExtensions.includes(fileExt)) {
      setshowImportModal(false); 
      showErrorModal(
        "The selected object is not supported. Please import a supported objects and try again.",
        "Unsupported Object"
      );
      return;
    }

    // Determine icon based on filename
    let SelectedIcon = HardDriveDownload;
    let selectedKeyword = 'imported';
    for (const [keyword, iconComponent] of Object.entries(ICON_MAP)) {
      if (filename.includes(keyword)) {
        SelectedIcon = iconComponent;
        selectedKeyword = keyword;
        break;
      }
    }

    const nameWithoutExt = file.name.replace(/\.[^/.]+$/, "");
    const newItem = {
      modelId: `imported-${Date.now()}`,
      displayName: nameWithoutExt.toUpperCase(),
      family: "imported",
      model3D: URL.createObjectURL(file),
      sourceExtension: fileExt.slice(1),
      icon: SelectedIcon,
      iconHint: selectedKeyword
    };

    try {
      registerImportedDevice(newItem);
    } catch (err) {
      console.error("Failed to register imported device:", err);
      showErrorModal("Failed to register imported device. Please try again.", "Import Failed");
      return;
    }

    setImportedItems(prev => [...prev, newItem]);
    setImportSuccess(`Successfully registered ${newItem.displayName}.`);
    
    setTimeout(() => {
      setshowImportModal(false);
      setImportSuccess(null);
    }, 1500);
  };

  const ModalPortal = () => {
    return createPortal(
      <div className="import-modal-overlay" onClick={() => setshowImportModal(false)}>
        <div className="import-modal" onClick={(e) => e.stopPropagation()}>
          <div className="import-modal-header">
            <button className="close-btn" onClick={() => setshowImportModal(false)}>
              <X size={16} />
            </button>
          </div>

          <div className="import-modal-content">
            {importError && <div className="import-alert error-container">{importError}</div>}
            {importSuccess && <div className="import-alert success">{importSuccess}</div>}

            <div 
              className="import-drop-zone"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); processFile(e.dataTransfer.files[0]); }}
            >
              <label className="import-file-label">
                <h1>Import</h1>
                <input type="file" onChange={(e) => processFile(e.target.files[0])} hidden />
              </label>
            </div>

            <div className="import-format-info">
              <p><strong>Supported:</strong> .obj, .glb, .fbx</p>
              <pre className="format-example">vendor-family-model.obj</pre>
            </div>
          </div>
        </div>
      </div>,
      document.body
    );
  };

  return (
    <div className="object-library">
      <div className="panel-header-container">
        <h3 className="panel-header-title">Object Library</h3>
        <button className="import-btn" onClick={() => setshowImportModal(true)}>
          <Import size={16} />
          Import
        </button>
      </div>

      <hr className="header-separator" /> 
      
      <div className="library-scroll-area">
        {/* 1. DEDICATED IMPORTED CATEGORY (BEFORE ROUTERS) */}
        {importedItems.length > 0 && (
          <div className="device-category imported-section">
            <p className="category-label">Imported Objects</p>
            <div className="device-grid">
              {importedItems.map((item) => {
                const ItemIcon = item.icon;
                return (
                  <div
                    key={item.modelId}
                    draggable
                    onDragStart={(e) => onDragStart(e, "Imported", item, "device", true)}
                    className="device-tile draggable-tile imported-tile"
                  >
                    <div className="device-icon">
                      <ItemIcon size={32} />
                    </div>
                    <p className="device-type">{item.displayName}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 2. CATALOG CATEGORIES */}
        {Object.keys(categoryDetails).map((catKey) => {
          const { name, icon: IconComponent, dataKey, catalog, entityType } = categoryDetails[catKey];
          const items = dataKey && catalog[dataKey] ? Object.values(catalog[dataKey]) : [];

          if (items.length === 0) return null;

          return (
            <div key={catKey} className="device-category">
              <p className="category-label">{catKey}</p>
              <div className="device-grid">
                {items.map((device) => (
                  <div
                    key={device.modelId || device.id}
                    draggable={catKey !== "Cables"}
                    onDragStart={catKey !== "Cables" ? (e) => onDragStart(e, name, device, entityType) : undefined}
                    onClick={catKey === "Cables" ? () => handleDrawCable(device.id) : undefined}
                    className="device-tile draggable-tile"
                  >
                    <div className="device-icon">
                      <IconComponent size={32} />
                    </div>
                    <p className="device-type">{device.displayName || device.label}</p>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {showImportModal && <ModalPortal />}
    </div>
  );
}