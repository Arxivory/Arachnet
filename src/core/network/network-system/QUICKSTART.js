/**
 * QUICKSTART.js
 * 
 * Quick start guide showing how to use the unified network system.
 * This file demonstrates common tasks and patterns.
 */

import { NetworkManager } from './index.js';

/**
 * Example 1: Initialize and start the network
 */
export function example_initializeNetwork(appState) {
  // Create the network manager
  const manager = new NetworkManager(appState.network);

  // Initialize (sets up devices and links)
  manager.initialize();
  console.log('Network initialized');

  // Start the simulation
  manager.start();
  console.log('Network simulation running');

  return manager;
}

/**
 * Example 2: Listen to network events
 */
export function example_listenToEvents(manager) {
  manager.addEventListener('packetSent', (data) => {
    console.log(`✓ Packet sent from ${data.srcIP} to ${data.dstIP} (${data.type})`);
  });

  manager.addEventListener('packetReceived', (data) => {
    console.log(`✓ Packet received at ${data.destIP}`);
  });

  manager.addEventListener('packetDropped', (data) => {
    console.log(`✗ Packet dropped: ${data.reason}`);
  });

  manager.addEventListener('networkStatusChanged', (data) => {
    console.log(`Network status: ${data.status}`);
  });
}

/**
 * Example 3: Send a ping
 */
export function example_sendPing(manager) {
  // Get devices with IPs
  const devices = manager.getDevices();
  
  // Find two devices with IP addresses
  let srcIP = null;
  let dstIP = null;

  for (const device of devices) {
    if (device._interfaces) {
      for (const intf of device._interfaces.values()) {
        if (intf.ipv4?.address) {
          if (!srcIP) {
            srcIP = intf.ipv4.address;
          } else if (!dstIP) {
            dstIP = intf.ipv4.address;
            break;
          }
        }
      }
      if (srcIP && dstIP) break;
    }
  }

  if (srcIP && dstIP) {
    console.log(`Sending ping from ${srcIP} to ${dstIP}`);
    manager.sendPing(srcIP, dstIP);
  } else {
    console.warn('Could not find two devices with IP addresses');
  }
}

/**
 * Example 4: Send custom packets
 */
export function example_sendCustomPacket(manager) {
  // Send TCP packet
  const payload = {
    srcPort: 12345,
    dstPort: 80,
    flags: 'SYN',
    data: 'GET / HTTP/1.1\r\nHost: example.com\r\n',
  };

  const success = manager.sendPacket(
    '192.168.1.10',      // Source IP
    '192.168.1.20',      // Destination IP
    'tcp',               // Protocol
    payload              // Payload
  );

  if (success) {
    console.log('TCP packet sent successfully');
  } else {
    console.warn('Failed to send TCP packet');
  }
}

/**
 * Example 5: Monitor network statistics
 */
export function example_monitorStats(manager) {
  // Log stats every 1 second
  const interval = setInterval(() => {
    const stats = manager.getNetworkStats();

    if (stats) {
      console.log(`
--- Network Statistics ---
Sent: ${stats.packetsSent}
Received: ${stats.packetsReceived}
Dropped: ${stats.packetsDropped}
In-flight: ${stats.inFlightPackets}
Simulation time: ${(stats.simulationTime / 1000).toFixed(2)}s
      `);
    }
  }, 1000);

  // Return function to stop monitoring
  return () => clearInterval(interval);
}

/**
 * Example 6: Control simulation speed
 */
export function example_controlSimulationSpeed(manager) {
  // Run at 10x speed
  manager.engine.clock.setTimeScale(10.0);
  console.log('Simulation running at 10x speed');

  // Later: back to real-time
  manager.engine.clock.setTimeScale(1.0);
  console.log('Simulation back to real-time');

  // Later: step-by-step mode
  manager.engine.clock.stop();
  console.log('Simulation paused');

  manager.engine.clock.advance(100);  // Step forward 100ms
  console.log('Advanced simulation by 100ms');
}

/**
 * Example 7: Dynamic network changes
 */
export function example_dynamicNetworkChanges(manager) {
  // Get current state
  const devices = manager.getDevices();
  const links = manager.getLinks();

  // Add a new device (if system supports it)
  if (devices.length > 0) {
    console.log(`Current network has ${devices.length} devices and ${links.length} links`);
  }

  // In a full implementation, you could:
  // - Add a new device dynamically
  // - Create a link between devices
  // - Remove a device or link
  // The NetworkManager and Engine would update automatically
}

/**
 * Example 8: Trace packet path
 */
export function example_tracePacketPath(manager) {
  // Enable detailed logging in the components
  console.log('Enabling packet tracing...');

  // Get router reference
  const devices = manager.getDevices();
  const router = devices.find(d => d.type === 'router');

  if (router && router.routingTable) {
    console.log('Router routing table:');
    router.routingTable.entries.forEach((route, dest) => {
      console.log(`  ${dest} -> ${route.nextHop || 'direct'} via ${route.egressInterface}`);
    });
  }

  // Get switch reference
  const switcher = devices.find(d => d.type === 'switch');
  if (switcher && switcher.engine?.macTable) {
    console.log('Switch MAC table:');
    switcher.engine.macTable.table.forEach((portId, mac) => {
      console.log(`  ${mac} on port ${portId}`);
    });
  }
}

/**
 * Example 9: Complex scenario - setup and run
 */
export function example_complexScenario(appState) {
  console.log('=== Complex Network Scenario ===\n');

  // 1. Initialize
  const manager = example_initializeNetwork(appState);

  // 2. Listen to events
  example_listenToEvents(manager);

  // 3. Set simulation speed
  manager.engine.clock.setTimeScale(1.0);  // Real-time

  // 4. Send some pings
  console.log('\n--- Sending pings ---');
  for (let i = 0; i < 3; i++) {
    setTimeout(() => {
      example_sendPing(manager);
    }, i * 1000);
  }

  // 5. Monitor stats
  console.log('\n--- Starting stats monitor ---');
  const stopMonitoring = example_monitorStats(manager);

  // 6. After 10 seconds, stop everything
  setTimeout(() => {
    stopMonitoring();
    manager.stop();
    manager.engine.logNetworkState();
    console.log('\nSimulation completed');
  }, 10000);
}

/**
 * Example 10: Integration with UI
 */
export function example_uiIntegration(manager, uiElement) {
  // Update UI element with network stats
  function updateUI() {
    const stats = manager.getNetworkStats();
    const devices = manager.getDevices();
    const links = manager.getLinks();

    uiElement.innerHTML = `
      <div class="network-status">
        <h2>Network Status</h2>
        <div class="stats">
          <div>Devices: ${devices.length}</div>
          <div>Links: ${links.length}</div>
          <div>Packets Sent: ${stats.packetsSent}</div>
          <div>Packets Received: ${stats.packetsReceived}</div>
          <div>Packets Dropped: ${stats.packetsDropped}</div>
          <div>In-flight: ${stats.inFlightPackets}</div>
          <div>Sim Time: ${(stats.simulationTime / 1000).toFixed(2)}s</div>
        </div>
        <button onclick="sendTestPing()">Send Ping</button>
      </div>
    `;
  }

  // Update every 500ms
  const updateInterval = setInterval(updateUI, 500);

  // Return cleanup function
  return () => clearInterval(updateInterval);
}

// ============================================================================
// USAGE IN APPLICATION
// ============================================================================

/**
 * How to use in your application:
 * 
 * import { example_initializeNetwork, example_complexScenario } from './network-system/QUICKSTART.js';
 * 
 * // In your main app initialization:
 * const networkManager = example_initializeNetwork(appState);
 * 
 * // Or run a complex scenario:
 * example_complexScenario(appState);
 */

export default {
  example_initializeNetwork,
  example_listenToEvents,
  example_sendPing,
  example_sendCustomPacket,
  example_monitorStats,
  example_controlSimulationSpeed,
  example_dynamicNetworkChanges,
  example_tracePacketPath,
  example_complexScenario,
  example_uiIntegration,
};
