export default class Riser {
    constructor(data={}) {
        console.log('From Riser Class ', data);
        this.id = data.id || `riser-${Math.random().toString(36).substr(2, 9)}`;
        this.label = data.label || 'New Riser';
        this.type = 'riser';
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