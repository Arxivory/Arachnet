import { Box } from "check2d";
import { Line } from "check2d";

export class Riser {
    constructor(x, y, width, height, system) {
        this.x = x;
        this.y = y;
        this.width = 20.0;
        this.height = 20.0;
        this.system = system;
        this.type = 'riser';
        this.wallId  = null;
        this.floorId = null;
        this.spaceId = null;
        this.hitTestMode = 'path';
        this.initPath();
        this.initBody();
        this.initTransform();
    }

    initPath() {
        this.path = new Path2D();
        this.path.rect(this.x, this.y, this.width, this.height);

        this.addCrossSymbol(this.path, this.x, this.y, this.width, this.height);
    }

    addCrossSymbol(path, x, y, width, height) {
        path.moveTo(x, y);
        path.lineTo(x + width, y + height);
        path.moveTo(x + width, y);
        path.lineTo(x, y + height);
    }

    initBody() {
        const margin = 0.001;
        this.body = new Box({ x: this.x, y: this.y }, this.width - margin, this.height - margin);
        this.body.structType = 'riser';
        this.system.insert(this.body);
    }

    initTransform() {
        this.transform = {
            position: { x: this.x, y: 0, z: this.y },
            scale: { factor: 1, x: this.width, y: this.height },
            rotation: { x: 0, y: 0, z: 0 }
        };
    }

    moveTo(x, y) {
        this.x = x;
        this.y = y;
        this.transform.position.x = x;
        this.transform.position.z = y;
        this.body.x = x;
        this.body.y = y;
        this.initPath();
    }

    saveCurrentPosition() {
        this.savedPosition = { x: this.x, y: this.y };
    }

    restoreToSavedPosition() {
        if (!this.savedPosition) return;
        this.moveTo(this.savedPosition.x, this.savedPosition.y);
    }
}