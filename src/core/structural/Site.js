import Floor from './Floor';

export default class Site {
    constructor(data = {}) {
        this.id = data.id || `site-${Math.random().toString(36).substr(2, 9)}`;
        this.domainId = data.domainId;
        this.label = data.label || 'New Site';
        this.shapeType = data.shapeType;
        this.type = 'site';

        this.geometry = {
            x: data.x || 0,
            y: data.y || 0,
            width: data.w || 0,
            height: data.h || 0,
            radius: data.r || 0,
            points: data.points ? [...data.points]: []
        };

        this.floors = data.floors ? data.floors.map(f => new Floor(f)) : [];
        
    }
}