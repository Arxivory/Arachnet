import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import appState from "../state/AppState";
import { UpdateEntityTransformCommand, ChangePropertyCommand } from "../core/editor/DrawingCommands";
import testSwitchEngine from "../core/network/switching/QuickTest";

import RoutingModal from "./RouterModals/RoutingModal";
import InterfaceModal from "./RouterModals/InterfaceModal";
import NATModal from "./RouterModals/NATModal";
import ACLModal from "./RouterModals/ACLModal";
import DHCPModal from "./RouterModals/DHCPModal";
import VPNModal from "./RouterModals/VPNModal";
import SNMPModal from "./RouterModals/SNMPModal";
import NTPModal from "./RouterModals/NTPModal";
import SSHModal from "./RouterModals/SSHModal";
import VLANModal from "./SwitchModals/VLANModal";
import STPModal from "./SwitchModals/STPModal";
import PortSecurityModal from "./SwitchModals/PortSecurityModal";
import TrunkingModal from "./SwitchModals/TrunkingModal";
import QoSModal from "./SwitchModals/QoSModal";
import AuthenticationModal from "./SwitchModals/AuthenticationModal";
import IGMPModals from "./SwitchModals/IGMPModals";
import SyslogModal from "./SwitchModals/SyslogModal";
import IPConfigurationModal from "./PCModals/IPConfigurationModal";
import CommandPromptModal from "./PCModals/CommandPromptModal";

// ─── Config card map ──────────────────────────────────────────────────────────
const DEVICE_CONFIGS = {
  router: [
    { label: "Interface Settings", desc: "Manage IPs, masks, and gateway for each port" },
    { label: "Routing Protocol", desc: "Configure OSPF, BGP, or Static routes" },
    { label: "NAT/PAT", desc: "Translate private IPs to public addresses" },
    { label: "Access Control List", desc: "Create permit/deny traffic rules" },
    { label: "DHCP Server", desc: "Manage IP address pools for the network" },
    { label: "VPN Config", desc: "Set up secure site-to-site tunnels" },
    { label: "SNMP/MIB", desc: "Configure remote monitoring and alerts" },
    { label: "NTP", desc: "Synchronize device clock with time servers" },
    { label: "SSH", desc: "Secure remote command line access" },
  ],
  switch: [
    { label: "Interface Settings", desc: "Manage IPs, masks" },
    { label: "VLAN Manager", desc: "Create and assign Virtual LANs" },
    { label: "Spanning Tree", desc: "Configure STP to prevent network loops" },
    { label: "VLAN Trunking", desc: "Configure 802.1Q tags for switch links" },
    { label: "Port Security", desc: "Bind specific MAC addresses to ports" },
    { label: "QoS Settings", desc: "Prioritize voice or video data packets" },
    { label: "User Auth", desc: "Configure RADIUS/802.1X port access" },
    { label: "IGMP Snooping", desc: "Optimize multicast traffic delivery" },
    { label: "Logs/Syslog", desc: "Export event logs to a central server" },
  ],
  pc: [
    { label: "IP Configuration", desc: "Set IP address, subnet mask, and gateway" },
    { label: "Command Prompt", desc: "Executes commands to manage and control system operations" },
  ],

  smartphone: [
    { label: "IP Configuration", desc: "Set IP address, subnet mask, and gateway" },
    { label: "Command Prompt", desc: "Executes commands to manage and control system operations" },
  ],
};

export default function PropertiesPanel({ canvasController, networkManager }) {
  // ── Entity + transform state ───────────────────────────────────────────────
  const [selectedEntity, setSelectedEntity] = useState(null);
  const [transform, setTransform] = useState({
    position: { x: 0, y: 0, z: 0 },
    scale: { factor: 1 },
    rotation: { x: 0, y: 0, z: 0 },
  });
  const originalLabelRef = useRef("");
  const originalValueRef = useRef({});
  const isEditingRef = useRef(false);

  // ── Advanced Config grid modal ─────────────────────────────────────────────
  const [isModalOpen, setIsModalOpen] = useState(false);

  // ── Per-feature modal open state ──────────────────────────────────────────
  const [isRoutingModalOpen, setIsRoutingModalOpen] = useState(false);
  const [isInterfaceModalOpen, setIsInterfaceModalOpen] = useState(false);
  const [isNATModalOpen, setIsNATModalOpen] = useState(false);
  const [isACLModalOpen, setIsACLModalOpen] = useState(false);
  const [isDHCPModalOpen, setIsDHCPModalOpen] = useState(false);
  const [isVPNModalOpen, setIsVPNModalOpen] = useState(false);
  const [isSNMPModalOpen, setIsSNMPModalOpen] = useState(false);
  const [isNTPModalOpen, setIsNTPModalOpen] = useState(false);
  const [isSSHModalOpen, setIsSSHModalOpen] = useState(false);
  const [isVLANModalOpen, setIsVLANModalOpen] = useState(false);
  const [isSTPModalOpen, setIsSTPModalOpen] = useState(false);
  const [isPortSecurityModalOpen, setIsPortSecurityModalOpen] = useState(false);
  const [isTrunkingModalOpen, setIsTrunkingModalOpen] = useState(false);
  const [isQoSModalOpen, setIsQoSModalOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isIGMPModalOpen, setIsIGMPModalOpen] = useState(false);
  const [isSyslogModalOpen, setIsSyslogModalOpen] = useState(false);
  const selectedDeviceRef = useRef(null);
  const [isIPConfigurationModalOpen, setIsIPConfigurationModalOpen] = useState(false);
  const [isCommandPromptModalOpen, setIsCommandPromptModalOpen] = useState(false);

  // ── Subscription: keep selectedEntity in sync with appState ───────────────
  useEffect(() => {
    const updatePanelContent = () => {
      if (isEditingRef.current) return;

      let ids = appState.selection.getSelectedDeviceIds();
      if (!ids || ids.length === 0) {
        const focused = appState.selection.getFocusedId();
        if (focused) ids = [focused];
      }

      if (ids && ids.length > 0) {
        const entityId = ids[0];
        let entity = findEntityById(entityId);
        let storeNode = null;

        if (appState.structural) {
          const { domains, sites, floors, spaces } = appState.structural;
          storeNode =
            (domains || []).find(d => d.id === entityId) ||
            (sites || []).find(s => s.id === entityId) ||
            (floors || []).find(f => f.id === entityId) ||
            (spaces || []).find(sp => sp.id === entityId);
        }

        if (!storeNode && appState.network)
          storeNode = appState.network.getDevice(entityId);

        if (!storeNode && appState.furniture)
          storeNode = appState.furniture.getFurniture(entityId);

        if (entity && storeNode) {
          if (storeNode.interfaces !== undefined) {
            entity = storeNode;
            selectedDeviceRef.current = storeNode;

            if (entity.transform && storeNode.transform) {
              entity.transform = {
                ...storeNode.transform,
                ...entity.transform,
              };
            } else if (entity.transform == null && storeNode.transform) {
              entity.transform = storeNode.transform;
            }

            if (!entity.label) {
              entity.label = storeNode.label || storeNode.hostname || storeNode.name || entity.label;
            }
          } else {
            entity = {
              ...entity,
              ...storeNode,
              label: storeNode.label || storeNode.hostname || storeNode.name || entity.label
            };
            selectedDeviceRef.current = null;
          }
        } else if (!entity && storeNode) {
          entity = storeNode;
          selectedDeviceRef.current = storeNode?.interfaces !== undefined ? storeNode : null;
        }

        if (entity) {
          setSelectedEntity(entity);
          console.log(entity);
          setTransform({
            position: {
              x: entity.transform?.position?.x ?? entity.x ?? 0,
              y: entity.transform?.position?.y ?? entity.y ?? 0,
              z: entity.transform?.position?.z ?? 0,
            },
            scale: entity.transform?.scale ?? 1,
            rotation: {
              x: entity.transform?.rotation?.x ?? 0,
              y: entity.transform?.rotation?.y ?? 0,
              z: entity.transform?.rotation?.z ?? 0,
            },
          });
          return;
        }
      }
      setSelectedEntity(null);
      selectedDeviceRef.current = null;
    };

    const unsubscribeSelection = appState.selection.subscribe(updatePanelContent);
    const unsubscribeStructural = appState.structural.subscribe(updatePanelContent);
    const unsubscribeNetwork = appState.network.subscribe(updatePanelContent);
    const unsubscribeFurniture = appState.furniture.subscribe(updatePanelContent);

    updatePanelContent();

    return () => {
      if (unsubscribeSelection) unsubscribeSelection();
      if (unsubscribeStructural) unsubscribeStructural();
      if (unsubscribeNetwork) unsubscribeNetwork();
      if (unsubscribeFurniture) unsubscribeFurniture();
    };
  }, [canvasController]);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const findEntityById = (id) => {
    if (!canvasController?.layout) return null;
    return canvasController.layout.findEntityById(id);
  };

  const getDeviceLabel = (id) => {
    if (!canvasController?.layout?.devices) return id;
    const d = canvasController.layout.devices.find(x => x.id === id);
    return d?.label || d?.name || id;
  };

  const getDeviceType = () => {
    if (!selectedEntity) return null;
    const typeStr = (selectedEntity.type || "").toLowerCase();
    const labelStr = (selectedEntity.label || "").toLowerCase().replace(/\s/g, "");
    if (typeStr.includes("router") || labelStr.includes("router")) return "router";
    if (typeStr.includes("switch") || labelStr.includes("switch")) return "switch";
    if (typeStr.includes("phone") || labelStr.includes("phone")) return "smartphone";
    return "pc";
  };

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleTransformChange = (type, axis, value) => {
    if (!selectedEntity || !canvasController) return;
    let numericValue = parseFloat(value);
    if (numericValue < 0 || numericValue === null) numericValue = 0;

    const updates = { [type]: { ...selectedEntity.transform[type], [axis]: numericValue } };
    const cmd = new UpdateEntityTransformCommand(canvasController, appState, selectedEntity.id, updates);
    cmd.execute();

    const entity = findEntityById(selectedEntity.id);
    if (entity) {
      setTransform({
        position: { ...entity.transform.position },
        scale: entity.transform.scale ?? 1,
        rotation: { ...entity.transform.rotation },
      });
    }
  };

  const handleDeviceFocus = (field) => {
    if (!selectedEntity) return;
    let val = selectedEntity[field] || "";
    if (field === 'ipAddress') val = selectedEntity?.interfaces?.[0]?.ipv4?.address || "";
    if (field === 'subnetMask') val = selectedEntity?.interfaces?.[0]?.ipv4?.subnetMask || "";
    if (field === 'defaultGateway') val = selectedEntity?.defaultGateway || "";

    // Save the old value the moment the user clicks into the text box
    originalValueRef.current[field] = val;
    isEditingRef.current = true;
  };

  const handleDeviceChange = (field, value) => {
    if (!selectedEntity) return;

    // ONLY update the local React UI so the user can type smoothly. 
    // Do NOT dispatch a command here!
    let updatedEntity = { ...selectedEntity, [field]: value, interfaces: selectedEntity.interfaces };
    if (field === "ipAddress" || field === "subnetMask") {
      const interfaces = Array.isArray(selectedEntity.interfaces) ? [...selectedEntity.interfaces] : [];
      const firstInterface = interfaces[0] ? { ...interfaces[0] } : {};
      const ipv4 = { ...(firstInterface.ipv4 || {}) };

      if (field === "ipAddress") ipv4.address = value;
      if (field === "subnetMask") ipv4.subnetMask = value;

      firstInterface.ipv4 = ipv4;
      interfaces[0] = firstInterface;
      updatedEntity = { ...selectedEntity, interfaces, [field]: value };
    } else if (field === "defaultGateway") {
      updatedEntity = { ...selectedEntity, defaultGateway: value, interfaces: selectedEntity.interfaces };
    }
    setSelectedEntity(updatedEntity);
  };

  const handleDeviceBlur = (field) => {
    if (!selectedEntity) return;
    const oldValue = originalValueRef.current[field] || "";
    let newValue = selectedEntity[field] || "";
    if (field === 'ipAddress') newValue = selectedEntity?.interfaces?.[0]?.ipv4?.address || "";
    if (field === 'subnetMask') newValue = selectedEntity?.interfaces?.[0]?.ipv4?.subnetMask || "";
    if (field === 'defaultGateway') newValue = selectedEntity?.defaultGateway || "";

    // The user clicked away. Did they actually change the text?
    if (oldValue !== newValue) {
      // Yes! Log ONE clean command containing the whole completed string
      const command = new ChangePropertyCommand(appState, selectedEntity.id, 'device', field, oldValue, newValue);
      appState.pushCommand(command);
      command.execute();

      // Update our ref so subsequent edits don't glitch
      originalValueRef.current[field] = newValue;
    }
    isEditingRef.current = false;
  };

  const handleFurnitureFocus = (field) => {
    if (!selectedEntity) return;
    originalValueRef.current[field] = selectedEntity[field] || "";
    isEditingRef.current = true;
  };

  const handleFurnitureChange = (field, value) => {
    if (!selectedEntity) return;
    setSelectedEntity({ ...selectedEntity, [field]: value });
  };

  const handleFurnitureBlur = (field) => {
    if (!selectedEntity) return;
    const oldValue = originalValueRef.current[field] || "";
    const newValue = selectedEntity[field] || "";

    if (oldValue !== newValue) {
      const command = new ChangePropertyCommand(appState, selectedEntity.id, 'furniture', field, oldValue, newValue);
      appState.pushCommand(command);
      command.execute();
      originalValueRef.current[field] = newValue;
    }
    isEditingRef.current = false;
  };

  const handleStructureRenameFocus = () => {
    originalLabelRef.current = selectedEntity.label || selectedEntity.name || "";
    isEditingRef.current = true;
  };

  const handleStructureRenameChange = (e) => {
    // Only update the local React UI state while they are actively typing. 
    // Do NOT dispatch to the store yet!
    setSelectedEntity({ ...selectedEntity, label: e.target.value });
  };

  const handleStructureRenameBlur = (e) => {
    const newName = e.target.value;
    const previousLabel = originalLabelRef.current;

    if (newName.trim() === "") {
      // Revert to old name if they left it blank
      setSelectedEntity({ ...selectedEntity, label: previousLabel });
    } else if (newName !== previousLabel) {
      // If the name actually changed, log it in the Time Machine!
      const typeStr = (selectedEntity.structureType || selectedEntity.type || "").toLowerCase();

      const command = new ChangePropertyCommand(appState, selectedEntity.id, typeStr, 'label', previousLabel, newName);
      appState.pushCommand(command);
      command.execute();

      // Update our reference so subsequent edits work correctly
      originalLabelRef.current = newName;
    }
    isEditingRef.current = false;
  };

  const handleConfigItemClick = (label) => {
    const map = {
      "Routing Protocol": () => setIsRoutingModalOpen(true),
      "Interface Settings": () => setIsInterfaceModalOpen(true),
      "NAT/PAT": () => setIsNATModalOpen(true),
      "Access Control List": () => setIsACLModalOpen(true),
      "DHCP Server": () => setIsDHCPModalOpen(true),
      "VPN Config": () => setIsVPNModalOpen(true),
      "SNMP/MIB": () => setIsSNMPModalOpen(true),
      "NTP": () => setIsNTPModalOpen(true),
      "SSH": () => setIsSSHModalOpen(true),
      "VLAN Manager": () => setIsVLANModalOpen(true),
      "Spanning Tree": () => setIsSTPModalOpen(true),
      "Port Security": () => setIsPortSecurityModalOpen(true),
      "VLAN Trunking": () => setIsTrunkingModalOpen(true),
      "QoS Settings": () => setIsQoSModalOpen(true),
      "User Auth": () => setIsAuthModalOpen(true),
      "IGMP Snooping": () => setIsIGMPModalOpen(true),
      "Logs/Syslog": () => setIsSyslogModalOpen(true),
      "IP Configuration": () => setIsIPConfigurationModalOpen(true),
      "Command Prompt": () => setIsCommandPromptModalOpen(true),
    };
    map[label]?.() ?? console.log(`Opening ${label}`);
  };

  // ── Derived flags ──────────────────────────────────────────────────────────
  const deviceType = getDeviceType();
  const configGroups = [{ category: "Advanced Configuration", items: DEVICE_CONFIGS[deviceType] || [] }];

  const isDevice = selectedEntity && selectedEntity.interfaces !== undefined;
  const isCable = selectedEntity && selectedEntity.sourceId !== undefined && selectedEntity.targetId !== undefined;
  const isWall = selectedEntity && selectedEntity.type === "wall";
  const isStructure = selectedEntity && (
    selectedEntity.structureType === "Domain" ||
    selectedEntity.structureType === "Site" ||
    selectedEntity.structureType === "Floor" ||
    selectedEntity.structureType === "Space" ||
    ["space", "site", "domain", "floor"].includes(selectedEntity.type)
  );
  const isFurniture = selectedEntity && !isDevice && !isCable && !isWall && !isStructure;


  const resolveDeviceLocation = () => {
    if (!selectedEntity || !canvasController?.layout) return "Unknown Location";
    const floors = appState.structural?.floors || [];
    const spaces = appState.structural?.spaces || [];
    const matchSpace = spaces.find((sp) => sp.deviceIds?.includes(selectedEntity.id));
    if (matchSpace) return matchSpace.label || matchSpace.name || "Unknown Space";
    const matchFloor = floors.find((f) => f.deviceIds?.includes(selectedEntity.id));
    if (matchFloor) return matchFloor.label || matchFloor.name || "Unknown Floor";
    return "Unknown Location";
  };
  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="properties-panel">
      <h3>Properties</h3>

      {/* ── Cable ─────────────────────────────────────────────────────────── */}
      {isCable && (
        <div className="properties-group">
          <div><label>Cable Type</label>    <input className="field-input" value={selectedEntity.type || ""} readOnly /></div>
          <div><label>Source Device</label> <input className="field-input" value={getDeviceLabel(selectedEntity.sourceId)} readOnly /></div>
          <div><label>Source Port</label>   <input className="field-input" value={selectedEntity.sourcePort || ""} readOnly /></div>
          <div><label>Target Device</label> <input className="field-input" value={getDeviceLabel(selectedEntity.targetId)} readOnly /></div>
          <div><label>Target Port</label>   <input className="field-input" value={selectedEntity.targetPort || ""} readOnly /></div>
        </div>
      )}

      {/* ── Wall ──────────────────────────────────────────────────────────── */}
      {isWall && (
        <div className="properties-group">
          <div><label>Wall Name</label><input className="field-input" value={selectedEntity.label || "Wall"} readOnly /></div>
          <div>
            <label>Material</label>
            <select className="field-input">
              <option>Concrete</option><option>Wood</option><option>Glass</option><option>Metal</option>
            </select>
          </div>
        </div>
      )}

      {/* ── Network Device ────────────────────────────────────────────────── */}
      {isDevice && (
        <div className="properties-group">
          <hr className="header-separator" />
          <div><label>Device Name</label>
            <input className="field-input"
              value={selectedEntity?.label || ""}
              onFocus={() => handleDeviceFocus('label')}
              onChange={(e) => handleDeviceChange('label', e.target.value)}
              onBlur={() => handleDeviceBlur('label')}
            />
          </div>
          {deviceType === "switch" && (
            <div><label>Default Gateway</label>
              <input className="field-input"
                value={selectedEntity?.defaultGateway || ""}
                onFocus={() => handleDeviceFocus('defaultGateway')}
                onChange={(e) => handleDeviceChange('defaultGateway', e.target.value)}
                onBlur={() => handleDeviceBlur('defaultGateway')}
                placeholder="192.168.1.254"
              />
            </div>
          )}
          <button className="floor-specifier-btn" onClick={() => setIsModalOpen(true)}>
            Advanced Configuration
          </button>

        </div>
      )}

      {/* ── Furniture ─────────────────────────────────────────────────────── */}
      {isFurniture && (
        <div className="properties-group">
          <hr className="header-separator" />
          <div><label>Furniture Name</label>
            <input className="field-input"
              value={selectedEntity?.label || ""}
              onFocus={() => handleFurnitureFocus('label')}
              onChange={(e) => handleFurnitureChange('label', e.target.value)}
              onBlur={() => handleFurnitureBlur('label')}
            />
          </div>
        </div>
      )}

      {/* ── Structure ─────────────────────────────────────────────────────── */}
      {isStructure && (
        <div className="properties-group">
          <hr className="header-separator" />
          <div>
            <label>Name</label>
            <input
              className="field-input"
              value={selectedEntity.label ?? selectedEntity.name ?? ""}
              onFocus={handleStructureRenameFocus}
              onChange={handleStructureRenameChange}
              onBlur={handleStructureRenameBlur}
            />
          </div>
          <div><label>Type</label><input className="field-input" value={selectedEntity.structureType || selectedEntity.type || ""} readOnly /></div>
          <div>
            <label>Material</label>
            <select className="field-input">
              <option>Concrete</option><option>Wood</option><option>Tile</option><option>Carpet</option>
            </select>
          </div>
        </div>
      )}

      {/* ── Transform ─────────────────────────────────────────────────────── */}
      <hr className="header-separator" />
      <h3>Transformations</h3>
      {selectedEntity ? (
        <>
          <div className="transform-header"><span></span><span>X</span><span>Y</span><span>Z</span></div>
          <div className="transform-grid">
            <label>Position</label>
            <input type="number" className="field-input" value={transform.position.x} onChange={(e) => handleTransformChange("position", "x", e.target.value)} />
            <input type="number" className="field-input" value={transform.position.y} onChange={(e) => handleTransformChange("position", "y", e.target.value)} />
            <input type="number" className="field-input" value={transform.position.z} onChange={(e) => handleTransformChange("position", "z", e.target.value)} />
          </div>
          <div className="transform-grid">
            <label>Scale</label>
            <input type="number" className="field-input" value={transform.scale.factor} onChange={(e) => handleTransformChange("scale", "factor", e.target.value)} />
            <input type="number" className="field-input" defaultValue={0} disabled />
            <input type="number" className="field-input" defaultValue={0} disabled />
          </div>
          <div className="transform-grid">
            <label>Rotation</label>
            <input type="number" className="field-input" value={transform.rotation.x} onChange={(e) => handleTransformChange("rotation", "x", e.target.value)} />
            <input type="number" className="field-input" value={transform.rotation.y} onChange={(e) => handleTransformChange("rotation", "y", e.target.value)} />
            <input type="number" className="field-input" value={transform.rotation.z} onChange={(e) => handleTransformChange("rotation", "z", e.target.value)} />
          </div>
        </>
      ) : (
        <p className="empty-selection-msg">Select an entity to see transform properties</p>
      )}

      {/* ── Advanced Config grid ──────────────────────────────────────────── */}
      {isModalOpen && createPortal(
        <div className="config-modal-overlay">
          <div className="config-modal-content">
            <div className="modal-header">
              <h2>Advanced {deviceType?.toUpperCase()} Configuration: {selectedEntity?.label}</h2>
              <button className="close-btn" onClick={() => setIsModalOpen(false)}>×</button>
            </div>
            <div className="modal-body">
              {configGroups.map((group) => (
                <div key={group.category} className="config-section">
                  <div className="config-grid">
                    {group.items.map((item) => (
                      <div
                        key={item.label}
                        className="config-item-card"
                        onClick={() => handleConfigItemClick(item.label)}
                      >
                        <div className="config-text">
                          <div className="config-label">{item.label}</div>
                          <div className="config-desc">{item.desc}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Individual modal slots ─────────────────────────────────────────── */}
      {isRoutingModalOpen && (
        <RoutingModal
          onClose={() => setIsRoutingModalOpen(false)}
          deviceName={selectedEntity?.label || "Router-Core-01"}
          deviceLocation={resolveDeviceLocation()}
          device={selectedEntity}
        />
      )}

      {isInterfaceModalOpen && (
        <InterfaceModal
          onClose={() => setIsInterfaceModalOpen(false)}
          deviceName={selectedEntity?.label || "Router-Core-01"}
          deviceLocation={resolveDeviceLocation()}
          device={selectedEntity}
          deviceType={deviceType}
        />
      )}

      {isNATModalOpen && (
        <NATModal
          onClose={() => setIsNATModalOpen(false)}
          deviceName={selectedEntity?.label || "Router-Core-01"}
          deviceLocation={resolveDeviceLocation()}
        />
      )}

      {isACLModalOpen && (
        <ACLModal
          onClose={() => setIsACLModalOpen(false)}
          deviceName={selectedEntity?.label || "Router-Core-01"}
          deviceLocation={resolveDeviceLocation()}
        />
      )}

      {isDHCPModalOpen && (
        <DHCPModal
          onClose={() => setIsDHCPModalOpen(false)}
          deviceName={selectedEntity?.label || "Router-Core-01"}
          deviceLocation={resolveDeviceLocation()}
        />
      )}

      {isVPNModalOpen && (
        <VPNModal
          onClose={() => setIsVPNModalOpen(false)}
          deviceName={selectedEntity?.label || "Router-Core-01"}
          deviceLocation={resolveDeviceLocation()}
        />
      )}

      {isSNMPModalOpen && (
        <SNMPModal
          onClose={() => setIsSNMPModalOpen(false)}
          deviceName={selectedEntity?.label || "Router-Core-01"}
          deviceLocation={resolveDeviceLocation()}
        />
      )}

      {isNTPModalOpen && (
        <NTPModal
          onClose={() => setIsNTPModalOpen(false)}
          deviceName={selectedEntity?.label || "Router-Core-01"}
          deviceLocation={resolveDeviceLocation()}
        />
      )}

      {isSSHModalOpen && (
        <SSHModal
          onClose={() => setIsSSHModalOpen(false)}
          deviceName={selectedEntity?.label || "Router-Core-01"}
          deviceLocation={resolveDeviceLocation()}
        />
      )}
      {isVLANModalOpen && (
        <VLANModal
          onClose={() => setIsVLANModalOpen(false)}
          deviceName={selectedEntity?.label || "Router-Core-01"}
          deviceLocation={resolveDeviceLocation()}
          device={selectedDeviceRef.current || selectedEntity}
        />
      )}
      {isSTPModalOpen && (
        <STPModal
          onClose={() => setIsSTPModalOpen(false)}
          deviceName={selectedEntity?.label || "Router-Core-01"}
          deviceLocation={resolveDeviceLocation()}
          device={selectedDeviceRef.current || selectedEntity}
        />
      )}
      {isPortSecurityModalOpen && (
        <PortSecurityModal
          onClose={() => setIsPortSecurityModalOpen(false)}
          deviceName={selectedEntity?.label || "Router-Core-01"}
          deviceLocation={resolveDeviceLocation()}
        />
      )}
      {isTrunkingModalOpen && (
        <TrunkingModal
          onClose={() => setIsTrunkingModalOpen(false)}
          deviceName={selectedEntity?.label || "Router-Core-01"}
          deviceLocation={resolveDeviceLocation()}
          device={selectedDeviceRef.current || selectedEntity}
        />
      )}
      {isQoSModalOpen && (
        <QoSModal
          onClose={() => setIsQoSModalOpen(false)}
          deviceName={selectedEntity?.label || "Router-Core-01"}
          deviceLocation={resolveDeviceLocation()}
        />
      )}
      {isAuthModalOpen && <AuthenticationModal onClose={() => setIsAuthModalOpen(false)} />}
      {isIGMPModalOpen && <IGMPModals onClose={() => setIsIGMPModalOpen(false)} />}
      {isSyslogModalOpen && <SyslogModal onClose={() => setIsSyslogModalOpen(false)} />}

      {isIPConfigurationModalOpen && (
        <IPConfigurationModal
          onClose={() => setIsIPConfigurationModalOpen(false)}
          deviceName={selectedEntity?.label || "Router-Core-01"}
          deviceLocation={resolveDeviceLocation()}
          device={selectedEntity}
        />
      )}

      {isCommandPromptModalOpen && (
        <CommandPromptModal
          onClose={() => setIsCommandPromptModalOpen(false)}
          deviceName={selectedEntity?.label || "Router-Core-01"}
          deviceLocation={resolveDeviceLocation()}
          device={selectedEntity}
          networkManager={networkManager}
        />
      )}
    </div>
  );
}