import { Line } from "check2d";

export class Wall {
    constructor(startPoint, currentPoint, system) {
        this.x = startPoint.x;
        this.y = startPoint.y;
        this.x2 = currentPoint.x;
        this.y2 = currentPoint.y;
        this.w = Math.abs(startPoint.x - currentPoint.x);
        this.h = Math.abs(startPoint.y - currentPoint.y);
        this.system = system;
        this.type = 'wall';
        this.hitTestMode = 'stroke';
        this.initPath();
        this.initBody();
        this.initTransform();
    }

    initPath() {
        this.path = new Path2D();
        this.path.moveTo(this.x, this.y);
        this.path.lineTo(this.x2, this.y2);
    }

    initBody() {
        let x1 = this.x;
        let x2 = this.x2;
        let y1 = this.y;
        let y2 = this.y2;
        const bodyPoints = this.applyMargin(x1,y1,x2,y2);
        this.body = new Line(
            { x: bodyPoints.x1, y: bodyPoints.y1 },
            { x: bodyPoints.x2, y: bodyPoints.y2 }
        );
        this.system.insert(this.body);
    }

    initTransform() {
        this.transform = {
            position: {
                x: Math.min(this.x, this.x2),
                y: Math.min(this.y, this.y2),
                z: 0
            },
            scale: { factor: 1, x1: this.x, y1: this.y, x2: this.x2, y2: this.y2 },
            rotation: { x: 0, y: 0, z: 0 }
        };

    }

    updatePath() {
        const path = new Path2D();
        const sx1 = this.transform.scale.x1;
        const sy1 = this.transform.scale.y1;
        const sx2 = this.transform.scale.x2;
        const sy2 = this.transform.scale.y2;
        path.moveTo(sx1 + 0.5, sy1 + 0.5);
        path.lineTo(sx2 + 0.5, sy2 + 0.5);
        this.path = path;
    }

    updateBody() {
        let x1 = this.transform.scale.x1;
        let x2 = this.transform.scale.x2;
        let y1 = this.transform.scale.y1;
        let y2 = this.transform.scale.y2;
        const bodyPoints = this.applyMargin(x1,y1,x2,y2);
        this.system.remove(this.body);
        this.body = new Line(
            { x: bodyPoints.x1, y: bodyPoints.y1 },
            { x: bodyPoints.x2, y: bodyPoints.y2 }
        );
        this.body.structType = 'Wall';
        this.system.insert(this.body);
    }

    applyMargin(x1, y1, x2, y2) {
        const margin = 0.0001;
        if (x1 <= x2) {
            x1 += margin;
            x2 -= margin;
        }
        else {
            x2 += margin;
            x1 -= margin;
        }
        if (y1 <= y2) {
            y1 += margin;
            y2 -= margin;
        }
        else {
            y2 += margin;
            y1 -= margin;
        }
        return { x1, y1, x2, y2};
    }


    setDisplayedPos() {
        const minX = Math.min(this.transform.scale.x1, this.transform.scale.x2);
        const minY = Math.min(this.transform.scale.y1, this.transform.scale.y2);
        this.transform.position.x = minX;
        this.transform.position.y = minY;

    }

    setScale(newScale) {
        const s = newScale.factor;
        this.transform.scale.factor = s;
        const x1 = this.x;
        const y1 = this.y;
        const x2 = this.x2;
        const y2 = this.y2;
        const ax = (x1 + x2) / 2;
        const ay = (y1 + y2) / 2;
        this.transform.scale.x1 = ax + (x1 - ax) * s;
        this.transform.scale.y1 = ay + (y1 - ay) * s;
        this.transform.scale.x2 = ax + (x2 - ax) * s;
        this.transform.scale.y2 = ay + (y2 - ay) * s;
        this.setDisplayedPos();
        this.updatePath();
        this.updateBody();
    }

    saveCurrentScale() {
        this.savedScale = JSON.parse(JSON.stringify(this.transform.scale));
    }

    restoreToSavedScale() {
        this.setScale(this.savedScale);
    }

    saveCurrentPosition() {
        this.savedPosition = {
            x1: this.x,
            y1: this.y,
            x2: this.x2,
            y2: this.y2,
            sx1: this.transform.scale.x1,
            sy1: this.transform.scale.y1,
            sx2: this.transform.scale.x2,
            sy2: this.transform.scale.y2
        }
    }

    restoreToSavedPosition() {
        this.x = this.savedPosition.x1;
        this.y = this.savedPosition.y1;
        this.x2 = this.savedPosition.x2;
        this.y2 = this.savedPosition.y2;
        this.transform.scale.x1 = this.savedPosition.sx1;
        this.transform.scale.y1 = this.savedPosition.sy1;
        this.transform.scale.x2 = this.savedPosition.sx2;
        this.transform.scale.y2 = this.savedPosition.sy2;
        this.setDisplayedPos();
        this.system.remove(this.body);
        this.body = new Line(
            { x: this.transform.scale.x1, y: this.transform.scale.y1 },
            { x: this.transform.scale.x2, y: this.transform.scale.y2 }
        );
        this.system.insert(this.body);

    }

    move(dx, dy) {
        this.x += dx;
        this.y += dy;
        this.x2 += dx;
        this.y2 += dy;
        this.setScale(this.transform.scale);
    }

    checkIfOverlapping(floorId) {
        let overlapping = false;
        this.system.checkOne(this.body, (other) => {
            if (other !== this.body) {
                const otherFloorId = other.b?.floorId ?? null;
                const currentFloorId = floorId ?? null;
                if (otherFloorId === currentFloorId) {
                    overlapping = true;
                }
            }
        });
        return overlapping;
    }
}


export default Wall;