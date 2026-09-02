export class Selection {
    constructor(opts) {
        this.dpr = opts.dpr || 1;
    }

    getEntityPriority(en) {
        const isDevice = en.interfaces !== undefined || en.catalogId !== undefined;
        const isFurniture = en.type === 'furniture' || en.id?.startsWith('furniture');

        if (isDevice) return 5;     // ADDED: devices must win clicks over spaces/sites/domains
        if (isFurniture) return 4;  // ADDED: furniture should also sit above structural parents

        const priorityMap = {
            'Space': 3,
            'Floor': 2,
            'Site': 1,
            'Domain': 0
        };

        return priorityMap[en.structureType] ?? 0;
    }

    getFocusType(en) {
        const isDevice = en.interfaces !== undefined || en.catalogId !== undefined;
        const isFurniture = en.type === 'furniture' || en.id?.startsWith('furniture');

        if (isDevice) return 'device'; // ADDED: normalize device focus type instead of using router/switch/etc.
        if (isFurniture) return 'furniture'; // ADDED: normalize furniture focus type

        return en.structureType
            ? en.structureType.toLowerCase()
            : en.type;
    }

    identifyEntity(x, y, entities, ctx) {
        x *= this.dpr;
        y *= this.dpr;

        let bestMatch = null;
        let bestPriority = -1;

        for (const arr of entities) {
            for (const en of arr) {
                if (!en || !en.path) continue;

                if (this.wasHit(en, x, y, ctx)) {
                    const priority = this.getEntityPriority(en);
                    if (priority > bestPriority) {
                        bestMatch = en;
                        bestPriority = priority;
                    }
                }
            }
        }

        return bestMatch;
    }

    wasHit(en, x, y, ctx) {
        if (en.hitTestMode === 'path') {
            return ctx.isPointInPath(en.path, x, y);
        }
        else if (en.hitTestMode === 'stroke') {
            return ctx.isPointInStroke(en.path, x, y);
        }
    }
}
