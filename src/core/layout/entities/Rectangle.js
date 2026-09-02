import { Box } from "check2d";

export class Rectangle {
    constructor(startPoint, currentPoint, structureType, system) {
        this.id = null;
        this.x = Math.min(startPoint.x, currentPoint.x);
        this.y = Math.min(startPoint.y, currentPoint.y);
        this.maxX = Math.max(startPoint.x, currentPoint.x);
        this.maxY = Math.max(startPoint.y, currentPoint.y);
        this.w = this.maxX - this.x;
        this.h = this.maxY - this.y;
        this.system = system;
        this.type = 'rectangle';
        this.structureType = structureType;
        this.hitTestMode = 'path';
        this.initPath();
        this.initBody();
        this.initTransform();
    }

    initPath() {
        this.path = new Path2D();
        this.path.rect(this.x, this.y, this.w, this.h);
    }

    initBody() {
        const margin = 0.0001;
        this.body = new Box(
            { x: this.x + margin, y: this.y + margin },
            this.w - 2 * margin,
            this.h - 2 * margin
        );
        this.body.structType = this.structureType;
        this.system.insert(this.body);
    }

    initTransform() {
        this.transform = {
            position: { x: this.x, y: this.y, z: 0 },
            scale: { factor: 1, w: this.w, h: this.h },
            rotation: { x: 0, y: 0, z: 0 }
        }
    }


    updatePath() {
        const path = new Path2D();
        path.rect(this.x, this.y, this.transform.scale.w, this.transform.scale.h);
        this.path = path;
    }

    setWidthAndHeight(w, h) {
        this.w = w;
        this.h = h;
        this.transform.scale.w = w;
        this.transform.scale.h = h;
        this.body.width = w;
        this.body.height = h;
    }

    setScale(newScale) {
        this.transform.scale.factor = newScale.factor;
        this.transform.scale.w = this.w * newScale.factor;
        this.transform.scale.h = this.h * newScale.factor;
        this.maxX = this.x + this.transform.scale.w;
        this.maxY = this.y + this.transform.scale.h;
        this.body.setScale(newScale.factor, newScale.factor);
    }

    saveCurrentScale() {
        this.savedScale = JSON.parse(JSON.stringify(this.transform.scale));
    }

    restoreToSavedScale() {
        this.transform.scale = this.savedScale;
        this.maxX = this.x + this.transform.scale.w;
        this.maxY = this.y + this.transform.scale.h;
        this.body.setScale(this.transform.scale.factor, this.transform.scale.factor);
    }

    saveCurrentPosition() {
        this.savedPosition = {
            x: this.x,
            y: this.y,
            maxX: this.maxX,
            maxY: this.maxY
        }
    }

    restoreToSavedPosition() {
        this.x = this.savedPosition.x;
        this.y = this.savedPosition.y;
        this.maxX = this.savedPosition.maxX;
        this.maxY = this.savedPosition.maxY;
        this.transform.position.x = this.x;
        this.transform.position.y = this.y;
        this.body.setPosition(this.x, this.y, true);
    }

    getCurrentBounds() {
        return {
            minX: this.x,
            maxX: this.x + this.transform.scale.w,
            minY: this.y,
            maxY: this.y + this.transform.scale.h
        }
    }

    move(dx, dy) {
        this.x += dx;
        this.y += dy;
        this.maxX += dx;
        this.maxY += dy;
        this.transform.position.x += dx;
        this.transform.position.y += dy;
        this.body.setPosition(this.x, this.y, true);
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

export default Rectangle;