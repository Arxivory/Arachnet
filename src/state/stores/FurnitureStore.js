import Furniture from "../../core/furniture/Furniture"
import appState from "../AppState";

export class FurnitureStore {
    constructor() {
        this.furnitures = [];
        this.listeners = [];
    };

    addFurniture(furniture) {
        if (!furniture.id) {
            throw new Error("Furniture must have an ID");
        }
        if (this.furnitures.find(f => f.id === furniture.id)) {
            console.warn(`Furniture with ID ${furniture.id} already exists. Skipping add.`);
            return null;
        }

        const floor = appState.structural.getFloor(furniture.floorId);

        const newFurnitureData = {
            id: furniture.id,
            type: furniture.catalogId,
            label: furniture.label || furniture.name || null,
            floorId: furniture.floorId || null,
            spaceId: furniture.spaceId || null,
            transform: {
                position: { x: furniture.position.x * 0.7, y: floor.altitude + 2, z: furniture.position.y * 0.7 },
                rotation: { x: 0, y: 0, z: 0 },
                scale: { x: 4, y: 4, z: 4 }
            }
        }

        const newFurniture = new Furniture(newFurnitureData);
        newFurniture.type = furniture.catalogId;
        newFurniture.floorId = furniture.floorId || null;
        newFurniture.spaceId = furniture.spaceId || null;

        this.furnitures.push(newFurniture);
        this.notify();
        return newFurniture;
    };

    removeFurniture(furnitureId) {
        const index = this.furnitures.findIndex(f => f.id === furnitureId);
        if (index === -1) {
            console.warn(`Furniture with ID ${furnitureId} not found. Cannot remove.`);
            return false;
        }
        this.furnitures.splice(index, 1);
        window.dispatchEvent(new CustomEvent('forceCanvasDelete', { detail: { id: furnitureId } }));
        this.notify();
        return true;
    }

    updateFurniture(furnitureId, updates) {
        const furniture = this.furnitures.find(f => f.id === furnitureId);
        if (!furniture) return false;

        Object.assign(furniture, updates);
        this.notify();
        return true;
    }

    getFurniture(furnitureId) {
        return this.furnitures.find(f => f.id === furnitureId) || null;
    }

    notify() {
        for (const listener of this.listeners) {
            listener(this);
        }
    }

    subscribe(callback) {
        if (typeof callback !== 'function') {
            console.error('Listener must be a function');
            return () => {};
        }

        this.listeners.push(callback);
        return () => {
            this.listeners = this.listeners.filter(l => l !== callback);
        };
    }
};