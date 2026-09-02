import { getCatalogEntry, PORT_TYPES } from './deviceCatalog.js';
import Device from '../core/network/Device.js';
import PhysicalPort from '../core/network/PhysicalPort.js';
import Interface from '../core/network/Interface.js';
import { installSwitchBehavior } from '../core/network/Switch.js';
import { installRouterBehavior } from '../core/network/routing/Router.js';
import { installHostBehavior } from '../core/network/Host.js';
import appState from '../state/AppState.js';

/**
 * DeviceFactory
 * 
 * Responsible for turning a catalog entry (pure data) into a fully
 * instantiated Device with its PhysicalPort and Interface objects wired together.
 * 
 * This replaces the old createDeviceInstance() that lived inside deviceCatalog.js
 * and returned a plain JS object with a string[] for interfaces.
 * 
 * Usage:
 *   const sw = DeviceFactory.create('2960', { x: 0, y: 0, z: 0 });
 *   sw.getPortByName('FastEthernet0/1');   // → PhysicalPort
 *   sw.getInterfaceByName('FastEthernet0/1'); // → Interface
 */
export default class DeviceFactory {
  /**
   * Create a fully instantiated Device from a catalog ID.
   * 
   * @param {string} catalogId              - e.g. '2960', 'router-1941', 'desktop'
   * @param {object} [position]             - { x, y, z } world position
   * @param {object} [opts]
   * @param {string} [opts.hostname]        - Override hostname
   * @param {string} [opts.id]              - Override generated device ID
   * @returns {Device}
   */
  static create(catalogId, position = { x: 0, y: 0, z: 0 }, opts = {}) {
    const catalog = getCatalogEntry(catalogId);
    if (!catalog) {
      throw new Error(`DeviceFactory: Unknown catalogId "${catalogId}".`);
    }

    // Build Device
    const deviceId = opts.id || _generateId('dev');
    const hostname  = opts.hostname || catalog.displayName;

    const device = new Device({
      id:        deviceId,
      type:      catalog.family,
      hostname,
      catalogId: catalog.modelId,
      transform: {
        position: { x: position.x * 0.7, y: 0.1, z: position.y * 0.7} || { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale:    { x: 4, y: 4, z: 4 },
      },
    });

    // Build PhysicalPort + Interface pairs from portGroups FIRST,
    // then install behavior — this ensures STP, routing engines, etc.
    // see the real port/interface objects when they initialize.
    if (!catalog.portGroups || catalog.portGroups.length === 0) {
      console.warn(`DeviceFactory: Catalog entry "${catalogId}" has no portGroups.`);
    } else {
      for (const group of catalog.portGroups) {
        const ports = _expandPortGroup(group);

        for (const portName of ports) {
          const portId = `${deviceId}::${portName}`;

          // Physical Port (Layer 1)
          const physPort = new PhysicalPort({
            id:            portId,
            name:          portName,
            portType:      group.portType,
            connectorType: group.connectorType,
            speedBps:      group.speedBps,
            fullDuplex:    group.fullDuplex,
            autoMdix:      catalog.autoMdix ?? false,
          });

          // Logical Interface (Layer 2/3)
          // Console / serial ports don't get a network interface — they're
          // management-plane only. We still create a PhysicalPort for them
          // so the UI can render the socket, but no Interface is needed.
          if (group.portType !== PORT_TYPES.SERIAL) {
            const intf = new Interface({
              id:        `${portId}::intf`,
              name:      portName,  // Interface name mirrors port name (standard Cisco behaviour)
              macAddress: _generateMac(),
            });

            // Wire them together
            physPort.bindInterface(intf);  // PhysicalPort → Interface
            device.addInterface(intf);     // Device → Interface
          }

          device.addPort(physPort);        // Device → PhysicalPort
        }
      }
    }

    // Install behavior AFTER ports/interfaces exist so engines (STP, routing)
    // can enumerate real ports during their initialization.
    if (catalog.family === 'switch') {
      installSwitchBehavior(device);
    } else if (catalog.family === 'router') {
      installRouterBehavior(device);
    } else if (catalog.family === 'end-device') {
      installHostBehavior(device);
    }

    return device;
  }
}

// ---------------------------------------------------------------------------
// PRIVATE HELPERS
// ---------------------------------------------------------------------------

/**
 * Expand a portGroup definition into an array of port name strings.
 * Handles both fixed names (Console) and templated names (GigabitEthernet0/{n}).
 * 
 * @param {object} group
 * @returns {string[]}
 */
function _expandPortGroup(group) {
  const names = [];
  const hasTemplate = group.template.includes('{n}');

  if (!hasTemplate) {
    // Fixed name — e.g. "Console". Always exactly one entry.
    names.push(group.template);
    return names;
  }

  const start = group.startIndex ?? 1;
  const end   = start + (group.count ?? 1) - 1;

  for (let i = start; i <= end; i++) {
    names.push(group.template.replace(/\{n\}/g, i));
  }

  return names;
}

/**
 * Generate a unique device/port ID.
 * @param {string} prefix
 * @returns {string}
 */
function _generateId(prefix = 'dev') {
  return `${prefix}_${Date.now().toString(36)}_${Math.floor(Math.random() * 10000)}`;
}

/**
 * Generate a random MAC address.
 * In a real simulator you'd want a deterministic scheme (e.g. OUI prefix + counter).
 * @returns {string}  e.g. "00:1A:2B:3C:4D:5E"
 */
function _generateMac() {
  const hex = () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0').toUpperCase();
  // Locally administered unicast: set bit 1 of first octet
  const first = (Math.floor(Math.random() * 64) * 4 + 2).toString(16).padStart(2, '0').toUpperCase();
  return `${first}:${hex()}:${hex()}:${hex()}:${hex()}:${hex()}`;
}