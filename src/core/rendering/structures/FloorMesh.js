import * as THREE from 'three';
import getCachedTexture from '../utils/TextureLoader';
import { thickness } from 'three/tsl';

export default class FloorMesh {
    constructor(opts = {}, defaultScaler) {
        this.id = opts.id;
        this.type = opts.shapeType;
        this.defaultHeight = 50.0; 

        this.x = opts.geometry.x;
        this.y = opts.altitude || 0;
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

    calculateLightParameters() {
        let width, depth;

        if (this.geometry.rectangular) {
            width = this.geometry.rectangular.width * this.scaler;
            depth = this.geometry.rectangular.depth * this.scaler;
        } else if (this.geometry.circular) {
            width = depth = this.geometry.circular.radius * 2 * this.scaler;
        } else {
            const points = this.geometry.polygonal.points;
            const xValues = points.map(p => p.x);
            const yValues = points.map(p => p.y);
            width = (Math.max(...xValues) - Math.min(...xValues)) * this.scaler;
            depth = (Math.max(...yValues) - Math.min(...yValues)) * this.scaler;
        }

        const height = this.defaultHeight;
        
        const maxDiagonal = Math.sqrt(Math.pow(width / 2, 2) + Math.pow(depth / 2, 2) + Math.pow(height, 2));

        const lightDistance = maxDiagonal * 1.2;

        const area = width * depth;
        const lightIntensity = area * 0.21; 

        return { lightDistance, lightIntensity };
    }

    calculateInsetPoints(points, thickness) {
        let area = 0;
        for (let i = 0; i < points.length; i++) {
            const j = (i + 1) % points.length;
            area += (points[i].x * points[j].y) - (points[j].x * points[i].y);
        }
        const isCCW = area > 0;

        return points.map((p, i) => {
            const prev = points[(i - 1 + points.length) % points.length];
            const next = points[(i + 1) % points.length];

            const v1 = new THREE.Vector2(p.x - prev.x, p.y - prev.y).normalize();
            const v2 = new THREE.Vector2(next.x - p.x, next.y - p.y).normalize();

            const n1 = new THREE.Vector2(-v1.y, v1.x);
            const n2 = new THREE.Vector2(-v2.y, v2.x);

            const bisector = new THREE.Vector2(n1.x + n2.x, n1.y + n2.y).normalize();

            const directionMultiplier = isCCW ? 1 : -1;

            return {
                x: p.x + bisector.x * thickness * directionMultiplier,
                y: p.y + bisector.y * thickness * directionMultiplier
            };
        });
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

        const baseboardExtrudeSettings = {
            depth: 1.7,
            bevelEnabled: true,
            bevelThickness: 0.05,
            bevelSize: 0.05,
            bevelSegments: 2
        };

        const rectGeometry = new THREE.ExtrudeGeometry(rectShape, extrudeSettings);
        const wallSideMat = new THREE.MeshStandardMaterial({ color: 0xf8f8f8 });
        const wallTopMat = new THREE.MeshStandardMaterial({ color: 0xf8f8f8 });

        const rectMesh = new THREE.Mesh(rectGeometry, [wallTopMat, wallSideMat]);
        rectMesh.rotation.x = -Math.PI / 2;

        rectMesh.position.set((this.x * this.scaler) + (width / 2), 0, ((this.z * this.scaler) + (depth / 2)));

        const baseBoardShape = rectShape.clone();

        baseBoardShape.holes = [];

        const inset = thickness * 2.2;
        const insetPath = new THREE.Path();
        insetPath.moveTo(points[0].x + inset, points[0].z + inset);
        insetPath.lineTo(points[1].x - inset, points[1].z + inset);
        insetPath.lineTo(points[2].x - inset, points[2].z - inset);
        insetPath.lineTo(points[3].x + inset, points[3].z - inset);
        insetPath.closePath();

        baseBoardShape.holes.push(insetPath);

        const baseBoardGeometry = new THREE.ExtrudeGeometry(baseBoardShape, baseboardExtrudeSettings);
        const baseBoardMaterial = new THREE.MeshStandardMaterial({ color: 0xf9f9f9 });
        const baseBoardMesh = new THREE.Mesh(baseBoardGeometry, baseBoardMaterial);

        baseBoardMesh.rotation.x = -Math.PI / 2;
        baseBoardMesh.position.set(
            (this.x * this.scaler) + (width / 2),
            1.5,
            (this.z * this.scaler) + (depth / 2)
        );

        const floorGeometry = new THREE.PlaneGeometry(width - (thickness * 2), depth - (thickness * 2));
        const tileSize = 10.0; 
        const tex = getCachedTexture('textures/Dune-Wood-Tile.jpg');

        tex.repeat.set(width / tileSize, depth / tileSize);

        const floorMaterial = new THREE.MeshStandardMaterial({
            map: tex,
            roughness: 0.5,
            metalness: 0.0,
            side: THREE.DoubleSide
        });

        const ceilingGeometry = new THREE.PlaneGeometry(width - (thickness * 2), depth - (thickness * 2));
        const ceilingMaterial = new THREE.MeshStandardMaterial({ 
            color: 0xf8f8f8,
            roughness: 0.8,
            metalness: 0.0,
            side: THREE.DoubleSide
        });

        const floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);
        floorMesh.rotation.x = Math.PI / 2;
        floorMesh.position.set(
            (this.x * this.scaler) + (width / 2),
            1.5,
            (this.z * this.scaler) + (depth / 2)
        );
        floorMesh.userData = { type: 'floor', id: this.id };
        
        const ceilingMesh = new THREE.Mesh(ceilingGeometry, ceilingMaterial);
        ceilingMesh.rotation.x = Math.PI / 2;
        ceilingMesh.position.set(
            (this.x * this.scaler) + (width / 2),
            this.defaultHeight,
            (this.z * this.scaler) + (depth / 2)
        );
        ceilingMesh.userData = { type: 'ceiling', id: this.id };

        const { lightDistance, lightIntensity } = this.calculateLightParameters();
        const roomLight = new THREE.PointLight(0xffffff, lightIntensity, lightDistance);
        roomLight.decay = 2;
        roomLight.position.set(
            (this.x * this.scaler) + (width / 2),
            this.defaultHeight - 10.0,
            (this.z * this.scaler) + (depth / 2)
        );

        const group = new THREE.Group();
        group.add(rectMesh);
        group.add(baseBoardMesh);
        group.add(ceilingMesh);
        group.add(floorMesh);
        group.add(roomLight);
        group.userData = { type: 'site', id: this.id };

        return group;
    }

    getPolygonalForm() {
        if (!this.geometry.polygonal || !this.geometry.polygonal.points?.length)
            throw Error("The Site is not Polygonal. Try getting other forms.");

        const points = this.geometry.polygonal.points;
        const shape = this.buildPlanShape(points);

        const xValues = points.map(p => p.x);
        const yValues = points.map(p => p.y);

        const width = (Math.max(...xValues) - Math.min(...xValues)) * this.scaler;
        const depth = (Math.max(...yValues) - Math.min(...yValues)) * this.scaler;

        const extrudeSettings = {
            depth: this.defaultHeight,
            bevelEnabled: true,
            bevelThickness: 0.05,
            bevelSize: 0.05,
            bevelSegments: 2
        };

        const baseboardHeight = 1.7;
        const baseboardThickness = 0.7;
        
        const baseBoardShape = shape.clone();
        const holePath = new THREE.Path();
        const insetPoints = this.calculateInsetPoints(points, baseboardThickness);
        
        insetPoints.forEach((p, i) => {
            const localX = (p.x - this.x) * this.scaler;
            const localY = -(p.y - this.z) * this.scaler;
            if (i === 0) holePath.moveTo(localX, localY);
            else holePath.lineTo(localX, localY);
        });
        holePath.closePath();
        baseBoardShape.holes.push(holePath);

        const baseboardSettings = {
            depth: baseboardHeight,
            bevelEnabled: true,
            bevelThickness: 0.05,
            bevelSize: 0.05,
            bevelSegments: 2
        };

        const baseBoardMaterial = new THREE.MeshStandardMaterial({ color: 0xf9f9f9 });
        const baseBoardMesh = new THREE.Mesh(new THREE.ExtrudeGeometry(baseBoardShape, baseboardSettings), baseBoardMaterial);
        baseBoardMesh.rotation.x = -Math.PI / 2;
        baseBoardMesh.position.y = 1.5;

        const wallSideMat = new THREE.MeshStandardMaterial({ color: 0xf8f8f8, side: THREE.DoubleSide });
        const wallTopMat = new THREE.MeshStandardMaterial({ color: 0xf8f8f8, side: THREE.DoubleSide });

        const wallGeometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        const wallMesh = new THREE.Mesh(wallGeometry, [wallTopMat, wallSideMat]);
        wallMesh.rotation.x = -Math.PI / 2;

        const ceilingGeometry = new THREE.ShapeGeometry(shape);
        const ceilingMaterial = new THREE.MeshStandardMaterial({ color: 0xf8f8f8, roughness: 0.8, metalness: 0.0, side: THREE.DoubleSide });
        const ceilingMesh = new THREE.Mesh(ceilingGeometry, ceilingMaterial);
        ceilingMesh.rotation.x = -Math.PI / 2;
        ceilingMesh.position.y = this.defaultHeight;
        ceilingMesh.userData = { type: 'ceiling', id: this.id };

        const tex = getCachedTexture('textures/Dune-Wood-Tile.jpg');

        const floorGeometry = new THREE.ShapeGeometry(shape);
        const tileSize = 10.0;

        const pos = floorGeometry.attributes.position;
        const uvs = floorGeometry.attributes.uv;

        for (let i = 0; i < pos.count; i++) {
            uvs.setXY(i, pos.getX(i) / tileSize, pos.getY(i) / tileSize);
        }
        uvs.needsUpdate = true;

        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(1, 1); 
        const floorMaterial = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, metalness: 0.0, side: THREE.DoubleSide });
        const floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);
        floorMesh.rotation.x = -Math.PI / 2;
        floorMesh.position.y = 1.5;
        floorMesh.userData = { type: 'floor', id: this.id };

        const { lightDistance, lightIntensity } = this.calculateLightParameters();
        const roomLight = new THREE.PointLight(0xffffff, lightIntensity, lightDistance);
        roomLight.decay = 2;
        roomLight.position.set(width / 2, this.defaultHeight - 10.0, depth / 2);

        const group = new THREE.Group();
        group.position.set(this.x * this.scaler, 0, this.z * this.scaler);
        group.add(wallMesh);
        group.add(baseBoardMesh);
        group.add(ceilingMesh);
        group.add(floorMesh);
        group.add(roomLight);
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

        const baseboardHeight = 1.7;
        const baseboardDepth = 0.2;
        const baseboardInnerRadius = Math.max(innerRadius - baseboardDepth, 0.01);

        const baseboardShape = new THREE.Shape();
        baseboardShape.absarc(0, 0, innerRadius, 0, Math.PI * 2, false);

        const baseboardHole = new THREE.Path();
        baseboardHole.absarc(0, 0, baseboardInnerRadius, 0, Math.PI * 2, true);
        baseboardShape.holes.push(baseboardHole);

        const baseboardSettings = {
            depth: baseboardHeight,
            bevelEnabled: true,
            bevelThickness: 0.05,
            bevelSize: 0.05,
            bevelSegments: 2,
            curveSegments: 64
        };

        const baseBoardMaterial = new THREE.MeshStandardMaterial({ color: 0xf9f9f9 });
        const baseBoardMesh = new THREE.Mesh(new THREE.ExtrudeGeometry(baseboardShape, baseboardSettings), baseBoardMaterial);
        
        baseBoardMesh.rotation.x = -Math.PI / 2;
        baseBoardMesh.position.y = 1.5;

        const wallSideMat = new THREE.MeshStandardMaterial({ color: 0xf8f8f8, side: THREE.DoubleSide });
        const wallTopMat = new THREE.MeshStandardMaterial({ color: 0xf8f8f8 });

        const circleMesh = new THREE.Mesh(new THREE.ExtrudeGeometry(circleShape, extrudeSettings), [wallTopMat, wallSideMat]);
        circleMesh.rotation.x = -Math.PI / 2;

        const ceilingGeometry = new THREE.CircleGeometry(innerRadius, 64);
        const ceilingMaterial = new THREE.MeshStandardMaterial({ color: 0xf8f8f8, roughness: 0.8, metalness: 0.0, side: THREE.DoubleSide });
        const ceilingMesh = new THREE.Mesh(ceilingGeometry, ceilingMaterial);
        ceilingMesh.rotation.x = -Math.PI / 2;
        ceilingMesh.position.y = height;
        ceilingMesh.userData = { type: 'ceiling', id: this.id };

        const floorGeometry = new THREE.CircleGeometry(innerRadius, 64);
        const tex = getCachedTexture('textures/Dune-Wood-Tile.jpg');
        tex.repeat.set(10, 10);
        const floorMaterial = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, metalness: 0.0, side: THREE.DoubleSide });
        const floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);
        floorMesh.rotation.x = -Math.PI / 2;
        floorMesh.position.y = 1.5;
        floorMesh.userData = { type: 'floor', id: this.id };

        const { lightDistance, lightIntensity } = this.calculateLightParameters();
        const roomLight = new THREE.PointLight(0xffffff, lightIntensity, lightDistance);
        roomLight.decay = 2;
        roomLight.position.set(0, this.defaultHeight - 10.0, 0);

        const group = new THREE.Group();
        group.add(circleMesh);
        group.add(baseBoardMesh);
        group.add(ceilingMesh);
        group.add(floorMesh);
        group.add(roomLight);
        group.position.set((this.x * this.scaler) + radius, 0, (this.z * this.scaler) + radius);
        group.userData = { type: 'site', id: this.id };

        return group;
    }

}