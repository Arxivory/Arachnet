import DeviceFactory from '../../../data/DeviceFactory.js';
import Link from '../Link.js';

export default function testSwitchEngine() {
  console.log("🚀 --- STARTING STP LOOP PREVENTION TEST ---");

  // 1. Boot up two switches
  const sw1 = DeviceFactory.create('2960', {x:0, y:0, z:0}, { hostname: "SW-1" });
  const sw2 = DeviceFactory.create('2960', {x:0, y:0, z:0}, { hostname: "SW-2" });

  // 2. Create a PHYSICAL LOOP by plugging TWO cables between them!
  const sw1Port1 = sw1.getPortByName('FastEthernet0/1');
  const sw2Port1 = sw2.getPortByName('FastEthernet0/1');
  const link1 = new Link({ sourcePort: sw1Port1, targetPort: sw2Port1 });

  const sw1Port2 = sw1.getPortByName('FastEthernet0/2');
  const sw2Port2 = sw2.getPortByName('FastEthernet0/2');
  const link2 = new Link({ sourcePort: sw1Port2, targetPort: sw2Port2 });

  console.log(`\n🔗 Created a physical loop between ${sw1.hostname} and ${sw2.hostname}!`);
  console.log(`⏳ Waiting 5 seconds for BPDUs to be exchanged and STP to converge...`);

  // 3. Wait for the STP engines to exchange BPDUs (They send every 2 seconds)
  setTimeout(() => {
    console.log("\n🌳 --- STP TOPOLOGY RESULTS ---");
    
    // Check Switch 1
    console.log(`\n[${sw1.hostname}] Bridge ID: ${sw1.stpEngine.bridgeId}`);
    console.log(`Root Bridge ID recognized: ${sw1.stpEngine.rootId}`);
    const sw1Ports = Array.from(sw1.stpEngine.portStates.entries())
      // Filter out empty ports just to keep the console clean
      .filter(([portId, state]) => sw1.getPortByName(portId.split('::')[1]).isOccupied)
      .map(([portId, state]) => ({ Port: portId.split('::')[1], State: state }));
    console.table(sw1Ports);

    // Check Switch 2
    console.log(`\n[${sw2.hostname}] Bridge ID: ${sw2.stpEngine.bridgeId}`);
    console.log(`Root Bridge ID recognized: ${sw2.stpEngine.rootId}`);
    const sw2Ports = Array.from(sw2.stpEngine.portStates.entries())
      .filter(([portId, state]) => sw2.getPortByName(portId.split('::')[1]).isOccupied)
      .map(([portId, state]) => ({ Port: portId.split('::')[1], State: state }));
    console.table(sw2Ports);
    
    // Clean up timers so they don't run forever in the background
    sw1.stpEngine.stop();
    sw2.stpEngine.stop();
    
    console.log("\n✅ Test Complete: One of the ports above should be in a BLOCKING state to prevent the loop!");
  }, 5000);
}