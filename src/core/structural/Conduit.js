export default class Conduit {
    constructor(data={}) {
        this.id = data.id || `conduit-${Math.random().toString(36).substr(2, 9)}`;
        this.label = data.label || 'New Conduit';
        this.type = 'conduit';
        this.floorId = data.floorId || null;
        this.spaceId = data.spaceId || null;
        this.transform = {
            position: { 
                x: data.x || 0, 
                y: 0, 
                z: data.y || 0 
            }
        };
    }
}