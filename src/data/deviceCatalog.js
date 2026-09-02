/**
 * deviceCatalog.js
 * 
 * Pure data registry for all known device models and cable types.
 * No factory logic lives here — see DeviceFactory.js for instantiation.
 * 
 * Port group template tokens:
 *   {n}  → replaced with port index (e.g. GigabitEthernet0/{n} → GigabitEthernet0/1)
 *   No token → name is used as-is (e.g. "Console", "USB")
 * 
 * Speed unit: bps (bits per second) across all entries.
 */

// ---------------------------------------------------------------------------
// PORT TYPE CONSTANTS
// Used as a formal enum across PhysicalPort, Interface, and validation logic.
// ---------------------------------------------------------------------------
export const PORT_TYPES = {
  ETHERNET:  'ethernet',   // RJ-45, SFP — data plane
  SERIAL:    'serial',     // Console / RS-232 / AUX — management plane
  USB:       'usb',        // USB-A / USB-C — management / storage
  WIRELESS:  'wireless',   // 802.11 radio
  LOOPBACK:  'loopback',   // Virtual — always up, no physical port
  UNKNOWN:   'unknown',
};

// ---------------------------------------------------------------------------
// CONNECTOR TYPE CONSTANTS
// Physical socket form factor on the device chassis.
// ---------------------------------------------------------------------------
export const CONNECTOR_TYPES = {
  RJ45:       'rj45',
  SFP:        'sfp',
  SFP_PLUS:   'sfp+',
  DB9_RJ45:   'db9_rj45',  // Console rollover
  USB_A:      'usb-a',
  USB_C:      'usb-c',
  WIRELESS:   'wireless',  // No physical connector
};

// ---------------------------------------------------------------------------
// SWITCHES
// ---------------------------------------------------------------------------
const switches = {
  "1200": {
    modelId:     "1200",
    displayName: "Cisco 1200",
    family:      "switch",
    vendor:      "cisco",
    autoMdix:    true,
    portGroups: [
      {
        template:      "Console",
        count:         1,
        startIndex:    0,
        portType:      PORT_TYPES.SERIAL,
        connectorType: CONNECTOR_TYPES.DB9_RJ45,
        speedBps:      9600,
        fullDuplex:    false,
      },
      {
        template:      "GigabitEthernet1/0/{n}",
        count:         24,
        startIndex:    1,
        portType:      PORT_TYPES.ETHERNET,
        connectorType: CONNECTOR_TYPES.RJ45,
        speedBps:      1_000_000_000,   // 1 Gbps
        fullDuplex:    true,
      },
    ],
    model3D: "/objects/devices/switches/1200.glb",
  },

  "1300": {
    modelId:     "1300",
    displayName: "Cisco 1300",
    family:      "switch",
    vendor:      "cisco",
    autoMdix:    true,
    portGroups: [
      {
        template:      "Console",
        count:         1,
        startIndex:    0,
        portType:      PORT_TYPES.SERIAL,
        connectorType: CONNECTOR_TYPES.DB9_RJ45,
        speedBps:      9600,
        fullDuplex:    false,
      },
      {
        template:      "GigabitEthernet1/0/{n}",
        count:         24,
        startIndex:    1,
        portType:      PORT_TYPES.ETHERNET,
        connectorType: CONNECTOR_TYPES.RJ45,
        speedBps:      1_000_000_000,
        fullDuplex:    true,
      },
    ],
    model3D: "/objects/devices/switches/1300.glb",
  },

  "2960": {
    modelId:     "2960",
    displayName: "Cisco 2960",
    family:      "switch",
    vendor:      "cisco",
    autoMdix:    true,   // 2960 supports Auto-MDIX (IOS 12.2(25)FX+)
    portGroups: [
      {
        template:      "Console",
        count:         1,
        startIndex:    0,
        portType:      PORT_TYPES.SERIAL,
        connectorType: CONNECTOR_TYPES.DB9_RJ45,
        speedBps:      9600,
        fullDuplex:    false,
      },
      {
        template:      "FastEthernet0/{n}",
        count:         24,
        startIndex:    1,
        portType:      PORT_TYPES.ETHERNET,
        connectorType: CONNECTOR_TYPES.RJ45,
        speedBps:      100_000_000,     // 100 Mbps
        fullDuplex:    true,
      },
      {
        template:      "GigabitEthernet0/{n}",
        count:         2,
        startIndex:    1,
        portType:      PORT_TYPES.ETHERNET,
        connectorType: CONNECTOR_TYPES.SFP,
        speedBps:      1_000_000_000,
        fullDuplex:    true,
      },
    ],
    model3D: "/objects/devices/switches/2960-switch.glb",
  },

  "9200": {
    modelId:     "9200",
    displayName: "Cisco 9200",
    family:      "switch",
    vendor:      "cisco",
    autoMdix:    true,
    portGroups: [
      {
        template:      "Console",
        count:         1,
        startIndex:    0,
        portType:      PORT_TYPES.SERIAL,
        connectorType: CONNECTOR_TYPES.DB9_RJ45,
        speedBps:      9600,
        fullDuplex:    false,
      },
      {
        template:      "GigabitEthernet1/0/{n}",
        count:         48,
        startIndex:    1,
        portType:      PORT_TYPES.ETHERNET,
        connectorType: CONNECTOR_TYPES.RJ45,
        speedBps:      1_000_000_000,
        fullDuplex:    true,
      },
    ],
    model3D: "/objects/devices/switches/9200.glb",
  },

  "110": {
    modelId:     "110",
    displayName: "Cisco 110",
    family:      "switch",
    vendor:      "cisco",
    autoMdix:    true,
    portGroups: [
      {
        template:      "Console",
        count:         1,
        startIndex:    0,
        portType:      PORT_TYPES.SERIAL,
        connectorType: CONNECTOR_TYPES.DB9_RJ45,
        speedBps:      9600,
        fullDuplex:    false,
      },
      {
        template:      "FastEthernet0/{n}",
        count:         8,
        startIndex:    1,
        portType:      PORT_TYPES.ETHERNET,
        connectorType: CONNECTOR_TYPES.RJ45,
        speedBps:      100_000_000,
        fullDuplex:    true,
      },
    ],
    model3D: "/objects/devices/switches/110.glb",
  },

  "220": {
    modelId:     "220",
    displayName: "Cisco 220",
    family:      "switch",
    vendor:      "cisco",
    autoMdix:    true,
    portGroups: [
      {
        template:      "Console",
        count:         1,
        startIndex:    1,
        portType:      PORT_TYPES.SERIAL,
        connectorType: CONNECTOR_TYPES.DB9_RJ45,
        speedBps:      9600,
        fullDuplex:    false,
      },
      {
        template:      "FastEthernet0/{n}",
        count:         24,
        startIndex:    1,
        portType:      PORT_TYPES.ETHERNET,
        connectorType: CONNECTOR_TYPES.RJ45,
        speedBps:      100_000_000,
        fullDuplex:    true,
      },
    ],
    model3D: "/objects/devices/switches/220.glb",
  },

  "350": {
    modelId:     "350",
    displayName: "Cisco 350",
    family:      "switch",
    vendor:      "cisco",
    autoMdix:    true,
    portGroups: [
      {
        template:      "Console",
        count:         1,
        startIndex:    0,
        portType:      PORT_TYPES.SERIAL,
        connectorType: CONNECTOR_TYPES.DB9_RJ45,
        speedBps:      9600,
        fullDuplex:    false,
      },
      {
        template:      "FastEthernet0/{n}",
        count:         48,
        startIndex:    1,
        portType:      PORT_TYPES.ETHERNET,
        connectorType: CONNECTOR_TYPES.RJ45,
        speedBps:      100_000_000,
        fullDuplex:    true,
      },
    ],
    model3D: "/objects/devices/switches/350.glb",
  },
};

// ---------------------------------------------------------------------------
// ROUTERS
// ---------------------------------------------------------------------------
const routers = {
  // Fixed: was missing portGroups entirely, used legacy interfaceTemplate only
  "1941": {
    modelId:     "1941",
    displayName: "Cisco 1941",
    family:      "router",
    vendor:      "cisco",
    autoMdix:    true,
    portGroups: [
      {
        template:      "Console",
        count:         1,
        startIndex:    0,
        portType:      PORT_TYPES.SERIAL,
        connectorType: CONNECTOR_TYPES.DB9_RJ45,
        speedBps:      9600,
        fullDuplex:    false,
      },
      {
        template:      "GigabitEthernet0/{n}",
        count:         2,
        startIndex:    0,
        portType:      PORT_TYPES.ETHERNET,
        connectorType: CONNECTOR_TYPES.RJ45,
        speedBps:      1_000_000_000,
        fullDuplex:    true,
      },
    ],
    model3D: "/objects/devices/routers/1941-router.glb",
  },

  "921": {
    modelId:     "921",
    displayName: "Cisco 921",
    family:      "router",
    vendor:      "cisco",
    autoMdix:    true,
    portGroups: [
      {
        template:      "Console",
        count:         1,
        startIndex:    0,
        portType:      PORT_TYPES.SERIAL,
        connectorType: CONNECTOR_TYPES.DB9_RJ45,
        speedBps:      9600,
        fullDuplex:    false,
      },
      {
        template:      "USB{n}",
        count:         1,
        startIndex:    1,
        portType:      PORT_TYPES.USB,
        connectorType: CONNECTOR_TYPES.USB_A,
        speedBps:      480_000_000,     // USB 2.0 Hi-Speed
        fullDuplex:    true,
      },
      {
        template:      "GigabitEthernet0/{n}",
        count:         4,
        startIndex:    0,
        portType:      PORT_TYPES.ETHERNET,
        connectorType: CONNECTOR_TYPES.RJ45,
        speedBps:      1_000_000_000,
        fullDuplex:    true,
      },
    ],
    model3D: "/objects/devices/routers/921.glb",
  },

  "926": {
    modelId:     "926",
    displayName: "Cisco 926",
    family:      "router",
    vendor:      "cisco",
    autoMdix:    true,
    portGroups: [
      {
        template:      "Console",
        count:         1,
        startIndex:    0,
        portType:      PORT_TYPES.SERIAL,
        connectorType: CONNECTOR_TYPES.DB9_RJ45,
        speedBps:      9600,
        fullDuplex:    false,
      },
      {
        template:      "USB{n}",
        count:         1,
        startIndex:    1,
        portType:      PORT_TYPES.USB,
        connectorType: CONNECTOR_TYPES.USB_A,
        speedBps:      480_000_000,
        fullDuplex:    true,
      },
      {
        template:      "GigabitEthernet0/{n}",
        count:         4,
        startIndex:    0,
        portType:      PORT_TYPES.ETHERNET,
        connectorType: CONNECTOR_TYPES.RJ45,
        speedBps:      1_000_000_000,
        fullDuplex:    true,
      },
    ],
    model3D: "/objects/devices/routers/926.glb",
  },

  "927": {
    modelId:     "927",
    displayName: "Cisco 927",
    family:      "router",
    vendor:      "cisco",
    autoMdix:    true,
    portGroups: [
      {
        template:      "Console",
        count:         1,
        startIndex:    0,
        portType:      PORT_TYPES.SERIAL,
        connectorType: CONNECTOR_TYPES.DB9_RJ45,
        speedBps:      9600,
        fullDuplex:    false,
      },
      {
        template:      "USB{n}",
        count:         1,
        startIndex:    1,
        portType:      PORT_TYPES.USB,
        connectorType: CONNECTOR_TYPES.USB_A,
        speedBps:      480_000_000,
        fullDuplex:    true,
      },
      {
        template:      "GigabitEthernet0/{n}",
        count:         4,
        startIndex:    0,
        portType:      PORT_TYPES.ETHERNET,
        connectorType: CONNECTOR_TYPES.RJ45,
        speedBps:      1_000_000_000,
        fullDuplex:    true,
      },
    ],
    model3D: "/objects/devices/routers/927.glb",
  },

  "931": {
    modelId:     "931",
    displayName: "Cisco 931",
    family:      "router",
    vendor:      "cisco",
    autoMdix:    true,
    portGroups: [
      {
        template:      "Console",
        count:         1,
        startIndex:    0,
        portType:      PORT_TYPES.SERIAL,
        connectorType: CONNECTOR_TYPES.DB9_RJ45,
        speedBps:      9600,
        fullDuplex:    false,
      },
      {
        template:      "USB{n}",
        count:         1,
        startIndex:    1,
        portType:      PORT_TYPES.USB,
        connectorType: CONNECTOR_TYPES.USB_A,
        speedBps:      480_000_000,
        fullDuplex:    true,
      },
      {
        template:      "GigabitEthernet0/{n}",
        count:         4,
        startIndex:    0,
        portType:      PORT_TYPES.ETHERNET,
        connectorType: CONNECTOR_TYPES.RJ45,
        speedBps:      1_000_000_000,
        fullDuplex:    true,
      },
    ],
    model3D: "/objects/devices/routers/931.glb",
  },
};

// ---------------------------------------------------------------------------
// END DEVICES
// ---------------------------------------------------------------------------
const endDevices = {
  "desktop": {
    modelId:     "desktop",
    displayName: "Desktop PC",
    family:      "end-device",
    vendor:      "generic",
    autoMdix:    true,
    portGroups: [
      {
        template:      "RS232",
        count:         1,
        startIndex:    0,
        portType:      PORT_TYPES.SERIAL,
        connectorType: CONNECTOR_TYPES.DB9_RJ45,
        speedBps:      9600,
        fullDuplex:    false,
      },
      {
        template:      "USB{n}",
        count:         2,
        startIndex:    0,
        portType:      PORT_TYPES.USB,
        connectorType: CONNECTOR_TYPES.USB_A,
        speedBps:      480_000_000,
        fullDuplex:    true,
      },
      {
        template:      "FastEthernet{n}",
        count:         1,
        startIndex:    1,
        portType:      PORT_TYPES.ETHERNET,
        connectorType: CONNECTOR_TYPES.RJ45,
        speedBps:      100_000_000,
        fullDuplex:    true,
      },
    ],
    model3D: "/objects/devices/end-devices/desktop.glb",
  },

  "laptop": {
    modelId:     "laptop",
    displayName: "Laptop",
    family:      "end-device",
    vendor:      "generic",
    autoMdix:    true,
    portGroups: [
      {
        template:      "RS232",
        count:         1,
        startIndex:    0,
        portType:      PORT_TYPES.SERIAL,
        connectorType: CONNECTOR_TYPES.DB9_RJ45,
        speedBps:      9600,
        fullDuplex:    false,
      },
      {
        template:      "USB{n}",
        count:         2,
        startIndex:    0,
        portType:      PORT_TYPES.USB,
        connectorType: CONNECTOR_TYPES.USB_A,
        speedBps:      480_000_000,
        fullDuplex:    true,
      },
      {
        template:      "FastEthernet{n}",
        count:         2,
        startIndex:    1,
        portType:      PORT_TYPES.ETHERNET,
        connectorType: CONNECTOR_TYPES.RJ45,
        speedBps:      100_000_000,
        fullDuplex:    true,
      },
    ],
    model3D: "/objects/devices/end-devices/ASUS-Laptop.glb",
  },

  "smartphone": {
    modelId:     "smartphone",
    displayName: "Smart Phone",
    family:      "end-device",
    vendor:      "generic",
    autoMdix:    false,
    portGroups: [
      {
        template:      "Wireless0",
        count:         1,
        startIndex:    0,
        portType:      PORT_TYPES.WIRELESS,
        connectorType: CONNECTOR_TYPES.WIRELESS,
        speedBps:      54_000_000,      // 802.11g baseline
        fullDuplex:    false,
      },
    ],
    model3D: "/objects/devices/end-devices/smartphone.glb",
  },
};

// ---------------------------------------------------------------------------
// IMPORTED DEVICES (runtime registry — populated by registerImportedDevice)
// ---------------------------------------------------------------------------
const importedDevices = {};

// ---------------------------------------------------------------------------
// CABLES
// All speeds in bps for consistency.
// ---------------------------------------------------------------------------
export const cables = {
  "console": {
    id:            "console",
    label:         "Console Cable",
    description:   "Rollover cable for out-of-band device management (RJ-45 to DB-9)",
    type:          "serial",
    speedBps:      9600,
    maxDistance:   15,           // metres
    fullDuplex:    false,
    connectorType: CONNECTOR_TYPES.DB9_RJ45,
    allowedPortTypes: [PORT_TYPES.SERIAL],
    visual: {
      color:      "#60A5FA",
      thickness:  0.02,
      dashArray:  [0.1, 0.1],
      opacity:    1.0,
    },
  },

  "copper-straight": {
    id:            "copper-straight",
    label:         "Straight-Through",
    description:   "Standard patch cable (T568B–T568B). Use for unlike devices.",
    type:          "ethernet",
    category:      "cat6",
    speedBps:      1_000_000_000,
    maxDistance:   100,
    fullDuplex:    true,
    connectorType: CONNECTOR_TYPES.RJ45,
    allowedPortTypes: [PORT_TYPES.ETHERNET],
    visual: {
      color:     "#000000",
      thickness: 0.03,
      opacity:   1.0,
    },
  },

  "copper-crossover": {
    id:            "copper-crossover",
    label:         "Cross-Over",
    description:   "Crossover cable (T568A–T568B). Legacy use for like devices without Auto-MDIX.",
    type:          "ethernet",
    category:      "cat6",
    speedBps:      1_000_000_000,
    maxDistance:   100,
    fullDuplex:    true,
    connectorType: CONNECTOR_TYPES.RJ45,
    allowedPortTypes: [PORT_TYPES.ETHERNET],
    visual: {
      color:     "#000000",
      thickness: 0.03,
      dashArray: [0.2, 0.2],
      opacity:   1.0,
    },
  },

  "USB": {
    id:            "USB",
    label:         "USB Cable",
    description:   "USB 2.0 Hi-Speed cable for console or storage access",
    type:          "usb",
    speedBps:      480_000_000,
    maxDistance:   5,
    fullDuplex:    true,
    connectorType: CONNECTOR_TYPES.USB_A,
    allowedPortTypes: [PORT_TYPES.USB],
    visual: {
      color:     "#000000",
      thickness: 0.03,
      opacity:   1.0,
    },
  },
};

// ---------------------------------------------------------------------------
// LOOKUP HELPERS
// ---------------------------------------------------------------------------

/**
 * Look up a catalog entry by modelId across all device families.
 * Returns the entry or null if not found.
 */
export function getCatalogEntry(catalogId) {
  return (
    switches[catalogId]      ||
    routers[catalogId]       ||
    endDevices[catalogId]    ||
    importedDevices[catalogId] ||
    null
  );
}

/**
 * Register a user-imported device into the runtime catalog.
 * The entry must include at least { modelId, portGroups[] }.
 */
export function registerImportedDevice(deviceEntry) {
  if (!deviceEntry?.modelId) {
    throw new Error("Imported device must include a modelId.");
  }
  importedDevices[deviceEntry.modelId] = {
    family:      "end-device",
    vendor:      "generic",
    autoMdix:    false,
    ...deviceEntry,
    displayName: deviceEntry.displayName || deviceEntry.modelId,
  };
  return importedDevices[deviceEntry.modelId];
}

// ---------------------------------------------------------------------------
// DEFAULT EXPORT
// ---------------------------------------------------------------------------
const deviceCatalog = { switches, routers, endDevices, importedDevices, cables };
export default deviceCatalog;