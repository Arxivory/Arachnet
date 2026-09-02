export default class UndergroundConduit {
    constructor(data={}) {
        this.id = data.id || `underground-conduit-${Math.random().toString(36).substr(2, 9)}`;
        this.label = data.label || 'New Underground Conduit';
        this.type = 'underground-conduit';
        this.siteId = data.siteId || null;
        this.transform = {
            position: { 
                x: data.x || 0, 
                y: 0, 
                z: data.y || 0 
            }
        };
    }
}