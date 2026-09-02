/**
 * CableMesh.js — Updated to consume ResolvedCablePath
 *
 * Changes from original:
 *  - Accepts an optional resolvedPath (ResolvedCablePath) as 4th constructor arg
 *  - If resolvedPath has 2+ waypoints, builds a CatmullRomCurve3 through them
 *  - Falls back to the original QuadraticBezierCurve3 for direct (same-space) cables
 *  - Colors cable orange when status is 'partial' (missing pathway component)
 *  - update() also uses resolved waypoints if available
 */
import * as THREE from 'three';

export default class CableMesh {
    /**
     * @param {object} opts            - Link data object
     * @param {number} defaultScaler   - defaultScaler from PhysicalController
     * @param {Map}    deviceMeshes    - Map of deviceId → THREE.Object3D
     * @param {import('../../../core/cabling/ResolvedCablePath.js').ResolvedCablePath | null} resolvedPath
     */
    constructor(opts = {}, defaultScaler, deviceMeshes, resolvedPath = null) {
        this.id             = opts.id;
        this.cableType      = opts.cableType;
        this.sourceDeviceId = opts.sourcePort.id.split('::')[0];
        this.targetDeviceId = opts.targetPort.id.split('::')[0];
        this.resolvedPath   = resolvedPath;

        this.sourceDeviceMesh = deviceMeshes.get(this.sourceDeviceId);
        this.targetDeviceMesh = deviceMeshes.get(this.targetDeviceId);

        this.mesh = this._buildMesh();
    }

    // -------------------------------------------------------------------------
    // POSITIONS
    // -------------------------------------------------------------------------

    _getDevicePositions() {
        return {
            source: this.sourceDeviceMesh
                ? this.sourceDeviceMesh.getWorldPosition(new THREE.Vector3())
                : new THREE.Vector3(),
            target: this.targetDeviceMesh
                ? this.targetDeviceMesh.getWorldPosition(new THREE.Vector3())
                : new THREE.Vector3(),
        };
    }

    /**
     * Build the ordered array of THREE.Vector3 points for the cable curve.
     * Uses resolved waypoints when available, falls back to a drooping bezier.
     */
    _buildCurvePoints() {
        const { source, target } = this._getDevicePositions();

        // Use resolved path waypoints if we have a routed path
        if (
            this.resolvedPath &&
            !this.resolvedPath.isDirect &&
            this.resolvedPath.waypoints.length >= 2
        ) {
            const pts = this.resolvedPath.worldPoints;

            // Override first/last with the actual live device mesh positions
            // so the cable always connects precisely to the current device location
            const points = pts.map((p, i) => {
                if (i === 0) return source.clone();
                if (i === pts.length - 1) return target.clone();
                return new THREE.Vector3(p.x, p.y, p.z);
            });

            return points;
        }

        // Fallback: original drooping bezier for same-space / unresolved cables
        const mid = new THREE.Vector3()
            .addVectors(source, target)
            .multiplyScalar(0.5);
        mid.y -= 1.5;

        // Return 5 interpolated points from the quadratic bezier so
        // CatmullRomCurve3 can still be used uniformly below
        const bezier = new THREE.QuadraticBezierCurve3(source, mid, target);
        return bezier.getPoints(4);
    }

    // -------------------------------------------------------------------------
    // BUILD / UPDATE
    // -------------------------------------------------------------------------

    _buildMesh() {
        const points    = this._buildCurvePoints();
        const isPartial = this.resolvedPath?.isPartial ?? false;
        const color     = isPartial ? 0xf97316 : 0x333333;

        const geometry  = this._buildGeometry(points);
        const material  = new THREE.MeshBasicMaterial({ color });
        return new THREE.Mesh(geometry, material);
    }

    _buildGeometry(points) {
        if (points.length < 2) return new THREE.BufferGeometry();

        // Use LineCurve3 segments for sharp angular routing
        const path = new THREE.CurvePath();
        for (let i = 0; i < points.length - 1; i++) {
            path.add(new THREE.LineCurve3(points[i], points[i + 1]));
        }

        // Low tubularSegments per segment keeps it tight and sharp
        const segments = Math.max(points.length - 1, 1) * 4;
        return new THREE.TubeGeometry(path, segments, 0.08, 6, false);
    }

    update() {
        const points    = this._buildCurvePoints();
        const isPartial = this.resolvedPath?.isPartial ?? false;
        const color     = isPartial ? 0xf97316 : 0x333333;

        this.mesh.geometry.dispose();
        this.mesh.geometry = this._buildGeometry(points);
        this.mesh.material.color.setHex(color);
    }

    /**
     * Update the resolved path and rebuild.
     * Called when a device, conduit, or riser is moved.
     * @param {import('../../../core/cabling/ResolvedCablePath.js').ResolvedCablePath} resolvedPath
     */
    updateResolvedPath(resolvedPath) {
        this.resolvedPath = resolvedPath;
        this.update();
    }

    getMesh() {
        return this.mesh;
    }
}