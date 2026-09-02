export default class Wall {
    constructor(data={}) {
        this.id = data.id || `wall-${Math.random().toString(36).substr(2, 9)}`;
        this.label = data.label || 'New Wall';
        this.type = 'wall';
        this.floorId = data.floorId || null;
        this.spaceId = data.spaceId || null;
        this.geometry = {
            start: { x: data.x || 0, y: data.y || 0 },
            end: { x: data.x2 || 0, y: data.y2 || 0 }
        };
        this.transform = {
            position: { x: data.transform.x || 0, y: 0, z: data.transform.y || 0 },
            rotation: { x: 0, y: 0, z: 0 },
            scale: data.transform.scale
        };
    }
}