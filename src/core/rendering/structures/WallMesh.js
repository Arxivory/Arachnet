import * as THREE from 'three';

export default class WallMesh {
    constructor(opts={}, defaultScaler) {
        this.id = opts.id;
        this.type = opts.type;
        this.defaultHeight = 50.0;
        this.scaler = defaultScaler;

        this.startPoint = opts.geometry.start;
        this.endPoint = opts.geometry.end;
        this.t = 0.7;
    }

    getWallMesh() {
        const x1 = this.startPoint.x * this.scaler;
        const z1 = this.startPoint.y * this.scaler;
        const x2 = this.endPoint.x * this.scaler;
        const z2 = this.endPoint.y * this.scaler;

        const dx = x2 - x1;
        const dz = z2 - z1;
        const length = Math.sqrt(dx * dx + dz * dz);

        // Create a local shape centered at (0,0) to avoid double-offsetting
        const shape = new THREE.Shape();
        const halfL = length / 2;
        const halfT = this.t / 2;

        shape.moveTo(-halfL, -halfT);
        shape.lineTo( halfL, -halfT);
        shape.lineTo( halfL,  halfT);
        shape.lineTo(-halfL,  halfT);
        shape.closePath();

        const geometry = new THREE.ExtrudeGeometry(shape, {
            depth: this.defaultHeight,
            bevelEnabled: false
        });

        geometry.rotateX(-Math.PI / 2);

        const material = new THREE.MeshStandardMaterial({
            color: 0x999999,
            roughness: 0.8,
            metalness: 0.2
        });

        const mesh = new THREE.Mesh(geometry, material);
        
        // The center of the wall is the midpoint between start and end
        const cx = (x1 + x2) / 2;
        const cz = (z1 + z2) / 2;

        // Position the mesh at the midpoint. Y is handled by the PhysicalController altitude logic.
        mesh.position.set(cx, 0, cz);

        // Rotate the mesh to align with the direction vector
        const angle = Math.atan2(dz, dx);
        mesh.rotation.y = -angle;

        return mesh;
    }
}