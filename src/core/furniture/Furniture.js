export default class Furniture {
    constructor({
        id,
        type,
        label = null,
        siteId = null, floorId = null, spaceId = null, domainId = null,
        transform = {}
    }) {
        this.id = id;
        this.type = type;
        this.label = label;

        this.siteId = siteId;
        this.floorId = floorId;
        this.spaceId = spaceId;
        this.domainId = domainId;

        this.transform = {
            position: transform.position || { x: 0, y: 0, z: 0 },
            rotation: transform.rotation || { x: 0, y: 0, z: 1 },
            scale: transform.scale || { x: 1, y: 1, z: 1 }
        }
    }
}