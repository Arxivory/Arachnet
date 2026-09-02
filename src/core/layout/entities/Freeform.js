import { Polygon } from "check2d";

export class Freeform {
    constructor(points, structureType, system) {
        this.id = null;
        this.x = Math.min(...points.map(p => p.x));
        this.y = Math.min(...points.map(p => p.y));
        this.maxX = Math.max(...points.map(p => p.x));
        this.maxY = Math.max(...points.map(p => p.y));
        this.w = this.maxX - this.x;
        this.h = this.maxY - this.y;
        this.system = system;
        this.points = [...points];
        this.type = 'freeform';
        this.structureType = structureType;
        this.hitTestMode = 'stroke';
        this.initPath(points);
        this.initTransform();
        this.initBody();
    }


    initPath(points) {
        const path = new Path2D();
        path.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            path.lineTo(points[i].x, points[i].y);
        }
        this.path = path;
    }

    initBody() {
        const thickness = 0.5;
        this.bodies = [];

        for (let i = 0; i < this.transform.scale.points.length - 1; i++) {
            const a = this.transform.scale.points[i];
            const b = this.transform.scale.points[i + 1];

            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const len = Math.hypot(dx, dy);

            const nx = -dy / len * thickness;
            const ny = dx / len * thickness;

            const cx = (a.x + b.x) / 2;
            const cy = (a.y + b.y) / 2;

            const localPoints = [
                { x: -dx / 2 + nx, y: -dy / 2 + ny },
                { x: dx / 2 + nx, y: dy / 2 + ny },
                { x: dx / 2 - nx, y: dy / 2 - ny },
                { x: -dx / 2 - nx, y: -dy / 2 - ny }
            ];

            const body = new Polygon({ x: cx, y: cy }, localPoints);
            body.structType = this.structureType;
            this.system.insert(body);
            this.bodies.push(body);

        }
    }

    initTransform() {
        this.transform = {
            position: { x: this.x, y: this.y, z: 0 },
            scale: { factor: 1, points: this.points.map(p => ({ ...p })) },
            rotation: { x: 0, y: 0, z: 0 }
        }
    }

    updatePath() {
        const scaled = this.transform.scale.points;
        const path = new Path2D();
        path.moveTo(scaled[0].x + 0.5, scaled[0].y + 0.5);
        for (let i = 1; i < scaled.length; i++) {
            path.lineTo(scaled[i].x + 0.5, scaled[i].y + 0.5);
        }
        path.closePath();
        this.path = path;
    }

    cascadeScaleFactorChange() {
        const { ax, ay } = this.getCenter();
        const points = this.points;
        this.transform.scale.points = points.map(p => ({
            x: ax + (p.x - ax) * this.transform.scale.factor,
            y: ay + (p.y - ay) * this.transform.scale.factor
        }));
        const scaled = this.transform.scale.points;
        this.x = Math.min(...scaled.map(p => p.x));
        this.y = Math.min(...scaled.map(p => p.y));
        this.maxX = Math.max(...scaled.map(p => p.x));
        this.maxY = Math.max(...scaled.map(p => p.y));
        this.w = this.maxX - this.x;
        this.h = this.maxY - this.y;
        this.transform.position.x = this.x;
        this.transform.position.y = this.y;
        this.updateBody();
    }

    getCenter() {
        let ax = 0, ay = 0;
        for (let p of this.points) {
            ax += p.x;
            ay += p.y;
        }
        ax /= this.points.length;
        ay /= this.points.length;
        return { ax, ay };
    }

    updateBody() {
        for (const body of this.bodies) {
            this.system.remove(body);
        }
        this.initBody();
    }

    setScale(newScale) {
        this.transform.scale.factor = newScale.factor;
        this.cascadeScaleFactorChange();
    }

    saveCurrentScale() {
        this.savedScale = JSON.parse(JSON.stringify(this.transform.scale.factor));
    }

    restoreToSavedScale() {
        this.transform.scale.factor = this.savedScale;
        this.cascadeScaleFactorChange();
    }

    saveCurrentPosition() {
        this.savedPosition = {
            x: this.x,
            y: this.y,
            maxX: this.maxX,
            maxY: this.maxY,
            points: this.points.map(p => ({ ...p })),
            scaledPoints: this.transform.scale.points.map(p => ({ ...p }))
        }
    }

    restoreToSavedPosition() {
        this.x = this.savedPosition.x;
        this.y = this.savedPosition.y;
        this.maxX = this.savedPosition.maxX;
        this.maxY = this.savedPosition.maxY;
        this.points = this.savedPosition.points;
        this.transform.scale.points = this.savedPosition.scaledPoints;
        this.transform.position.x = this.x;
        this.transform.position.y = this.y;
        this.updateBody();
    }

    move(dx, dy) {
        for (let i = 0; i < this.points.length; i++) {
            this.points[i].x += dx;
            this.points[i].y += dy;
            this.transform.scale.points[i].x += dx;
            this.transform.scale.points[i].y += dy;
        }
        let points = this.transform.scale.points;
        this.x = Math.min(...points.map(p => p.x));
        this.y = Math.min(...points.map(p => p.y));
        this.maxX = Math.max(...points.map(p => p.x));
        this.maxY = Math.max(...points.map(p => p.y));
        this.w = this.maxX - this.x;
        this.h = this.maxY - this.y;
        this.transform.position.x = this.x;
        this.transform.position.y = this.y;
        this.updateBody();
    }

    checkIfOverlapping(floorId) {
        
        for (const body of this.bodies) {
            this.system.remove(body);
        }

        for (const body of this.bodies) {
            const structMap = new Map();
            structMap.set("Site", "Domain");
            structMap.set("Floor", "Site");
            structMap.set("Space", "Floor");
            const requiredParent = structMap.get(this.structureType);
            let overlapping = false;
            this.system.checkOne(body, (other) => {
                if (!this.bodies.includes(other)) {
                    const otherFloorId = other.b?.floorId ?? null;
                    const currentFloorId = floorId ?? null;
                    if (!other.b.structType) {
                        overlapping = other.b && otherFloorId === currentFloorId;
                    }
                    else if (other.b && otherFloorId === currentFloorId && requiredParent !== other.b.structType) {
                        overlapping = true;
                    }
                }
            });

            if (overlapping) {
                for (const bodyToReinsert of this.bodies) {
                    this.system.insert(bodyToReinsert);
                }
                return true;
            }
        }

        for (const body of this.bodies) {
            this.system.insert(body);
        }

        return false;
    }
}

export default Freeform;