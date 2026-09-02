/**
 * Routing Module Index
 * 
 * Central export point for all Layer 3 routing components.
 * 
 * Usage:
 *   import { installRouterBehavior } from './routing/index.js';
 *   import RoutingTable from './routing/RoutingTable.js';
 *   // ... etc
 */

export { installRouterBehavior, isRouter, uninstallRouterBehavior } from './Router.js';
export { default as RoutingTable } from './RoutingTable.js';
export { default as ARPCache } from './ARPCache.js';
export { default as ICMPHandler } from './ICMPHandler.js';
export { default as PacketBuilder } from './PacketBuilder.js';
export { default as RouterPipeline } from './RouterPipeline.js';
export { default as SimulationBus } from './SimulationBus.js';
export { default as RIPEngine } from './RIPEngine.js';
export { default as OSPFEngine } from './OSPFEngine.js';

// Re-export packet schema for convenience
export {
  createEthernetFrame,
  createIPPacket,
  createARPPacket,
  createICMPPacket,
  createRIPMessage,
  isBroadcast,
  isARPFrame,
  isIPv4Frame,
} from '../Packet.js';
