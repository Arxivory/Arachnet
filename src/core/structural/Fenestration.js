export default class Fenestration {
    constructor(data = {}) {
        this.id = data.id || `fen-${Math.random().toString(36).substr(2, 9)}`;
        
        this.type = data.type || 'wall'; 
        this.subType = data.subType || 'bearing'; 
        this.parentId = data.parentId; 

        this.geometry = {
            start: data.start || { x: 0, y: 0 },
            end: data.end || { x: 0, y: 0 },
            height: data.h || 2.4,
            thickness: this._getThickness(data.subType) 
        };
        
        this.material = data.material || 'drywall';
    }

    _getThickness(subType) {
        switch (subType) {
            case 'partition': return 0.1;
            case 'bearing': return 0.3;  
            default: return 0.2;
        }
    }
}