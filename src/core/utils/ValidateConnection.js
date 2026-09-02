import { cables, PORT_TYPES } from '../../data/deviceCatalog.js';

/**
 * validateConnection.js
 * 
 * Pre-flight checks before a Link is created between two PhysicalPorts.
 * All validation is done against PhysicalPort objects — no string inference.
 * 
 * Call this before constructing a Link. If valid, proceed with new Link({...}).
 * 
 * Usage:
 *   const result = validateConnection({
 *     cableType:  'copper-straight',
 *     sourcePort: device1.getPortByName('GigabitEthernet0/0'),
 *     targetPort: device2.getPortByName('GigabitEthernet0/1'),
 *   });
 *   if (!result.valid) { showError(result.error); return; }
 */

/**
 * @typedef {object} ValidationResult
 * @property {boolean}   valid
 * @property {string}    [error]    - User-facing error message (only when valid=false)
 * @property {string[]}  [warnings] - Non-blocking notices (e.g. Auto-MDIX correction)
 */

/**
 * Validate a proposed connection between two PhysicalPorts with a given cable type.
 * 
 * @param {object} opts
 * @param {string}  opts.cableType   - Key from cables{} (e.g. 'copper-straight')
 * @param {import('./PhysicalPort.js').default} opts.sourcePort
 * @param {import('./PhysicalPort.js').default} opts.targetPort
 * @returns {ValidationResult}
 */
export function validateConnection({ cableType, sourcePort, targetPort }) {
  const warnings = [];

  console.log('Validating: ', { cableType, sourcePort, targetPort });


  // ── Guard: ports must exist ────────────────────────────────────────────────
  if (!sourcePort || !targetPort) {
    return _fail('Please select a specific port on both devices.');
  }

  if (sourcePort === targetPort) {
    return _fail('A port cannot be connected to itself.');
  }

  // ── Guard: cable must be known ────────────────────────────────────────────
  const cable = cables[cableType];
  if (!cable) {
    return _fail(`Unrecognized cable type: "${cableType}".`);
  }

  // ── Guard: ports must be available ───────────────────────────────────────
  if (sourcePort.isOccupied) {
    return _fail(`Port ${sourcePort.name} is already in use.`);
  }
  if (targetPort.isOccupied) {
    return _fail(`Port ${targetPort.name} is already in use.`);
  }

  const isPortCompatible = (port, cable) => {
    if (!port.portType || !cable.type) return { compatible: true };

    if (port.portType === PORT_TYPES.SERIAL && cable.type !== PORT_TYPES.SERIAL) {
      return { compatible: false, reason: `Port "${port.name}" is a serial/console port and requires a console cable.` };
    }
    if (port.portType !== PORT_TYPES.SERIAL && cable.type === PORT_TYPES.SERIAL) {
      return { compatible: false, reason: `Port "${port.name}" is not a serial port. Use an Ethernet cable instead.` };
    }

    if (port.portType === PORT_TYPES.ETHERNET && cable.type !== PORT_TYPES.ETHERNET && cable.type !== 'ethernet') {
      return { compatible: false, reason: `Port "${port.name}" is an Ethernet port but the cable type doesn't match.` };
    }

    return { compatible: true };
  };

  // ── Cable ↔ Port type compatibility ──────────────────────────────────────
  const srcCompat = isPortCompatible(sourcePort, cable);
  if (!srcCompat.compatible) return _fail(srcCompat.reason);

  const tgtCompat = isPortCompatible(targetPort, cable);
  if (!tgtCompat.compatible) return _fail(tgtCompat.reason);

  // ── Ethernet-specific: Straight-Through vs Cross-Over ─────────────────────
  // 
  // Traditional rule (pre-Auto-MDIX):
  //   Unlike devices (switch↔router, switch↔PC) → straight-through
  //   Like devices   (switch↔switch, router↔router, PC↔PC) → crossover
  // 
  // Modern rule (Auto-MDIX, IEEE 802.3ab — supported on most gear since ~2003):
  //   Either cable works — the port corrects pin pairing automatically.
  //   We warn instead of blocking when Auto-MDIX is available on BOTH ends.
  //
  if (cable.type === PORT_TYPES.ETHERNET || cable.type === 'ethernet') {
    const srcDevice = sourcePort.interface?.device;
    const tgtDevice = targetPort.interface?.device;

    const isLikePair = _isLikeDevicePair(srcDevice?.type, tgtDevice?.type);
    const bothAutoMdix = sourcePort.autoMdix && targetPort.autoMdix;

    if (cableType === 'copper-straight' && isLikePair) {
      if (bothAutoMdix) {
        // Auto-MDIX corrects this — warn but allow
        warnings.push(
          `Both devices support Auto-MDIX, so a straight-through cable will work. ` +
          `A crossover cable is the traditional choice for ${srcDevice?.type}↔${tgtDevice?.type}.`
        );
      } else {
        return _fail(
          `Use a Cross-Over cable to connect ${srcDevice?.type ?? 'similar'} ↔ ${tgtDevice?.type ?? 'similar'} ` +
          `devices that do not support Auto-MDIX.`
        );
      }
    }

    if (cableType === 'copper-crossover' && !isLikePair) {
      if (bothAutoMdix) {
        warnings.push(
          `Both devices support Auto-MDIX, so a crossover cable will work. ` +
          `A straight-through cable is the conventional choice for unlike devices.`
        );
      } else {
        return _fail(
          `Use a Straight-Through cable to connect ` +
          `${srcDevice?.type ?? 'unlike'} ↔ ${tgtDevice?.type ?? 'unlike'} devices.`
        );
      }
    }
  }

  // ── Speed compatibility ───────────────────────────────────────────────────
  // Not a hard block — autoneg will settle on the lower speed — but warn
  // when speeds are very mismatched (e.g. GigE port on a 100Mbps cable).
  const cableSpeedBps = cable.speedBps;
  if (cableSpeedBps < sourcePort.speedBps || cableSpeedBps < targetPort.speedBps) {
    const toMbps = bps => `${(bps / 1_000_000).toFixed(0)} Mbps`;
    warnings.push(
      `Cable "${cable.label}" (${toMbps(cableSpeedBps)}) is slower than one or both ports. ` +
      `Link will operate at ${toMbps(Math.min(cableSpeedBps, sourcePort.speedBps, targetPort.speedBps))}.`
    );
  }

  return { valid: true, warnings };
}

// ---------------------------------------------------------------------------
// PRIVATE HELPERS
// ---------------------------------------------------------------------------

/**
 * Determine if two device types should be considered "like" devices
 * for the purposes of straight-through vs crossover cable selection.
 * 
 * "Like" means the TX/RX pins are wired the same way on both ends,
 * so a crossover is needed to flip them.
 * 
 * Cisco MDI/MDIX categories:
 *   MDI:   Routers, PCs, servers (transmit on pins 1,2)
 *   MDIX:  Switches, hubs (transmit on pins 3,6)
 * 
 * MDI↔MDI or MDIX↔MDIX = like → need crossover
 * MDI↔MDIX              = unlike → straight-through
 * 
 * @param {string} typeA
 * @param {string} typeB
 * @returns {boolean}
 */
function _isLikeDevicePair(typeA, typeB) {
  const MDI  = new Set(['router', 'end-device']); // transmit on pins 1,2
  const MDIX = new Set(['switch', 'hub']);          // transmit on pins 3,6

  const aIsMdi  = MDI.has(typeA);
  const bIsMdi  = MDI.has(typeB);
  const aIsMdix = MDIX.has(typeA);
  const bIsMdix = MDIX.has(typeB);

  // Both MDI or both MDIX = like pair
  return (aIsMdi && bIsMdi) || (aIsMdix && bIsMdix);
}

/**
 * Helper to build a failed ValidationResult.
 * @param {string} error
 * @returns {ValidationResult}
 */
function _fail(error) {
  return { valid: false, error };
}