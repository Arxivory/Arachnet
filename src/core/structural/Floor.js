import appState from '../../state/AppState';
import Fenestration from './Fenestration';
import Space from './Space';

export default class Floor {
    constructor(data = {}) {
        this.id = data.id || `floor-${Math.random().toString(36).substr(2, 9)}`;
        this.siteId = data.siteId;
        this.shapeType = appState.structural.sites.find(s => s.id === this.siteId).shapeType;
        this.label = data.label || 'Floor';
        this.structureType = data.structureType || 'Floor';
        this.type = data.type || 'floor';
        this.altitude = data.altitude || 0; 

        this.geometry = {
            x: data.x || 0,
            y: data.y || 0,
            width: data.w || 0,
            height: data.h || 0,
            radius: data.r || 0,
            points: data.points ? [...data.points] : []
        };

        this.spaces = data.spaces ? data.spaces.map(s => new Space(s)) : [];

        this.fenestrations = data.fenestrations
            ? data.fenestrations.map(f => new Fenestration(f))
            : [];
    }

    addFenestration(fenestration) {
        fenestration.parentId = this.id;
        this.fenestrations.push(fenestration);
        return fenestration;
    }
    getWalls() {
        return this.fenestrations.filter(f => f.type === 'wall');
    }

    getParentId() {
        return this.siteId;
    }
}