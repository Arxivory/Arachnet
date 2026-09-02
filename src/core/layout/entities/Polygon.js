import { Polygon as SystemPolygon } from "check2d";

export class Polygon {
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
        this.type = 'polygon';
        this.structureType = structureType;
        this.hitTestMode = 'path';
        this.initPath(points);
        this.initBody();
        this.initTransform();
    }


    initPath(points) {
        const path = new Path2D();
        path.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            path.lineTo(points[i].x, points[i].y);
        }
        path.closePath();
        this.path = path;
    }

    initBody() {
        const margin = 0.0001;
        const cx = this.points.reduce((s, p) => s + p.x, 0) / this.points.length;
        const cy = this.points.reduce((s, p) => s + p.y, 0) / this.points.length;

        const pointsWithMargin = this.points.map(p => {
            const dx = p.x - cx;
            const dy = p.y - cy;
            const len = Math.hypot(dx, dy);
            const scale = (len - margin) / len;
            return {
                x: cx + dx * scale,
                y: cy + dy * scale
            };
        });

        const localPoints = pointsWithMargin.map(p => ({
            x: p.x - cx,
            y: p.y - cy
        }));

        this.body = new SystemPolygon({ x: cx, y: cy }, localPoints);
        this.body.structType = this.structureType;
        this.system.insert(this.body);
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
        const scaled = this.transform.scale.points;
        const cx = (this.x + this.maxX) / 2;
        const cy = (this.y + this.maxY) / 2;
        const localPoints = scaled.map(p => ({
            x: p.x - cx,
            y: p.y - cy
        }));
        this.system.remove(this.body);
        this.body.setPosition(cx, cy);
        this.body.setPoints(localPoints);
        this.system.insert(this.body);
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
        //this.system.updateBody(this.body);
    }

    checkIfOverlapping(ancestorsId, floorId) {
        let overlapping = false;
        this.system.checkOne(this.body, (other) => {
            if (other !== this.body) {
                const otherFloorId = other.b?.floorId ?? null;
                const currentFloorId = floorId ?? null;

                if (ancestorsId.includes(other.b.id)) {
                    return;
                }

                if (!other.b.structType) {
                    if (other.b && otherFloorId === currentFloorId) {
                        overlapping = true;
                    }
                } else if (other.a.structType === other.b.structType && otherFloorId === currentFloorId) {
                    overlapping = true;
                }
            }
        });
        return overlapping;
    }
}

export default Polygon;