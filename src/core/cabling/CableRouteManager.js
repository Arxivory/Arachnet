/**
 * CableRouteManager.js
 *
 * Manages all resolved cable paths across the entire network.
 * Shared between LogicalLayout (2D) and PhysicalController (3D) so both
 * modes consume the same resolved route data.
 *
 * Usage:
 *   // In PhysicalController constructor:
 *   this.routeManager = new CableRouteManager(appState.structural, 0.7);
 *
 *   // Before rendering cables:
 *   this.routeManager.resolveAll(links, devices);
 *
 *   // When creating a single cable mesh:
 *   const path = this.routeManager.getPath(link.id);
 *
 *   // In LogicalLayout, after a new cable is created:
 *   this.routeManager.resolveOne(link, sourceDevice, targetDevice);
 */

import { CableRouteResolver } from './CableRouteResolver.js';

export class CableRouteManager {
    /**
     * @param {object} structuralStore - appState.structural
     * @param {number} scaler          - defaultScaler from PhysicalController (default 0.7)
     */
    constructor(structuralStore, scaler = 0.7) {
        this.resolver = new CableRouteResolver(structuralStore, scaler);
        /** @type {Map<string, import('./ResolvedCablePath.js').ResolvedCablePath>} */
        this.paths    = new Map();
    }

    // -------------------------------------------------------------------------
    // RESOLUTION
    // -------------------------------------------------------------------------

    /**
     * Resolve routes for all links at once.
     * Called when switching to Physical Mode or on full state sync.
     *
     * @param {object[]} links   - All links from NetworkStore
     * @param {object[]} devices - All devices from NetworkStore
     */
    resolveAll(links, devices, force = false) {
        const deviceMap = new Map(devices.map(d => [d.id, d]));

        for (const link of links) {
            // Skip if already resolved and not explicitly forced.
            if (!force && this.paths.has(link.id)) continue;

            const srcId = link.sourcePort?.id?.split('::')[0] ?? link.sourceId;
            const dstId = link.targetPort?.id?.split('::')[0] ?? link.targetId;

            const srcDevice = deviceMap.get(srcId);
            const dstDevice = deviceMap.get(dstId);

            if (!srcDevice || !dstDevice) {
                console.warn(`[CableRouteManager] Could not find devices for link ${link.id}`);
                continue;
            }

            const resolved = this.resolver.resolve(link, srcDevice, dstDevice);

            if (resolved.warnings.length > 0) {
                resolved.warnings.forEach(w =>
                    console.warn(`[CableRouteManager] Link ${link.id}: ${w}`)
                );
            }

            this.paths.set(link.id, resolved);
        }

        // Remove stale paths for links that no longer exist
        const activeLinkIds = new Set(links.map(l => l.id));
        for (const [id] of this.paths) {
            if (!activeLinkIds.has(id)) {
                this.paths.delete(id);
            }
        }
    }

    /**
     * Resolve a single link immediately.
     * Called when a new cable is created in LogicalLayout so Logical 2D
     * can immediately display the routed path.
     *
     * @param {object} link
     * @param {object} sourceDevice
     * @param {object} targetDevice
     * @returns {import('./ResolvedCablePath.js').ResolvedCablePath}
     */
    resolveOne(link, sourceDevice, targetDevice) {
        const resolved = this.resolver.resolve(link, sourceDevice, targetDevice);

        if (resolved.warnings.length > 0) {
            resolved.warnings.forEach(w =>
                console.warn(`[CableRouteManager] Link ${link.id}: ${w}`)
            );
        }

        this.paths.set(link.id, resolved);
        return resolved;
    }

    /**
     * Force recompute routes for all links.
     * Use this when structural path components move or are deleted.
     *
     * @param {object[]} links
     * @param {object[]} devices
     */
    reResolveAll(links, devices) {
        this.paths.clear();
        this.resolveAll(links, devices, true);
    }

    /**
     * Force re-resolution of a specific link.
     * Call this when a conduit, riser, or device is moved so the affected
     * cable route is recomputed.
     *
     * @param {string} linkId
     * @param {object[]} links
     * @param {object[]} devices
     */
    reResolve(linkId, links, devices) {
        this.paths.delete(linkId);
        const link = links.find(l => l.id === linkId);
        if (!link) return;

        const deviceMap = new Map(devices.map(d => [d.id, d]));
        const srcId     = link.sourcePort?.id?.split('::')[0] ?? link.sourceId;
        const dstId     = link.targetPort?.id?.split('::')[0] ?? link.targetId;
        const srcDevice = deviceMap.get(srcId);
        const dstDevice = deviceMap.get(dstId);

        if (srcDevice && dstDevice) {
            const resolved = this.resolver.resolve(link, srcDevice, dstDevice);
            this.paths.set(linkId, resolved);
        }
    }

    /**
     * Re-resolve all links that touch a given device.
     * Call this when a device is moved via GizmoManager.
     *
     * @param {string}   deviceId
     * @param {object[]} links
     * @param {object[]} devices
     */
    reResolveForDevice(deviceId, links, devices) {
        const affected = links.filter(l => {
            const srcId = l.sourcePort?.id?.split('::')[0] ?? l.sourceId;
            const dstId = l.targetPort?.id?.split('::')[0] ?? l.targetId;
            return srcId === deviceId || dstId === deviceId;
        });

        for (const link of affected) {
            this.reResolve(link.id, links, devices);
        }
    }

    // -------------------------------------------------------------------------
    // ACCESS
    // -------------------------------------------------------------------------

    /**
     * Get the resolved path for a link.
     * Returns null if the link has not been resolved yet.
     *
     * @param {string} linkId
     * @returns {import('./ResolvedCablePath.js').ResolvedCablePath | null}
     */
    getPath(linkId) {
        return this.paths.get(linkId) ?? null;
    }

    /**
     * Returns all partial (warning) paths — useful for displaying a
     * summary panel of unresolved cable routes.
     * @returns {import('./ResolvedCablePath.js').ResolvedCablePath[]}
     */
    getPartialPaths() {
        return [...this.paths.values()].filter(p => p.isPartial);
    }

    /**
     * Clear all resolved paths. Call this when the user performs a
     * full reset or loads a new project.
     */
    clear() {
        this.paths.clear();
    }
}

export default CableRouteManager;