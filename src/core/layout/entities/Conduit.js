import { Circle as SystemCircle } from "check2d";

export class Conduit {
    constructor(x, y, system) {
        this.x = x;
        this.y = y;
        this.system = system;
        this.radius = 3.0;
        this.type = 'conduit';
        this.wallId  = null;
        this.floorId = null;
        this.spaceId = null;
        this.wallT   = 0.5;
        this.hitTestMode = 'path';
        this.initPath();
        this.initBody();
        this.initTransform();
    }

    initPath() {
        this.path = new Path2D();
        this.path.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    }

    initBody() {
        const margin = 0.001;
        this.body = new SystemCircle({ x: this.x, y: this.y }, this.radius - margin);
        this.body.structType = 'conduit';
        this.system.insert(this.body);
    }

    initTransform() {
        this.transform = {
            position: { x: this.x, y: 0, z: this.y },
            scale: { factor: 1, r: this.radius },
            rotation: { x: 0, y: 0, z: 0 }
        };
    }

    moveTo(x, y) {
        this.x = x;
        this.y = y;
        this.transform.position.x = x;
        this.transform.position.z = y;

        this.path = new Path2D();
        this.path.arc(x, y, this.radius, 0, Math.PI * 2);

        if (this.body) {
            this.body.setPosition(x, y, true);
        }
    }

    saveCurrentPosition() {
        this.savedPosition = { x: this.x, y: this.y };
    }

    restoreToSavedPosition() {
        if (!this.savedPosition) return;
        this.moveTo(this.savedPosition.x, this.savedPosition.y);
    }
}

export default Conduit;