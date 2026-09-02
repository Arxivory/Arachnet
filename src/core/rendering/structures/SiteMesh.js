import * as THREE from 'three';

export default class SiteMesh {
    constructor(opts = {}, defaultScaler) {
        this.id = opts.id;
        this.type = opts.type;
        this.defaultHeight = 1.05;

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

    buildPlanShape(points) {
        const shape = new THREE.Shape();

        points.forEach((p, i) => {
            const localX = (p.x - this.x) * this.scaler;
            const localY = -(p.y - this.z) * this.scaler;

            if (i === 0) shape.moveTo(localX, localY);
            else shape.lineTo(localX, localY);
        });

        shape.closePath();
        return shape;
    }

    getRectangularForm() {
        if (!this.geometry.rectangular)
            throw Error("The Site is not Rectangular. Try getting other forms.");

        const width = this.geometry.rectangular.width * this.scaler;
        const depth = this.geometry.rectangular.depth * this.scaler;

        const points = [
            { x: -width / 2, z: -depth / 2 },
            { x:  width / 2, z: -depth / 2 },
            { x:  width / 2, z:  depth / 2 },
            { x: -width / 2, z:  depth / 2 }
        ];

        const rectShape = new THREE.Shape();
        rectShape.moveTo(points[0].x, points[0].z);
        for (let i = 1; i < points.length; i++)
            rectShape.lineTo(points[i].x, points[i].z);
        rectShape.closePath();

        const thickness = 0.7;
        const holePath = new THREE.Path();
        holePath.moveTo(points[0].x + thickness, points[0].z + thickness);
        holePath.lineTo(points[1].x - thickness, points[1].z + thickness);
        holePath.lineTo(points[2].x - thickness, points[2].z - thickness);
        holePath.lineTo(points[3].x + thickness, points[3].z - thickness);
        holePath.closePath();
        rectShape.holes.push(holePath);

        const extrudeSettings = {
            depth: this.defaultHeight,
            bevelEnabled: true,
            bevelThickness: 0.05,
            bevelSize: 0.05,
            bevelSegments: 2
        };

        const rectGeometry = new THREE.ExtrudeGeometry(rectShape, extrudeSettings);
        const wallSideMat = new THREE.MeshStandardMaterial({ color: 0xcccccc });
        const wallTopMat = new THREE.MeshStandardMaterial({ color: 0x333333 });

        const rectMesh = new THREE.Mesh(rectGeometry, [wallTopMat, wallSideMat]);
        rectMesh.rotation.x = -Math.PI / 2;

        rectMesh.position.set((this.x * this.scaler) + (width / 2), 0, ((this.z * this.scaler) + (depth / 2)));

        const baseGeometry = new THREE.PlaneGeometry(width - (thickness * 2), depth - (thickness * 2));
        const baseMaterial = new THREE.MeshStandardMaterial({ 
            color: 0xf8f8f8,
            roughness: 0.8,
            metalness: 0.0,
            side: THREE.DoubleSide
        });
        
        const baseMesh = new THREE.Mesh(baseGeometry, baseMaterial);
        baseMesh.rotation.x = Math.PI / 2;
        baseMesh.position.set(
            (this.x * this.scaler) + (width / 2),
            this.defaultHeight,
            (this.z * this.scaler) + (depth / 2)
        );
        baseMesh.userData = { type: 'ceiling', id: this.id };

        const group = new THREE.Group();
        group.add(rectShape);
        group.add(baseMesh);
        group.userData = { type: 'site', id: this.id };

        return group;
    }

    getPolygonalForm() {
        if (!this.geometry.polygonal || !this.geometry.polygonal.points?.length)
            throw Error("The Site is not Polygonal. Try getting other forms.");

        const points = this.geometry.polygonal.points;
        const shape = this.buildPlanShape(points);

        const extrudeSettings = {
            depth: this.defaultHeight,
            bevelEnabled: true,
            bevelThickness: 0.05,
            bevelSize: 0.05,
            bevelSegments: 2
        };

        const baseSideMat = new THREE.MeshStandardMaterial({ color: 0xf8f8f8, side: THREE.DoubleSide})
        const baseTopMat = new THREE.MeshStandardMaterial({ color: 0xf8f8f8, side: THREE.DoubleSide})
        const baseMaterial = new THREE.MeshStandardMaterial({
            color: 0xf8f8f8,
            roughness: 0.8,
            metalness: 0.0,
            side: THREE.DoubleSide
        });

        const baseSideGeometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        const baseSideMesh = new THREE.Mesh(baseSideGeometry, [baseTopMat, baseSideMat]);
        baseSideMesh.rotation.x = -Math.PI / 2;

        const baseGeometry = new THREE.ShapeGeometry(shape);
        const baseMesh = new THREE.Mesh(baseGeometry, baseMaterial);
        baseMesh.rotation.x = -Math.PI / 2;
        baseMesh.position.y = this.defaultHeight;
        baseMesh.userData = { type: 'ceiling', id: this.id };

        const group = new THREE.Group();
        group.position.set(
            this.x * this.scaler,
            0,
            this.z * this.scaler
        );

        group.add(baseSideMesh);
        group.add(baseMesh);
        group.userData = { type: 'site', id: this.id };

        return group;
    }

    getCircularForm() {
        if (!this.geometry.circular)
            throw Error("The Site is not Circular.");

        const radius = this.geometry.circular.radius * this.scaler;
        const thickness = 0.7;
        const innerRadius = Math.max(radius - thickness, 0.01);
        const height = this.defaultHeight;

        const circleShape = new THREE.Shape();
        circleShape.absarc(0, 0, radius, 0, Math.PI * 2, false);

        const holePath = new THREE.Path();
        holePath.absarc(0, 0, innerRadius, 0, Math.PI * 2, true);
        circleShape.holes.push(holePath);

        const extrudeSettings = {
            depth: height,
            bevelEnabled: true,
            bevelThickness: 0.05,
            bevelSize: 0.05,
            bevelSegments: 2,
            curveSegments: 64
        };

        const baseSideMat = new THREE.MeshStandardMaterial({ color: 0xf8f8f8,  side: THREE.DoubleSide});
        const baseTopMat = new THREE.MeshStandardMaterial({ color: 0xf8f8f8 });

        const baseSideMesh = new THREE.Mesh(
            new THREE.ExtrudeGeometry(circleShape, extrudeSettings), 
            [baseTopMat, baseSideMat]
        );
        baseSideMesh.rotation.x = -Math.PI / 2;
        baseSideMesh.position.set(0, 0, 0);

        const baseGeometry = new THREE.CircleGeometry(innerRadius, 64);
        const baseMaterial = new THREE.MeshStandardMaterial({ 
            color: 0xf5f5f5,
            roughness: 0.8,
            metalness: 0.0,
            side: THREE.DoubleSide
        });
        const baseMesh = new THREE.Mesh(baseGeometry, baseMaterial);
        baseMesh.rotation.x = -Math.PI / 2;
        baseMesh.position.y = height;
        baseMesh.userData = { type: 'ceiling', id: this.id };

        const group = new THREE.Group();
        group.add(baseSideMesh);
        group.add(baseMesh);

        group.position.set(
            (this.x * this.scaler) + radius, 
            0, 
            (this.z * this.scaler) + radius
        );

        group.userData = { type: 'site', id: this.id };
        return group;
    }
}