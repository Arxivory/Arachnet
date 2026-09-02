/**
 * ResolvedCablePath.js
 *
 * Data class representing a fully resolved cable route through the building.
 *
 * A waypoint has the shape:
 * {
 *   type:   'device' | 'conduit' | 'riser' | 'underground_conduit'
 *   id:     string               — entity id
 *   label:  string               — human-readable label for UI
 *   x2d:    number               — canvas X used by Logical 2D renderer
 *   y2d:    number               — canvas Y used by Logical 2D renderer
 *   x:      number               — Three.js world X used by Physical 3D renderer
 *   y:      number               — Three.js world Y (vertical, includes altitude)
 *   z:      number               — Three.js world Z used by Physical 3D renderer
 * }
 *
 * status values:
 *   'direct'   — source and target are in the same space, no pathways needed
 *   'resolved' — full pathway chain found (conduits + risers / underground conduits)
 *   'partial'  — one or more pathway components missing; cable drawn through wall
 *                with an orange warning color in both modes
 */
export class ResolvedCablePath {
    /**
     * @param {object} opts
     * @param {string}   opts.cableId   - The logical Link / CableEntity id
     * @param {object[]} opts.waypoints - Ordered array of waypoint objects
     * @param {string[]} opts.warnings  - Human-readable warning strings
     * @param {string}   opts.status    - 'direct' | 'resolved' | 'partial'
     */
    constructor({ cableId, waypoints = [], warnings = [], status = 'direct' }) {
        this.cableId   = cableId;
        this.waypoints = waypoints;
        this.warnings  = warnings;
        this.status    = status;
    }

    /** True when the route is missing at least one required pathway component. */
    get isPartial() {
        return this.status === 'partial';
    }

    /** True when no inter-space routing was needed (same-space cable). */
    get isDirect() {
        return this.status === 'direct';
    }

    /** True when the full pathway chain was resolved successfully. */
    get isResolved() {
        return this.status === 'resolved';
    }

    /**
     * Returns only the Three.js Vector3-compatible objects for 3D rendering.
     * @returns {{ x: number, y: number, z: number }[]}
     */
    get worldPoints() {
        return this.waypoints.map(w => ({ x: w.x, y: w.y, z: w.z }));
    }

    /**
     * Returns only the 2D canvas coordinates for Logical Mode rendering.
     * @returns {{ x: number, y: number }[]}
     */
    get canvasPoints() {
        return this.waypoints.map(w => ({ x: w.x2d, y: w.y2d }));
    }
}

export default ResolvedCablePath;