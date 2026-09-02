import * as THREE from 'three';

export default class DomainMesh {
    constructor(opts = {}, defaultScaler) {
        this.id = opts.id;
        this.type = opts.type;
        this.defaultHeight = 1.0;

        this.x = opts.geometry.x;
        this.y = 0.1;
        this.z = opts.geometry.y;
        this.scaler = defaultScaler;

        this.geometry = {
            rectangular: {
                width: opts.geometry.width,
                depth: opts.geometry.height
            },
            polygonal: {
                points: opts.geometry.points
            },
            circular: {
                radius: opts.geometry.radius
            }
        }
    }

    getRectangularForm() {
        if (!this.geometry.rectangular) 
            throw Error("The Domain is not Rectangular. Try getting other forms.");

        const width = this.geometry.rectangular.width * this.scaler;
        const depth = this.geometry.rectangular.depth * this.scaler;

        const scaledX = this.x * this.scaler;
        const scaledZ = this.z * this.scaler;

        const x = scaledX + (width / 2);
        const z = scaledZ + (depth / 2);

        const rectangularGeometry = new THREE.BoxGeometry(
            width,
            this.defaultHeight, 
            depth
        );

        const rectangularMaterial = new THREE.MeshStandardMaterial({
            color: 0xcccccc,
            roughness: 0.9,
            metalness: 0.3
        });

        const rectangularMesh = new THREE.Mesh(rectangularGeometry, rectangularMaterial);
        rectangularMesh.position.set(
            x,
            0.1,
            z
        )

        return rectangularMesh;
    }

    getPolygonalForm() {
        if (!this.geometry.polygonal || !this.geometry.polygonal.points?.length) {
            throw Error('Polygonal domain has no points');
        }

        const x = this.x;
        const y = this.z;

        const shape = new THREE.Shape();

        this.geometry.polygonal.points.forEach((p, i) => {
            const localX = (p.x - x) * this.scaler;
            const localY = -(p.y - y) * this.scaler;

            if (i === 0) shape.moveTo(localX, localY);
            else shape.lineTo(localX, localY);
        });

        shape.closePath();

        const geometry = new THREE.ExtrudeGeometry(shape, {
            depth: 1,
            bevelEnabled: false
        });

        geometry.rotateX(-Math.PI / 2);

        const material = new THREE.MeshStandardMaterial({
            color: 0xcccccc,
            roughness: 0.9,
            metalness: 0.3
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(
            x * this.scaler,
            0.1,
            y * this.scaler
        );

        return mesh;
    }
    
    getCircularForm() {
        if (!this.geometry.circular || !this.geometry.circular.radius) {
            throw Error('Circular domain has no radius');
        }

        const { radius: r } = this.geometry.circular;
        
        const scaledR = r * this.scaler;
        const height = 0.5; 
        const geometry = new THREE.CylinderGeometry(scaledR, scaledR, height, 64);
        
        const material = new THREE.MeshStandardMaterial({
                color: 0xcccccc,
                roughness: 0.9,
                metalness: 0.3
        });
        
        const mesh = new THREE.Mesh(geometry, material);
        
        mesh.position.set(
            (this.x * this.scaler) + scaledR, 
            height / 2, 
            (this.z * this.scaler) + scaledR
        );
        
        mesh.userData = { id: this.id, type: 'domain', shape: 'circle' };
        
        return mesh;
    }

}