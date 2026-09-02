export default class Domain {
    constructor(data = {}) {
        this.id = data.id || `domain-${Math.random().toString(36).substr(2, 9)}`;
        this.label = data.label || 'New Domain';
        this.type = data.structureType;

        this.shapeType = data.shapeType;

        this.geometry = {
            x: data.x || 0,
            y: data.y || 0,
            width: data.w || 0,
            height: data.h || 0,
            radius: data.r || 0,
            points: data.points ? [...data.points] : []
        };

        this.siteIds = data.siteIds || [];
    }

}