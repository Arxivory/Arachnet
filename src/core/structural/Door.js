export default class Door {
    constructor(data={}) {
        this.id = data.id || `door-${Math.random().toString(36).substr(2, 9)}`;
        this.label = data.label || 'Door';
        this.type = 'door';
        this.floorId = data.floorId || null;
        this.spaceId = data.spaceId || null;

        this.geometry = {
            x: data.x || 0,
            y: data.y || 0,
            width: data.w || 0,
            height: data.h || 0
        };

        this.transform = {
            position: data.transform?.position || { x: data.x || 0, y: 0, z: data.y || 0 },
            rotation: data.transform?.rotation || { x: 0, y: 0, z: 0 },
            scale: data.transform?.scale || { factor: 1, w: data.w || 0, h: data.h || 0 }
        };
    }
}