/**
 * CableRouteResolver.js
 *
 * Core cable route resolution engine. Pure logic — no Three.js, no canvas.
 *
 * Given a link (cable) and its source/target devices, resolves the ordered
 * list of physical pathway waypoints the cable must travel through, based on
 * the structural components declared by the user (conduits, risers,
 * underground conduits).
 *
 * Scenarios handled:
 *  1. Same space             → direct, no pathways
 *  2. Same floor, diff space → conduit (src) → conduit (dst)
 *  3. Diff floor, same site  → conduit → riser → conduit
 *  4. Diff site, same domain → conduit → riser → underground conduit → riser → conduit
 *
 * In all cross-boundary cases, if a required pathway component is missing,
 * the cable is still routed (using the device position directly) but the
 * ResolvedCablePath is marked 'partial' and carries warning strings.
 *
 * Coordinate output:
 *  Each waypoint carries both:
 *   - x2d / y2d  → original 2D canvas coordinates (for Logical Mode rendering)
 *   - x / y / z  → Three.js world coordinates (for Physical Mode rendering)
 *     computed as: worldX = x2d * scaler, worldY = altitude + 2, worldZ = y2d * scaler
 */

import { ResolvedCablePath } from './ResolvedCablePath.js';

export class CableRouteResolver {
    /**
     * @param {import('../../state/stores/StructuralStore.js').StructuralStore} structuralStore
     * @param {number} scaler - The same defaultScaler used by PhysicalController (default 0.7)
     */
    constructor(structuralStore, scaler = 0.7) {
        this.store  = structuralStore;
        this.scaler = scaler;
    }

    // -------------------------------------------------------------------------
    // PUBLIC API
    // -------------------------------------------------------------------------

    /**
     * Resolve the cable route for a given link.
     *
     * @param {object} link         - The logical Link / CableEntity
     * @param {object} sourceDevice - The source device data object (from NetworkStore)
     * @param {object} targetDevice - The target device data object (from NetworkStore)
     * @returns {ResolvedCablePath}
     */
    resolve(link, sourceDevice, targetDevice) {
        const src = this._getDeviceContext(sourceDevice);
        const dst = this._getDeviceContext(targetDevice);

        // ── Scenario 1: Same space ─────────────────────────────────────────────
        if (src.spaceId && src.spaceId === dst.spaceId) {
            return new ResolvedCablePath({
                cableId:   link.id,
                waypoints: [
                    this._deviceWaypoint(sourceDevice),
                    this._deviceWaypoint(targetDevice),
                ],
                warnings: [],
                status:   'direct',
            });
        }

        // ── Scenario 2: Same floor, different spaces ───────────────────────────
        if (src.floorId && src.floorId === dst.floorId) {
            return this._resolveHorizontal(link, sourceDevice, targetDevice, src, dst);
        }

        // ── Scenario 3: Different floors, same site ────────────────────────────
        if (src.siteId && src.siteId === dst.siteId) {
            return this._resolveVertical(link, sourceDevice, targetDevice, src, dst);
        }

        // ── Scenario 4: Different sites (inter-building) ──────────────────────
        if (src.domainId && src.domainId === dst.domainId) {
            return this._resolveInterBuilding(link, sourceDevice, targetDevice, src, dst);
        }

        // ── Fallback: different domains or no hierarchy info ───────────────────
        return new ResolvedCablePath({
            cableId:   link.id,
            waypoints: [
                this._deviceWaypoint(sourceDevice),
                this._deviceWaypoint(targetDevice),
            ],
            warnings: ['Cannot resolve route: devices are in different domains or missing hierarchy context.'],
            status:   'partial',
        });
    }

    // -------------------------------------------------------------------------
    // SCENARIO RESOLVERS
    // -------------------------------------------------------------------------

    /**
     * Scenario 2: Same floor, different spaces.
     * Route: device_src → conduit_src → conduit_dst → device_dst
     */
    _resolveHorizontal(link, srcDevice, dstDevice, src, dst) {
        const warnings  = [];
        const waypoints = [];

        waypoints.push(this._deviceWaypoint(srcDevice));

        // Find nearest conduit to source device in its space or floor
        const srcConduit = this._findNearestConduit(srcDevice, src);
        if (srcConduit) {
            waypoints.push(this._conduitWaypoint(srcConduit, src.floorId));
        } else {
            warnings.push(
                `No conduit found in source space/floor for device "${srcDevice.hostname || srcDevice.id}". ` +
                `Cable passes through wall directly.`
            );
        }

        // Find nearest conduit to target device in its space or floor
        const dstConduit = this._findNearestConduit(dstDevice, dst);
        if (dstConduit) {
            waypoints.push(this._conduitWaypoint(dstConduit, dst.floorId));
        } else {
            warnings.push(
                `No conduit found in destination space/floor for device "${dstDevice.hostname || dstDevice.id}". ` +
                `Cable passes through wall directly.`
            );
        }

        waypoints.push(this._deviceWaypoint(dstDevice));

        return new ResolvedCablePath({
            cableId:   link.id,
            waypoints,
            warnings,
            status:    warnings.length > 0 ? 'partial' : 'resolved',
        });
    }

    /**
     * Scenario 3: Different floors, same site.
     * Route: device_src → conduit_src → riser → conduit_dst → device_dst
     */
    _resolveVertical(link, srcDevice, dstDevice, src, dst) {
        const warnings  = [];
        const waypoints = [];

        waypoints.push(this._deviceWaypoint(srcDevice));

        const srcConduit = this._findNearestConduit(srcDevice, src);
        if (srcConduit) {
            waypoints.push(this._conduitWaypoint(srcConduit, src.floorId));
        } else {
            warnings.push(
                `No conduit found in source space/floor for device "${srcDevice.hostname || srcDevice.id}".`
            );
        }

        // Find riser connecting src floor to dst floor
        const riser = this._findRiserBetweenFloors(src.floorId, dst.floorId);
        if (riser) {
            // Riser has two waypoints — entry at src floor altitude, exit at dst floor altitude
            waypoints.push(this._riserEntryWaypoint(riser, src.floorId));
            waypoints.push(this._riserExitWaypoint(riser, dst.floorId));
        } else {
            warnings.push(
                `No riser found connecting floor "${src.floorId}" to floor "${dst.floorId}". ` +
                `Cable routed directly between floors.`
            );
            // Insert a midpoint in 3D space between the two floors so the cable
            // at least visually goes up/down rather than cutting diagonally
            waypoints.push(this._floorTransitionWaypoint(srcDevice, dstDevice, src, dst));
        }

        const dstConduit = this._findNearestConduit(dstDevice, dst);
        if (dstConduit) {
            waypoints.push(this._conduitWaypoint(dstConduit, dst.floorId));
        } else {
            warnings.push(
                `No conduit found in destination space/floor for device "${dstDevice.hostname || dstDevice.id}".`
            );
        }

        waypoints.push(this._deviceWaypoint(dstDevice));

        return new ResolvedCablePath({
            cableId:   link.id,
            waypoints,
            warnings,
            status:    warnings.length > 0 ? 'partial' : 'resolved',
        });
    }

    /**
     * Scenario 4: Different sites (inter-building).
     * Route: device_src → conduit_src → riser_src? → ug_conduit → riser_dst? → conduit_dst → device_dst
     */
    _resolveInterBuilding(link, srcDevice, dstDevice, src, dst) {
        const warnings  = [];
        const waypoints = [];

        waypoints.push(this._deviceWaypoint(srcDevice));

        // Source building: floor-level routing to underground conduit endpoint
        const srcConduit = this._findNearestConduit(srcDevice, src);
        if (srcConduit) {
            waypoints.push(this._conduitWaypoint(srcConduit, src.floorId));
        } else {
            warnings.push(`No conduit found in source building for device "${srcDevice.hostname || srcDevice.id}".`);
        }

        // If source device is not on ground floor, route down through a riser first
        if (!this._isGroundFloor(src.floorId)) {
            const groundFloorId = this._findGroundFloor(src.siteId);
            const riser = this._findRiserBetweenFloors(src.floorId, groundFloorId);
            if (riser) {
                waypoints.push(this._riserEntryWaypoint(riser, src.floorId));
                waypoints.push(this._riserExitWaypoint(riser, groundFloorId));
            } else {
                warnings.push(`No riser found to route from floor "${src.floorId}" to ground in source building.`);
            }
        }

        // Underground conduit between the two sites
        const ugConduit = this._findUndergroundConduit(src.siteId, dst.siteId);
        if (ugConduit) {
            waypoints.push(this._ugConduitEntryWaypoint(ugConduit, src.siteId));
            waypoints.push(this._ugConduitExitWaypoint(ugConduit, dst.siteId));
        } else {
            warnings.push(
                `No underground conduit found between buildings. ` +
                `Cable cannot be routed between sites.`
            );
        }

        // Destination building: route up from ground floor if needed
        if (!this._isGroundFloor(dst.floorId)) {
            const groundFloorId = this._findGroundFloor(dst.siteId);
            const riser = this._findRiserBetweenFloors(groundFloorId, dst.floorId);
            if (riser) {
                waypoints.push(this._riserEntryWaypoint(riser, groundFloorId));
                waypoints.push(this._riserExitWaypoint(riser, dst.floorId));
            } else {
                warnings.push(`No riser found to route from ground to floor "${dst.floorId}" in destination building.`);
            }
        }

        const dstConduit = this._findNearestConduit(dstDevice, dst);
        if (dstConduit) {
            waypoints.push(this._conduitWaypoint(dstConduit, dst.floorId));
        } else {
            warnings.push(`No conduit found in destination building for device "${dstDevice.hostname || dstDevice.id}".`);
        }

        waypoints.push(this._deviceWaypoint(dstDevice));

        return new ResolvedCablePath({
            cableId:   link.id,
            waypoints,
            warnings,
            status:    warnings.length > 0 ? 'partial' : 'resolved',
        });
    }

    // -------------------------------------------------------------------------
    // PATHWAY FINDERS
    // -------------------------------------------------------------------------

    _getConduitFloorId(c) {
        if (c.floorId) return c.floorId;
        if (c.spaceId) {
            const space = this.store.spaces.find(s => s.id === c.spaceId);
            if (space) return space.floorId;
        }
        return null;
    }

    /**
     * Find the conduit nearest to a device, searching in the device's space first,
     * then falling back to its floor.
     *
     * @param {object} device
     * @param {{ spaceId, floorId }} context
     * @returns {object|null} conduit data object or null
     */
    _findNearestConduit(device, context) {
        const allConduits = this.store.conduits || [];

        // Step 1: Try conduits in the SAME space first
        const spaceConduits = context.spaceId
            ? allConduits.filter(c => c.spaceId === context.spaceId)
            : [];

        if (spaceConduits.length > 0) {
            return this._pickNearest(spaceConduits, device);
        }

        // Step 2: Try conduits on the same floor that have NO space assignment
        // (floor-level conduits, not belonging to any specific room)
        const floorOnlyConduits = context.floorId
            ? allConduits.filter(c => this._getConduitFloorId(c) === context.floorId && !c.spaceId)
            : [];

        if (floorOnlyConduits.length > 0) {
            return this._pickNearest(floorOnlyConduits, device);
        }

        // Step 3: Try ANY conduit on the same floor
        const floorConduits = context.floorId
            ? allConduits.filter(c => this._getConduitFloorId(c) === context.floorId)
            : [];

        if (floorConduits.length > 0) {
            return this._pickNearest(floorConduits, device);
        }

        // Step 4: No valid conduit found
        return null;
    }

    _pickNearest(conduits, device) {
        // device coordinates are scaled by this.scaler, conduit coordinates are raw 2D canvas
        const devX = (device.transform?.position?.x ?? 0) / this.scaler;
        const devY = (device.transform?.position?.z ?? 0) / this.scaler;

        return conduits.reduce((nearest, c) => {
            const dist = Math.hypot(
                c.transform.position.x - devX,
                c.transform.position.z - devY
            );
            const nearestDist = Math.hypot(
                nearest.transform.position.x - devX,
                nearest.transform.position.z - devY
            );
            return dist < nearestDist ? c : nearest;
        });
    }

    _findRiserBetweenFloors(floorAId, floorBId) {
        const allRisers = this.store.risers || [];

        // Collect altitude for comparison
        const floorA = this.store.floors.find(f => f.id === floorAId);
        const floorB = this.store.floors.find(f => f.id === floorBId);
        if (!floorA || !floorB) return null;

        const altA = floorA.altitude || 0;
        const altB = floorB.altitude || 0;
        const minAlt = Math.min(altA, altB);
        const maxAlt = Math.max(altA, altB);

        // A riser must be in the same site as both floors
        const siteId = floorA.siteId;

        // Find a riser whose floorId is on the lower floor and that is in the same site
        // For simplicity: a riser placed on either floor in the same site works
        return allRisers.find(r => {
            const rFloorId = r.floorId || (r.spaceId ? this.store.spaces.find(s => s.id === r.spaceId)?.floorId : null);
            const riserFloor = this.store.floors.find(f => f.id === rFloorId);
            if (!riserFloor || riserFloor.siteId !== siteId) return false;
            const rAlt = riserFloor.altitude || 0;
            // Riser must be at or between the two floor altitudes
            return rAlt >= minAlt && rAlt <= maxAlt;
        }) || null;
    }

    /**
     * Find an underground conduit connecting two sites.
     *
     * @param {string} siteAId
     * @param {string} siteBId
     * @returns {object|null}
     */
    _findUndergroundConduit(siteAId, siteBId) {
        const all = this.store.undergroundConduits || [];
        return all.find(uc =>
            (uc.siteAId === siteAId && uc.siteBId === siteBId) ||
            (uc.siteAId === siteBId && uc.siteBId === siteAId)
        ) || null;
    }

    // -------------------------------------------------------------------------
    // CONTEXT HELPERS
    // -------------------------------------------------------------------------

    _getDeviceContext(device) {
        console.log('Device Context for Cable Resolution: ', device);
        return {
            spaceId:  device.spaceId  || null,
            floorId:  device.floorId  || null,
            siteId:   device.siteId   || null,
            domainId: device.domainId || null,
        };
    }

    _isGroundFloor(floorId) {
        const floor = this.store.floors.find(f => f.id === floorId);
        return !floor || (floor.altitude || 0) === 0;
    }

    _findGroundFloor(siteId) {
        const siteFloors = this.store.floors.filter(f => f.siteId === siteId);
        if (siteFloors.length === 0) return null;
        return siteFloors.reduce((lowest, f) =>
            (f.altitude || 0) < (lowest.altitude || 0) ? f : lowest
        ).id;
    }

    // -------------------------------------------------------------------------
    // WAYPOINT BUILDERS
    // Each builder returns a waypoint object with both 2D and 3D coordinates.
    // -------------------------------------------------------------------------

    /**
     * Convert 2D canvas position + floorId to a full waypoint object.
     * @param {number} x2d  - Canvas X coordinate
     * @param {number} y2d  - Canvas Y coordinate (which maps to 3D Z)
     * @param {string} floorId
     * @param {string} type
     * @param {string} id
     * @param {string} label
     * @returns {object} waypoint
     */
    _makeWaypoint(x2d, y2d, floorId, type, id, label) {
        const floor    = this.store.floors.find(f => f.id === floorId);
        const altitude = floor?.altitude || 0;

        const yOffset = (type === 'conduit') ? 1.5 : 2;

        return {
            type, id, label, x2d, y2d,
            x:  x2d * this.scaler,
            y:  altitude + yOffset,
            z:  y2d * this.scaler,
        };
    }

    _deviceWaypoint(device) {
        // Device transform position is stored as 3D but x/z map back to 2D canvas
        const pos  = device.transform?.position || { x: 0, y: 0, z: 0 };
        const floor = this.store.floors.find(f => f.id === device.floorId);
        const altitude = floor?.altitude || 0;
        return {
            type:  'device',
            id:    device.id,
            label: device.hostname || device.id,
            x2d:   pos.x / this.scaler,   // reverse-convert from stored 3D back to 2D
            y2d:   pos.z / this.scaler,
            x:     pos.x,
            y:     altitude + 2,
            z:     pos.z,
        };
    }

    _conduitWaypoint(conduit, floorId) {
        return this._makeWaypoint(
            conduit.transform.position.x,
            conduit.transform.position.z,
            floorId,
            'conduit',
            conduit.id,
            conduit.label || `Conduit ${conduit.id}`
        );
    }

    _riserEntryWaypoint(riser, floorId) {
        const floor    = this.store.floors.find(f => f.id === floorId);
        const altitude = floor?.altitude || 0;
        return {
            type:  'riser',
            id:    riser.id,
            label: riser.label || `Riser ${riser.id}`,
            x2d:   riser.transform.position.x,
            y2d:   riser.transform.position.z,
            x:     riser.transform.position.x * this.scaler,
            y:     altitude + 2,
            z:     riser.transform.position.z * this.scaler,
        };
    }

    _riserExitWaypoint(riser, floorId) {
        const floor    = this.store.floors.find(f => f.id === floorId);
        const altitude = floor?.altitude || 0;
        return {
            type:  'riser',
            id:    riser.id,
            label: riser.label || `Riser ${riser.id}`,
            x2d:   riser.transform.position.x,
            y2d:   riser.transform.position.z,
            x:     riser.transform.position.x * this.scaler,
            y:     altitude + 2,
            z:     riser.transform.position.z * this.scaler,
        };
    }

    _ugConduitEntryWaypoint(ugConduit, siteId) {
        // Underground conduit endpoints: siteA end or siteB end
        const isSiteA = ugConduit.siteAId === siteId;
        const pos = isSiteA
            ? ugConduit.transform.position
            : ugConduit.transformB?.position || ugConduit.transform.position;
        return {
            type:  'underground_conduit',
            id:    ugConduit.id,
            label: ugConduit.label || `Underground Conduit ${ugConduit.id}`,
            x2d:   pos.x,
            y2d:   pos.z,
            x:     pos.x * this.scaler,
            y:     -1.5,                  // underground: below ground plane
            z:     pos.z * this.scaler,
        };
    }

    _ugConduitExitWaypoint(ugConduit, siteId) {
        const isSiteA = ugConduit.siteAId === siteId;
        const pos = isSiteA
            ? ugConduit.transform.position
            : ugConduit.transformB?.position || ugConduit.transform.position;
        return {
            type:  'underground_conduit',
            id:    ugConduit.id,
            label: ugConduit.label || `Underground Conduit ${ugConduit.id}`,
            x2d:   pos.x,
            y2d:   pos.z,
            x:     pos.x * this.scaler,
            y:     -1.5,
            z:     pos.z * this.scaler,
        };
    }

    /**
     * Fallback waypoint when no riser is found between two floors.
     * Creates a midpoint in 3D space between the two floor altitudes so the
     * cable at least travels vertically rather than diagonally.
     */
    _floorTransitionWaypoint(srcDevice, dstDevice, src, dst) {
        const floorA   = this.store.floors.find(f => f.id === src.floorId);
        const floorB   = this.store.floors.find(f => f.id === dst.floorId);
        const altA     = floorA?.altitude || 0;
        const altB     = floorB?.altitude || 0;
        const midAlt   = (altA + altB) / 2;

        const srcPos   = srcDevice.transform?.position || { x: 0, z: 0 };
        return {
            type:  'conduit',         // treated as generic routing point
            id:    `transition_${src.floorId}_${dst.floorId}`,
            label: 'Floor transition',
            x2d:   srcPos.x / this.scaler,
            y2d:   srcPos.z / this.scaler,
            x:     srcPos.x,
            y:     midAlt + 2,
            z:     srcPos.z,
        };
    }
}

export default CableRouteResolver;