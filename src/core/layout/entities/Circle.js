import { Circle as SystemCircle } from "check2d";

export class Circle {
    constructor(startPoint, currentPoint, structureType, system) {
        this.id = null;
        this.x = startPoint.x;
        this.y = startPoint.y;
        this.initRadius(currentPoint);
        this.maxX = this.x + this.r;
        this.maxY = this.y + this.r;
        this.w = this.r * 2;
        this.h = this.r * 2;
        this.system = system;
        this.type = 'circle';
        this.structureType = structureType;
        this.hitTestMode = 'path';
        this.initPath();
        this.initBody();
        this.initTransform();

    }

    initRadius(currentPoint) {
        const dx = currentPoint.x - this.x;
        const dy = currentPoint.y - this.y;
        this.r = Math.hypot(dx, dy);
    }

    initPath() {
        this.path = new Path2D();
        this.path.arc(this.x, this.y, this.r, 0, Math.PI * 2);
    }

    initBody() {
        const margin = 0.001;
        this.body = new SystemCircle({ x: this.x, y: this.y }, this.r - margin);
        this.body.structType = this.structureType;
        this.system.insert(this.body);
    }

    initTransform() {
        this.transform = {
            position: { x: this.x, y: this.y, z: 0 },
            scale: { factor: 1, r: this.r },
            rotation: { x: 0, y: 0, z: 0 }
        }
    }

    updatePath() {
        const path = new Path2D();
        path.arc(this.x, this.y, this.transform.scale.r, 0, Math.PI * 2);
        this.path = path;
    }

    setScale(newScale) {
        this.transform.scale.factor = newScale.factor;
        this.transform.scale.r = this.r * newScale.factor;
        this.body.setScale(newScale.factor);
    }

    saveCurrentScale() {
        this.savedScale = JSON.parse(JSON.stringify(this.transform.scale));
    }

    restoreToSavedScale() {
        this.transform.scale = this.savedScale;
        this.body.setScale(this.transform.scale.factor);
    }

    saveCurrentPosition() {
        this.savedPosition = {
            x: this.x,
            y: this.y,
        };
    }

    restoreToSavedPosition() {
        this.x = this.savedPosition.x;
        this.y = this.savedPosition.y;
        this.transform.position.x = this.x;
        this.transform.position.y = this.y;
        this.body.setPosition(this.x, this.y, true);
    }

    move(dx, dy) {
        this.x += dx;
        this.y += dy;
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

export default Circle;