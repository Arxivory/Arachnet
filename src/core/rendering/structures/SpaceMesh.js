import * as THREE from 'three';

export default class SpaceMesh {
        constructor(opts = {}, defaultScaler) {
        this.id = opts.id;
        this.type = opts.type;
        this.defaultHeight = 50.0;

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

    buildLocalPlanPoints(points) {
        return points.map((p) => new THREE.Vector2(
            (p.x - this.x) * this.scaler,
            -(p.y - this.z) * this.scaler
        ));
    }

    buildClosedPath(target, points) {
        target.moveTo(points[0].x, points[0].y);

        for (let i = 1; i < points.length; i++) {
            target.lineTo(points[i].x, points[i].y);
        }

        target.closePath();
    }

    buildInsetPoints(points, insetAmount) {
        const center = points.reduce(
            (acc, point) => acc.add(point),
            new THREE.Vector2(0, 0)
        ).multiplyScalar(1 / points.length);

        return points.map((point) => {
            const direction = new THREE.Vector2().subVectors(point, center);
            const length = direction.length();

            if (length <= insetAmount) {
                return point.clone();
            }

            return point.clone().sub(
                direction.normalize().multiplyScalar(insetAmount)
            );
        });
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
            throw Error("The Space is not Rectangular. Try getting other forms.");

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
        const wallSideMat = new THREE.MeshStandardMaterial({ color: 0xcccccc });
        const wallTopMat = new THREE.MeshStandardMaterial({ color: 0x333333 });

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

        const ceilingGeometry = new THREE.PlaneGeometry(width - (thickness * 2), depth - (thickness * 2));
        const ceilingMaterial = new THREE.MeshStandardMaterial({ 
            color: 0xf5f5f5,
            roughness: 0.8,
            metalness: 0.0
        });
        
        const ceilingMesh = new THREE.Mesh(ceilingGeometry, ceilingMaterial);
        ceilingMesh.rotation.x = Math.PI / 2;
        ceilingMesh.position.set(
            (this.x * this.scaler) + (width / 2),
            this.defaultHeight,
            (this.z * this.scaler) + (depth / 2)
        );
        ceilingMesh.userData = { type: 'ceiling', id: this.id };

        const group = new THREE.Group();
        group.add(rectMesh);
        group.add(baseBoardMesh);
        group.add(ceilingMesh);
        group.userData = { type: 'space', id: this.id };

        return group;
    }

    getPolygonalForm() {
        if (!this.geometry.polygonal || !this.geometry.polygonal.points?.length)
            throw Error("The Space is not Polygonal. Try getting other forms.");

        if (this.geometry.polygonal.points.length < 3)
            throw Error("A polygonal space needs at least 3 points.");

        const localPoints = this.buildLocalPlanPoints(this.geometry.polygonal.points);

        const wallThickness = 0.7;
        const wallInnerPoints = this.calculateInsetPoints(localPoints, wallThickness);

        const wallShape = new THREE.Shape();
        this.buildClosedPath(wallShape, localPoints);

        const wallHole = new THREE.Path();
        this.buildClosedPath(wallHole, wallInnerPoints);
        wallShape.holes.push(wallHole);

        const baseboardWidth = 0.3;
        const baseboardInnerPoints = this.calculateInsetPoints(wallInnerPoints, baseboardWidth);

        const baseboardShape = new THREE.Shape();
        this.buildClosedPath(baseboardShape, wallInnerPoints);

        const baseboardHole = new THREE.Path();
        this.buildClosedPath(baseboardHole, baseboardInnerPoints);
        baseboardShape.holes.push(baseboardHole);

        const extrudeSettings = {
            depth: this.defaultHeight,
            bevelEnabled: true,
            bevelThickness: 0.05,
            bevelSize: 0.05,
            bevelSegments: 2
        };

        const wallSideMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, side: THREE.DoubleSide });
        const wallTopMat = new THREE.MeshStandardMaterial({ color: 0x333333, side: THREE.DoubleSide });

        const wallGeometry = new THREE.ExtrudeGeometry(wallShape, extrudeSettings);
        const wallMesh = new THREE.Mesh(wallGeometry, [wallTopMat, wallSideMat]);
        wallMesh.rotation.x = -Math.PI / 2;

        const baseboardSettings = {
            depth: 1.7,
            bevelEnabled: true,
            bevelThickness: 0.05,
            bevelSize: 0.05,
            bevelSegments: 2
        };

        const baseBoardMaterial = new THREE.MeshStandardMaterial({ color: 0xf9f9f9 });
        const baseBoardMesh = new THREE.Mesh(new THREE.ExtrudeGeometry(baseboardShape, baseboardSettings), baseBoardMaterial);
        baseBoardMesh.rotation.x = -Math.PI / 2;
        baseBoardMesh.position.y = 1.5;

        const ceilingShape = new THREE.Shape();
        this.buildClosedPath(ceilingShape, wallInnerPoints);
        const ceilingGeometry = new THREE.ShapeGeometry(ceilingShape);
        const ceilingMaterial = new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.8, side: THREE.DoubleSide });
        
        const ceilingMesh = new THREE.Mesh(ceilingGeometry, ceilingMaterial);
        ceilingMesh.rotation.x = -Math.PI / 2;
        ceilingMesh.position.y = this.defaultHeight;
        ceilingMesh.userData = { type: 'ceiling', id: this.id };

        const group = new THREE.Group();
        group.position.set(this.x * this.scaler, 0, this.z * this.scaler);
        group.add(wallMesh);
        group.add(baseBoardMesh);
        group.add(ceilingMesh);
        group.userData = { type: 'space', id: this.id, shape: 'polygon' };

        return group;
    }

    getCircularForm() {
        if (!this.geometry.circular)
            throw Error("The Space is not Circular. Try getting other forms.");

        const radius = this.geometry.circular.radius * this.scaler;
        const thickness = Math.min(0.7, radius * 0.35);
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

        const wallSideMat = new THREE.MeshStandardMaterial({
            color: 0xf8f8f8,
            side: THREE.DoubleSide
        });

        const wallTopMat = new THREE.MeshStandardMaterial({
            color: 0x333333,
            side: THREE.DoubleSide
        });

        const wallGeometry = new THREE.ExtrudeGeometry(circleShape, extrudeSettings);
        const wallMesh = new THREE.Mesh(wallGeometry, [wallTopMat, wallSideMat]);
        wallMesh.rotation.x = -Math.PI / 2;

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

        const group = new THREE.Group();
        group.position.set(
            (this.x * this.scaler) + radius,
            0,
            (this.z * this.scaler) + radius
        );

        group.add(wallMesh);
        group.add(baseBoardMesh);
        group.userData = { type: 'space', id: this.id, shape: 'circle' };

        return group;
    }

} 