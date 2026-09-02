import Domain from "../../core/structural/Domain";
import Site from "../../core/structural/Site";
import Floor from "../../core/structural/Floor";
import Space from "../../core/structural/Space";
import Wall from "../../core/structural/Wall";
import Door from "../../core/structural/Door";
import Window from "../../core/structural/Window";
import Conduit from "../../core/structural/Conduit";
import Riser from "../../core/structural/Riser";
import UndergroundConduit from "../../core/structural/UndergroundConduit";
import appState from "../AppState";

export class StructuralStore {
    constructor() {
        this.domains = [];
        this.sites = [];
        this.floors = [];
        this.doors = [];
        this.spaces = [];
        this.listeners = [];
        this.walls = [];
        this.windows = [];
        this.conduits = [];
        this.risers = [];
        this.undergroundConduits = [];
    }

    // ============= Domain Methods =============
    addDomain(domain) {
        if (!domain.id) {
            throw new Error('Domain must have an id');
        }

        if (this.domains.find(d => d.id === domain.id)) {
            console.warn(`Domain already exists: ${domain.id}`);
            return null;
        }

        const newDomain = new Domain(domain);

        console.log('Adding domain: ', newDomain);

        this.domains.push(newDomain);
        this.notify();
        return newDomain;
    }

    removeDomain(domainId) {
        const index = this.domains.findIndex(d => d.id === domainId);
        if (index === -1) {
            console.warn(`Domain not found: ${domainId}`);
            return false;
        }

        // 1. Gather all child IDs that belong to this domain BEFORE deleting
        const siteIds = this.sites.filter(s => s.domainId === domainId).map(s => s.id);
        const floorIds = this.floors.filter(f => siteIds.includes(f.siteId)).map(f => f.id);
        const spaceIds = this.spaces.filter(sp => floorIds.includes(sp.floorId)).map(sp => sp.id);

        // --- NEW: Bulletproof Cascading Delete for Assets ---
        if (appState.network) {
            const allDevices = Array.isArray(appState.network.devices) ? appState.network.devices : [];
            const devicesToDelete = allDevices.filter(d =>
                d.domainId === domainId || siteIds.includes(d.siteId) || floorIds.includes(d.floorId) || spaceIds.includes(d.spaceId)
            );
            devicesToDelete.forEach(d => {
                if (typeof appState.network.removeDevice === 'function') appState.network.removeDevice(d.id);
            });
        }

        if (appState.furniture) {
            const allFurniture = Array.isArray(appState.furniture.furnitures) ? appState.furniture.furnitures : [];
            const furnituresToDelete = allFurniture.filter(f =>
                floorIds.includes(f.floorId) || spaceIds.includes(f.spaceId)
            );
            furnituresToDelete.forEach(f => {
                if (typeof appState.furniture.removeFurniture === 'function') appState.furniture.removeFurniture(f.id);
            });
        }

        // 2. Perform the deletions
        this.sites = this.sites.filter(s => s.domainId !== domainId);
        this.floors = this.floors.filter(f => !siteIds.includes(f.siteId));
        this.spaces = this.spaces.filter(sp => !floorIds.includes(sp.floorId));
        this.domains.splice(index, 1);

        window.dispatchEvent(new CustomEvent('forceCanvasDelete', { detail: { id: domainId } }));

        this.notify();
        // 3. Return an array of EVERY ID that was just deleted
        return [domainId, ...siteIds, ...floorIds, ...spaceIds];
    }

    getDomain(domainId) {
        return this.domains.find(d => d.id === domainId);
    }

    // ============= Site Methods =============
    addSite(site) {
        if (!site.id) {
            throw new Error('Site must have an id');
        }

        if (!site.domainId) {
            throw new Error('Site must have a domainId');
        }

        if (this.sites.find(s => s.id === site.id)) {
            console.warn(`Site already exists: ${site.id}`);
            return null;
        }

        const newSite = new Site(site);

        console.log('Adding new Site: ', newSite, ' with domain of: ', site.domainId);

        this.sites.push(newSite);
        this.notify();
        
        // --- CRITICAL FIX: Return the instantiated class, not the raw argument ---
        return newSite; 
    }

    removeSite(siteId) {
        const index = this.sites.findIndex(s => s.id === siteId);
        if (index === -1) {
            console.warn(`Site not found: ${siteId}`);
            return false;
        }

        const floorIds = this.floors.filter(f => f.siteId === siteId).map(f => f.id);
        const spaceIds = this.spaces.filter(sp => floorIds.includes(sp.floorId)).map(sp => sp.id);

        // --- NEW: Bulletproof Cascading Delete for Assets ---
        if (appState.network) {
            const allDevices = Array.isArray(appState.network.devices) ? appState.network.devices : [];
            const devicesToDelete = allDevices.filter(d =>
                d.siteId === siteId || floorIds.includes(d.floorId) || spaceIds.includes(d.spaceId)
            );
            devicesToDelete.forEach(d => {
                if (typeof appState.network.removeDevice === 'function') appState.network.removeDevice(d.id);
            });
        }

        if (appState.furniture) {
            const allFurniture = Array.isArray(appState.furniture.furnitures) ? appState.furniture.furnitures : [];
            const furnituresToDelete = allFurniture.filter(f =>
                floorIds.includes(f.floorId) || spaceIds.includes(f.spaceId)
            );
            furnituresToDelete.forEach(f => {
                if (typeof appState.furniture.removeFurniture === 'function') appState.furniture.removeFurniture(f.id);
            });
        }

        this.floors = this.floors.filter(f => f.siteId !== siteId);
        this.spaces = this.spaces.filter(sp => !floorIds.includes(sp.floorId));
        this.sites.splice(index, 1);

        window.dispatchEvent(new CustomEvent('forceCanvasDelete', { detail: { id: siteId } }));

        this.notify();
        return [siteId, ...floorIds, ...spaceIds];
    }

    getSitesByDomain(domainId) {
        return this.sites.filter(s => s.domainId === domainId);
    }

    addFloor(floor) {
        if (!floor.id) {
            floor.id = Date.now();
        }
        if (!floor.siteId) {
            console.warn('Floor must have a siteId');
            return null;
        }
        if (this.floors.find(f => f.id === floor.id)) {
            console.warn(`Floor already exists: ${floor.id}`);
            return null;
        }

        if (floor.altitude === undefined || floor.altitude === null) {
            const existingFloorsForSite = this.floors.filter(f => f.siteId === floor.siteId);
            const DEFAULT_FLOOR_HEIGHT = 50.0;
            floor.altitude = existingFloorsForSite.length * DEFAULT_FLOOR_HEIGHT;
            console.log(`Auto-calculated floor altitude: ${floor.altitude} for floor ${floor.id}`);
        }

        const newFloor = new Floor(floor);
        this.floors.push(newFloor);
        this.notify();
        return newFloor;
    }

    removeFloor(floorId) {
        const index = this.floors.findIndex(f => f.id === floorId);
        if (index === -1) {
            console.warn(`Floor not found: ${floorId}`);
            return false;
        }

        const spaceIds = this.spaces.filter(sp => sp.floorId === floorId).map(sp => sp.id);
        this.conduits = this.conduits.filter(c => 
            c.floorId !== floorId && !spaceIds.includes(c.spaceId)
        );

        // --- NEW: Bulletproof Cascading Delete for Assets ---
        if (appState.network) {
            const allDevices = Array.isArray(appState.network.devices) ? appState.network.devices : [];
            const devicesToDelete = allDevices.filter(d =>
                d.floorId === floorId || spaceIds.includes(d.spaceId)
            );
            devicesToDelete.forEach(d => {
                if (typeof appState.network.removeDevice === 'function') appState.network.removeDevice(d.id);
            });
        }

        if (appState.furniture) {
            const allFurniture = Array.isArray(appState.furniture.furnitures) ? appState.furniture.furnitures : [];
            const furnituresToDelete = allFurniture.filter(f =>
                f.floorId === floorId || spaceIds.includes(f.spaceId)
            );
            furnituresToDelete.forEach(f => {
                if (typeof appState.furniture.removeFurniture === 'function') appState.furniture.removeFurniture(f.id);
            });
        }

        this.spaces = this.spaces.filter(sp => sp.floorId !== floorId);
        this.floors.splice(index, 1);
        
        window.dispatchEvent(new CustomEvent('forceCanvasDelete', { detail: { id: floorId } }));
        
        if (appState.ui && appState.ui.activeFloorId === floorId) {
            appState.ui.setActiveFloor(null);
            if (window.__layoutRef) window.__layoutRef.setActiveFloor(null);
        }
        
        this.notify();
        return [floorId, ...spaceIds];
    }

    getFloorsBySite(siteId) {
        return this.floors.filter(f => f.siteId === siteId);
    }

    // ============= Space Methods =============
    addSpace(space) {
        if (!space.id) {
            space.id = Date.now();
        }
        if (!space.floorId) {
            console.warn('Space must have a floorId');
            return null;
        }
        if (this.spaces.find(s => s.id === space.id)) {
            console.warn(`Space already exists: ${space.id}`);
            return null;
        }

        const floor = this.getFloor(space.floorId);
        if (floor) {
            space.siteId = floor.siteId;
        }

        const newSpace = new Space(space);

        console.log(`Adding Space: `, newSpace, 'With a Floor ID: ', newSpace.floorId);

        this.spaces.push(newSpace);
        this.notify();
        return newSpace;
    }

    removeSpace(spaceId) {
        const index = this.spaces.findIndex(s => s.id === spaceId);
        if (index === -1) return false;

        // --- NEW: Bulletproof Cascading Delete for Assets ---
        if (appState.network) {
            const allDevices = Array.isArray(appState.network.devices) ? appState.network.devices : [];
            const devicesToDelete = allDevices.filter(d => d.spaceId === spaceId);

            devicesToDelete.forEach(d => {
                if (typeof appState.network.removeDevice === 'function') appState.network.removeDevice(d.id);
            });
        }

        if (appState.furniture) {
            const allFurniture = Array.isArray(appState.furniture.furnitures) ? appState.furniture.furnitures : [];
            const furnituresToDelete = allFurniture.filter(f => f.spaceId === spaceId);

            furnituresToDelete.forEach(f => {
                if (typeof appState.furniture.removeFurniture === 'function') appState.furniture.removeFurniture(f.id);
            });
        }

        this.conduits = this.conduits.filter(c => c.spaceId !== spaceId);

        this.spaces.splice(index, 1);

        window.dispatchEvent(new CustomEvent('forceCanvasDelete', { detail: { id: spaceId } }));

        this.notify();
        return [spaceId];
    }

    removeWall(wallId) {
        const index = this.walls.findIndex(w => w.id === wallId);
        if (index === -1) {
            console.warn(`Wall not found: ${wallId}`);
            return false;
        }
        this.walls.splice(index, 1);
        this.notify();
        return [wallId];
    }

    addConduit(conduit) {
        if (!conduit.id) throw new Error('Conduit must have an id');
        if (this.conduits.find(c => c.id === conduit.id)) return null;

        const newConduit = new Conduit(conduit);

        this.conduits.push(newConduit);
        this.notify();
        return newConduit;
    }

    removeConduit(conduitId) {
        const index = this.conduits.findIndex(c => c.id === conduitId);
        if (index === -1) return false;
        this.conduits.splice(index, 1);
        this.notify();
        return true;
    }

    updateConduit(conduitId, updates) {
        const conduit = this.conduits.find(c => c.id === conduitId);
        if (!conduit) return null;
        Object.assign(conduit, updates);
        if (updates.x !== undefined || updates.y !== undefined) {
            if (!conduit.transform) conduit.transform = { position: {} };
            if (!conduit.transform.position) conduit.transform.position = {};
            if (updates.x !== undefined) conduit.transform.position.x = updates.x;
            if (updates.y !== undefined) conduit.transform.position.z = updates.y;
        }
        this.notify();
        return conduit;
    }

    addRiser(riser) {
        if (!riser.id) throw new Error('Riser must have an id');
        if (this.risers.find(r => r.id === riser.id)) return null;

        const newRiser = new Riser(riser);

        this.risers.push(newRiser);
        this.notify();
        return newRiser;
    }

    removeRiser(riserId) {
        const index = this.risers.findIndex(r => r.id === riserId);
        if (index === -1) return false;
        this.risers.splice(index, 1);
        this.notify();
        return true;
    }

    updateRiser(riserId, updates) {
        const riser = this.risers.find(r => r.id === riserId);
        if (!riser) return null;
        Object.assign(riser, updates);
        if (updates.x !== undefined || updates.y !== undefined) {
            if (!riser.transform) riser.transform = { position: {} };
            if (!riser.transform.position) riser.transform.position = {};
            if (updates.x !== undefined) riser.transform.position.x = updates.x;
            if (updates.y !== undefined) riser.transform.position.z = updates.y;
        }
        this.notify();
        return riser;
    }

    addUndergroundConduit(ugConduit) {
        if (!ugConduit.id) throw new Error('Underground Conduit must have an id');
        if (this.undergroundConduits.find(ug => ug.id === ugConduit.id)) return null;

        const newUGConduit = new UndergroundConduit(ugConduit);

        this.undergroundConduits.push(newUGConduit);
        this.notify();
        return newUGConduit;
    }

    removeUndergroundConduit(ugConduitId) {
        const index = this.undergroundConduits.findIndex(ug => ug.id === ugConduitId);
        if (index === -1) return false;
        this.undergroundConduits.splice(index, 1);
        this.notify();
        return true;
    }

    updateUndergroundConduit(ugConduitId, updates) {
        const ugConduit = this.undergroundConduits.find(ug => ug.id === ugConduitId);
        if (!ugConduit) return null;
        Object.assign(ugConduit, updates);
        if (updates.x !== undefined || updates.y !== undefined) {
            if (!ugConduit.transform) ugConduit.transform = { position: {} };
            if (!ugConduit.transform.position) ugConduit.transform.position = {};
            if (updates.x !== undefined) ugConduit.transform.position.x = updates.x;
            if (updates.y !== undefined) ugConduit.transform.position.z = updates.y;
        }
        this.notify();
        return ugConduit;
    }

    getSpacesByFloor(floorId) {
        return this.spaces.filter(s => s.floorId === floorId);
    }

    getFloor(floorId) {
        return this.floors.find(f => f.id === floorId);
    }

    addFenestration(floorId, fenestration) {
        const floor = this.getFloor(floorId);
        if (!floor) {
            console.warn(`Floor not found for fenestration: ${floorId}`);
            return null;
        }
        const added = floor.addFenestration(fenestration);
        this.notify();
        return added;
    }

    addWall(wall) {
        if (!wall.id) {
            throw Error('Wall must have an id');
        }

        const newWall = new Wall(wall);
        this.walls.push(newWall);
        this.notify();
        return newWall;
    }

    addDoor(door) {
        if (!door.id) {
            throw new Error('Door must have an id');
        }

        if (this.doors.find(d => d.id === door.id)) {
            console.warn(`Door already exists: ${door.id}`);
            return null;
        }

        const newDoor = new Door(door);

        console.log('Adding door: ', newDoor);
        this.doors.push(newDoor);
        this.notify();
        return newDoor;
    }

    addWindow(window) {
        if (!window.id) {
            throw new Error('Window must have an id');
        }

        if (this.windows.find(w => w.id === window.id)) {
            console.warn(`Window already exists: ${window.id}`);
            return null;
        }

        const newWindow = new Window(window);

        console.log('Adding window: ', newWindow);
        this.windows.push(newWindow);
        this.notify();
    }

    getAncestorsId() {
        const parentID = appState.selection.getFocusedId();
        const ancestorsId = [parentID];
        let ancestor = this.getById(parentID);
        while (ancestor.getParentId){
            ancestor = this.getById(ancestor.getParentId());
            ancestorsId.push(ancestor.id);
        }
        return ancestorsId;
    }

    getById(targetId) {
        const lookup = new Map(
            [...this.domains, ...this.sites, ...this.floors, ...this.doors,
            ...this.spaces, ...this.walls, ...this.windows]
                .map(x => [x.id, x])
        );
        const item = lookup.get(targetId);
        return item;
    }

    renameStructure(id, newLabel, type) {
        let item = null;

        // Find the right array based on the type
        if (type === 'domain') item = this.domains.find(d => d.id === id);
        else if (type === 'site') item = this.sites.find(s => s.id === id);
        else if (type === 'floor') item = this.floors.find(f => f.id === id);
        else if (type === 'space') item = this.spaces.find(sp => sp.id === id);
        else if (type === 'wall') item = this.walls.find(w => w.id === id);

        // If we found it, update the label and tell the UI to re-render
        if (item) {
            item.label = newLabel;
            this.notify();
            return true;
        }

        console.warn(`Could not find ${type} with ID ${id} to rename.`);
        return false;
    }

    // ============= Generic Remove Router =============
    removeStructure(id) {
        // Check Domains
        if (this.domains.some(d => d.id === id)) {
            console.log(`Removing Domain: ${id}`);
            return this.removeDomain(id);
        }

        // Check Sites
        if (this.sites.some(s => s.id === id)) {
            console.log(`Removing Site: ${id}`);
            return this.removeSite(id);
        }

        // Check Floors
        if (this.floors.some(f => f.id === id)) {
            console.log(`Removing Floor: ${id}`);
            return this.removeFloor(id);
        }

        // Check Spaces
        if (this.spaces.some(sp => sp.id === id)) {
            console.log(`Removing Space: ${id}`);
            return this.removeSpace(id);
        }

        // Check Walls
        if (this.walls.some(w => w.id === id)) {
            console.log(`Removing Wall: ${id}`);
            return this.removeWall(id);
        }

        // Not found in structural store
        return false;
    }

    // ============= Hierarchy Tree Builder =============
    getHierarchyTree(networkStore = null, furnitureStore = null) {
        return this.domains.map(domain => ({
            id: domain.id,
            label: domain.label || `Domain ${domain.id}`,
            type: 'domain',
            children: this._buildSiteChildren(domain.id, networkStore, furnitureStore)
        }));
    }

    _buildSiteChildren(domainId, networkStore = null, furnitureStore = null) {
        const sites = this.sites.filter(s => String(s.domainId) === String(domainId));
        
        return sites.map(site => {
            const floorChildren = this._buildFloorChildren(site.id, networkStore, furnitureStore);

            const siteUndergroundConduits = this.undergroundConduits
                .filter(ug => String(ug.siteId) === String(site.id))
                .map(ug => ({
                    id: ug.id,
                    label: ug.label || `Underground Conduit ${ug.id}`,
                    type: 'undergroundConduit',
                    siteId: ug.siteId,
                    children: []
                }));

            return {
                id: site.id,
                label: site.label || `Site ${site.id}`,
                type: 'site',
                domainId: site.domainId,
                children: [...floorChildren, ...siteUndergroundConduits]
            };
        });
    }

    _buildFloorChildren(siteId, networkStore = null, furnitureStore = null) {
        const floors = this.floors.filter(f => String(f.siteId) === String(siteId));
        return floors.map(floor => ({
            id: floor.id,
            label: floor.label || `Floor ${floor.id}`,
            type: 'floor',
            siteId: floor.siteId,
            children: this._buildFloorItemChildren(floor.id, networkStore, furnitureStore)
        }));
    }

    _buildFloorItemChildren(floorId, networkStore = null, furnitureStore = null) {
        const spaces = this._buildSpaceChildren(floorId, networkStore, furnitureStore);

        const devicesWithoutSpace = [];
        if (networkStore) {
            const allDevices = networkStore.getAllDevices();
            devicesWithoutSpace.push(...allDevices
                .filter(d => d.floorId === floorId && !d.spaceId)
                .map(device => ({
                    id: device.id,
                    label: device.label || device.hostname || `Device ${device.id}`,
                    type: 'device',
                    floorId: device.floorId,
                    deviceId: device.id,
                    children: []
                }))
            );
        }

        const furnituresWithoutSpace = [];
        if (furnitureStore) {
            furnituresWithoutSpace.push(...furnitureStore.furnitures
                .filter(f => f.floorId === floorId && !f.spaceId)
                .map(furniture => ({
                    id: furniture.id,
                    label: furniture.label || furniture.type || `Furniture ${furniture.id}`,
                    type: 'furniture',
                    floorId: furniture.floorId,
                    furnitureId: furniture.id,
                    children: []
                }))
            );
        }

        const wallsOnFloor = this.walls
            .filter(w => w.floorId === floorId && !w.spaceId)
            .map(wall => ({
                id: wall.id,
                label: wall.label || `Wall ${wall.id}`,
                type: 'wall',
                floorId: wall.floorId,
                wallId: wall.id,
                children: []
            }));

        const windowsOnFloor = this.windows
            .filter(w => w.floorId === floorId && !w.spaceId)
            .map(window => ({
                id: window.id,
                label: window.label || `Window ${window.id}`,
                type: 'window',
                floorId: window.floorId,
                windowId: window.id,
                children: []
            }));

        return [...spaces, ...devicesWithoutSpace, ...furnituresWithoutSpace, ...wallsOnFloor, ...windowsOnFloor];
    }

    _buildSpaceChildren(floorId, networkStore = null, furnitureStore = null) {
        const spaces = this.spaces.filter(s => String(s.floorId) === String(floorId));
        return spaces.map(space => ({
            id: space.id,
            label: space.label || `Space ${space.id}`,
            type: 'space',
            floorId: space.floorId,
            children: this._buildSpaceItemChildren(space.id, networkStore, furnitureStore)
        }));
    }

    _buildSpaceItemChildren(spaceId, networkStore = null, furnitureStore = null) {
        const devicesInSpace = [];

        if (networkStore) {
            const allDevices = networkStore.getAllDevices();
            devicesInSpace.push(...allDevices
                .filter(d => d.spaceId === spaceId)
                .map(device => ({
                    id: device.id,
                    label: device.label || device.hostname || `Device ${device.id}`,
                    type: 'device',
                    floorId: device.floorId, // ADDED: lets TreeItem restore the correct active floor when this device is clicked
                    spaceId: device.spaceId,
                    deviceId: device.id,
                    children: []
                }))
            );
        }

        const furnituresInSpace = [];
        if (furnitureStore) {
            furnituresInSpace.push(...furnitureStore.furnitures
                .filter(f => f.spaceId === spaceId)
                .map(furniture => ({
                    id: furniture.id,
                    label: furniture.label || furniture.type || `Furniture ${furniture.id}`,
                    type: 'furniture',
                    spaceId: furniture.spaceId,
                    furnitureId: furniture.id,
                    children: []
                }))
            );
        }

        const wallsInSpace = this.walls
            .filter(w => w.spaceId === spaceId)
            .map(wall => ({
                id: wall.id,
                label: wall.label || `Wall ${wall.id}`,
                type: 'wall',
                spaceId: wall.spaceId,
                wallId: wall.id,
                children: []
            }));

        const doorsInSpace = this.doors
            .filter(d => d.spaceId === spaceId)
            .map(door => ({
                id: door.id,
                label: door.label || `Door ${door.id}`,
                type: 'door',
                spaceId: door.spaceId,
                doorId: door.id,
                children: []
            }));

        const windowsInSpace = this.windows
            .filter(w => w.spaceId === spaceId)
            .map(window => ({
                id: window.id,
                label: window.label || `Window ${window.id}`,
                type: 'window',
                spaceId: window.spaceId,
                windowId: window.id,
                children: []
            }));

        const conduits = this.conduits
            .filter(c => c.spaceId === spaceId)
            .map(conduit => ({
                id: conduit.id,
                label: conduit.label || `Conduit ${conduit.id}`,
                type: 'conduit',
                spaceId: conduit.spaceId,
                conduitId: conduit.id,
                children: []
            }));

        const risersInSpace = this.risers
        .filter(r => r.spaceId === spaceId)
        .map(r => ({
            id: r.id,
            label: r.label || `Riser ${r.id}`,
            type: 'riser',
            spaceId: r.spaceId,
            children: []
        }));

        return [...devicesInSpace, ...furnituresInSpace, ...wallsInSpace, ...doorsInSpace, ...windowsInSpace, ...conduits, ...risersInSpace];
    }

    subscribe(callback) {
        if (typeof callback !== 'function') {
            console.error('Listener must be a function');
            return () => { };
        }

        this.listeners.push(callback);
        return () => {
            this.listeners = this.listeners.filter(l => l !== callback);
        };
    }

    notify() {
        this.listeners.forEach(listener => {
            try {
                listener(this);
            } catch (error) {
                console.warn('Error in StructuralStore listener:', error);
            }
        })
    }
}