export class EntityTransformer {

  applyEntityTransform(en, updates, checkForOverlap) {
    if (!en) return false;
    if (updates.position) {
      const nx = updates.position.x;
      const ny = updates.position.y;

      en.saveCurrentPosition();
      en.transform.position.x = nx;
      en.transform.position.y = ny;

      const deviceTypes = [
        'device',
        'router',
        'switch',
        'cables',
        'end-device',
        'wireless',
        'furniture'
      ]
      if (en.type === 'rectangle') {
        en.x = nx;
        en.y = ny;
        en.maxX = nx + en.transform.scale.w;
        en.maxY = ny + en.transform.scale.h;
        en.body.setPosition(en.x, en.y, true);
      }

      else if (en.type === 'polygon' || en.type === 'freeform') {
        const dx = nx - en.x;
        const dy = ny - en.y;
        en.move(dx, dy);
      }
      else if (en.type === 'circle') {
        en.x = nx;
        en.y = ny;
        en.body.setPosition(en.x, en.y, true);
      }
      else if (deviceTypes.includes(en.type)) {
        const cx = en.tileX + en.tileWidth / 2;
        const cy = en.tileY + en.tileHeight / 2;
        en.x = cx - en.renderWidth / 2;
        en.y = cy - en.renderHeight / 2;
        en.body.setPosition(en.tileX, en.tileY, true);
      }
      else if (en.type === 'wall' || en.type === 'cable') {
        const x = Math.min(en.transform.scale.x1, en.transform.scale.x2);
        const y = Math.min(en.transform.scale.y1, en.transform.scale.y2);
        const dx = nx - x;
        const dy = ny - y;
        en.move(dx, dy);
      }
      if (checkForOverlap(en, "transformation")) {
        console.log("Move area overlapping.");
        en.restoreToSavedPosition();
        return false;
      }
    }

    if (updates.scale !== undefined) {
      en.saveCurrentScale();
      en.setScale(updates.scale);
      if (checkForOverlap(en, "transformation")) {
        console.log(`Scaling area overlapping. Please Try again`);
        en.restoreToSavedScale();
        return false;
      }
    }

    if (updates.rotation) {
      en.transform.rotation = {
        ...en.transform.rotation,
        ...updates.rotation
      };
    }

    return true;
  }
}
export default EntityTransformer;