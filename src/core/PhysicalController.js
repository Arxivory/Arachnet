import * as THREE from 'three';
import appState from '../state/AppState.js';
import deviceCatalog from '../data/deviceCatalog.js';
import furnitureCatalog from '../data/furnitureCatalog.js';
import { GLTFLoader, MTLLoader, OBJLoader, FBXLoader } from 'three/examples/jsm/Addons.js';
import DomainMesh from './rendering/structures/DomainMesh';
import SiteMesh from './rendering/structures/SiteMesh';
import SpaceMesh from './rendering/structures/SpaceMesh';
import FloorMesh from './rendering/structures/FloorMesh';
import FurnitureMesh from './rendering/furnitures/FurnitureMesh';
import DeviceMesh from './rendering/devices/DeviceMesh';
import { GizmoManager } from './rendering/GizmoManager.js';
import { getScene, getCamera, getRenderer } from './rendering/SceneAccess';
import WallMesh from './rendering/structures/WallMesh.js';
import CableMesh from './rendering/cables/CableMesh.js';
import { CableRouteManager } from './cabling/CableRouteManager.js';

export class PhysicalController {
    constructor(scene) {
        this.scene = scene;
        this.store = appState.structural;
        this.networkStore = appState.network;
        this.furnitureStore = appState.furniture;
        this.meshes = new Map();
        this.defaultScaler = 0.7;
        this.defaultFloorHeight = 3.0; 

        this.objLoader = new OBJLoader();
        this.mtlLoader = new MTLLoader();
        this.gltfLoader = new GLTFLoader();
        this.fbxLoader = new FBXLoader();

        this.domainMeshes = new Map();
        this.siteMeshes = new Map();
        this.floorMeshes = new Map(); 
        this.spaceMeshes = new Map();
        this.wallMeshes = new Map();
        this.deviceMeshes =  new Map();
        this.cableMeshes = new Map();
        this.furnitureMeshes = new Map();
        this.selectionHelpers = new Map();

        this.furnitureCatalog = furnitureCatalog.furnitures;

        this.routeManager = new CableRouteManager(this.store, this.defaultScaler);

        this.unsubscribe = this.store.subscribe(() => this.syncWithState());
        this.unsubscribeNetwork = this.networkStore.subscribe(() => this.syncWithState());
        this.unsubscribeFurniture = this.furnitureStore.subscribe(() => this.syncWithState());
        
        this.gizmoManager = new GizmoManager(getCamera(), getRenderer().domElement, getScene());

        window.addEventListener('gizmoObjectMoved', (e) => {
            this._refreshCablesForDevice(e.detail.id);
        });

        this.gizmoManager.onTransformsApplied = () => {
            this.syncSelectionState(appState.selection);
        };
        
        appState.selection.subscribe((selectionStore) => {
            this.syncSelectionState(selectionStore);
        });

        this.syncWithState();
    }

    syncWithState() {
        const domains = this.store.domains;
        const sites = this.store.sites;
        const floors = this.store.floors;
        const spaces = this.store.spaces;
        const walls = this.store.walls;
        const devices = this.networkStore.devices;
        const furnitures = this.furnitureStore.furnitures;
        const links = this.networkStore.links;

        console.log(`[PhysicalController.syncWithState] Domains: ${domains.length}, Sites: ${sites.length}, Floors: ${floors.length}, Spaces: ${spaces.length}`);

        const activeDomainIds = new Set();
        const activeSiteIds = new Set();
        const activeFloorIds = new Set();
        const activeSpaceIds = new Set();
        const activeWallIds = new Set();
        const activeDeviceIds = new Set();
        const activeFurnitureIds = new Set();
        const activeLinkIds = new Set();

        for (const domain of domains) {
            activeDomainIds.add(domain.id);

            if (this.domainMeshes.has(domain.id)) {
                continue;
            } 

            this.createDomainMesh(domain);
        }

        for (const site of sites) {
            activeSiteIds.add(site.id);

            if (this.siteMeshes.has(site.id))
                continue;

            this.createSiteMesh(site);
        }

        for (const floor of floors) {
            activeFloorIds.add(floor.id);

            if (this.floorMeshes.has(floor.id)) {
                console.log(`Floor ${floor.id} already rendered, skipping`);
                continue;
            }

            console.log(`Processing new floor ${floor.id} with altitude ${floor.altitude}`);
            this.createFloorMesh(floor);
        }

        for (const space of spaces) {
            activeSpaceIds.add(space.id);

            if (this.spaceMeshes.has(space.id))
                continue;

            this.createSpaceMesh(space);
        }

        for (const wall of walls) {
            activeWallIds.add(wall.id);

            if (this.wallMeshes.has(wall.id)) 
                continue;

            const floor = this.store.floors.find(f => f.id === wall.floorId);
            const altitude = floor ? floor.altitude || 0 : 0;

            const newWall = new WallMesh(wall, this.defaultScaler);
            const newWallMesh = newWall.getWallMesh();

            newWallMesh.position.y = altitude;

            this.scene.add(newWallMesh);
            this.wallMeshes.set(wall.id, newWallMesh);
        }

        for (const device of devices) {
            console.log('Processing device for rendering: ', device);
            activeDeviceIds.add(device.id);

            const floor = this.store.floors.find(f => f.id === device.floorId);
            const altitude = floor ? floor.altitude || 0 : 0;

            if (this.deviceMeshes.has(device.id)) {
                const deviceMesh = this.deviceMeshes.get(device.id);
                console.log('Device Mesh: ', device, ' is updating');
                if (device.transform) {
                    deviceMesh.position.set(device.transform.position.x, device.transform.position.y, device.transform.position.z);
                    deviceMesh.rotation.set(device.transform.rotation.x, device.transform.rotation.y, device.transform.rotation.z);
                    deviceMesh.scale.set(device.transform.scale.x, device.transform.scale.y, device.transform.scale.z);
                }
            } else {
                this.createDeviceGLTFMesh(device);
            }
        }

        for ( const furniture of furnitures) {
            console.log('Processing furniture for rendering:', furniture);
            activeFurnitureIds.add(furniture.id);

            const floor = this.store.floors.find(f => f.id === furniture.floorId);
            const altitude = floor ? floor.altitude || 0 : 0;

            if (this.furnitureMeshes.has(furniture.id)) {
                const furnitureMesh = this.furnitureMeshes.get(furniture.id);
                if (furniture.transform) {
                    furnitureMesh.position.set(furniture.transform.position.x, furniture.transform.position.y, furniture.transform.position.z);
                    furnitureMesh.rotation.set(furniture.transform.rotation.x, furniture.transform.rotation.y, furniture.transform.rotation.z);
                    furnitureMesh.scale.set(furniture.transform.scale.x, furniture.transform.scale.y, furniture.transform.scale.z);
                }
            } else {
                this.createFurnitureGLTFMesh(furniture).catch(err => 
                    console.error(`Failed to load furniture ${furniture.id}:`, err)
                );
            }
        }

        this.routeManager.resolveAll(links, devices, true);

        for (const link of links) {
            console.log(link);
            activeLinkIds.add(link.id);
            
            if (this.cableMeshes.has(link.id)) {
                const existingCable = this.cableMeshes.get(link.id);
                existingCable.updateResolvedPath(this.routeManager.getPath(link.id));
                continue;
            }

            this.createCableMesh(link);
        }

        for (const [id, mesh] of this.domainMeshes) {
            if (!activeDomainIds.has(id)) {
                this.scene.remove(mesh);
                this.domainMeshes.delete(id);
            }
        }

        for (const [id, mesh] of this.siteMeshes) {
            if (!activeSiteIds.has(id)) {
                this.scene.remove(mesh);
                this.siteMeshes.delete(id);
            }
        }

        for (const [id, mesh] of this.floorMeshes) {
            if (!activeFloorIds.has(id)) {
                this.scene.remove(mesh);
                this.floorMeshes.delete(id);
            }
        }

        for (const [id, mesh] of this.spaceMeshes) {
            if (!activeSpaceIds.has(id)) {
                this.scene.remove(mesh);
                this.spaceMeshes.delete(id);
            }
        }

        for (const [id, mesh] of this.wallMeshes) {
            if (!activeWallIds.has(id)) {
                this.scene.remove(mesh);
                this.wallMeshes.delete(id);
            }
        }

        for (const [id, mesh] of this.deviceMeshes) {
            if (!activeDeviceIds.has(id)) {
                this.scene.remove(mesh);
                this.deviceMeshes.delete(id);
            }
        }

        for (const [id, mesh] of this.furnitureMeshes) {
            if (!activeFurnitureIds.has(id)) {
                this.scene.remove(mesh);
                this.furnitureMeshes.delete(id);
            }
        }

        for (const [id, mesh] of this.cableMeshes) {
            if (!activeLinkIds.has(id)) {
                this.scene.remove(mesh);
                this.cableMeshes.delete(id);
            }
        }

        this.syncSelectionState(appState.selection);
    }

    syncSelectionState(selectionStore) {
        if (!selectionStore) return;

        const selectedIds = new Set([
            ...(selectionStore.getSelectedDeviceIds?.() || []),
            ...(selectionStore.getSelectedFurnitureIds?.() || [])
        ]);

        const focusedId = selectionStore.getFocusedId?.();
        const focusedType = selectionStore.focusedType;
        const focusedIsPhysicalAsset = focusedId && (focusedType === 'device' || focusedType === 'furniture');
        if (focusedIsPhysicalAsset) {
            selectedIds.add(focusedId);
        }

        for (const [id] of this.selectionHelpers) {
            if (!selectedIds.has(id)) {
                this.removeSelectionHelper(id);
            }
        }

        for (const id of selectedIds) {
            const mesh = this.getMeshById(id);
            if (!mesh || (mesh.userData.type !== 'device' && mesh.userData.type !== 'furniture')) {
                this.removeSelectionHelper(id);
                continue;
            }

            let helper = this.selectionHelpers.get(id);
            if (!helper) {
                helper = new THREE.BoxHelper(mesh, 0x00AEEF);
                helper.material.depthTest = false;
                helper.renderOrder = 999;
                this.scene.add(helper);
                this.selectionHelpers.set(id, helper);
            }

            helper.update();
            helper.visible = true;
        }

        if (focusedIsPhysicalAsset) {
            const selectedMesh = this.getMeshById(focusedId);
            if (selectedMesh && (selectedMesh.userData.type === 'device' || selectedMesh.userData.type === 'furniture')) {
                this.gizmoManager.attach(selectedMesh);
                return;
            }
        }

        this.gizmoManager.detach();
    }

    removeSelectionHelper(id) {
        const helper = this.selectionHelpers.get(id);
        if (!helper) return;

        this.scene.remove(helper);
        helper.geometry?.dispose?.();
        helper.material?.dispose?.();
        this.selectionHelpers.delete(id);
    }

    _refreshCablesForDevice(deviceId) {
        const links = this.networkStore.links;
        const devices = this.networkStore.devices;
        this.routeManager.reResolveForDevice(deviceId, links, devices);
        for (const [linkId, cable] of this.cableMeshes) {
            if (cable.sourceDeviceId === deviceId || cable.targetDeviceId === deviceId) {
                const newPath = this.routeManager.getPath(linkId);
                cable.updateResolvedPath(newPath);
            }
        }
    }


    createDomainMesh(domain) {
        const newDomain = new DomainMesh(domain, this.defaultScaler);
        switch (domain.shapeType) {
            case 'rectangle':
                const rectangularMesh = newDomain.getRectangularForm();
                this.scene.add(rectangularMesh);
                this.domainMeshes.set(domain.id, rectangularMesh);
                break;
            case 'polygon':
                const polygonalMesh = newDomain.getPolygonalForm();
                this.scene.add(polygonalMesh);
                this.domainMeshes.set(domain.id, polygonalMesh);
                break;
            case 'circle':
                const circularMesh = newDomain.getCircularForm();
                this.scene.add(circularMesh);
                this.domainMeshes.set(domain.id, circularMesh);
                break;
            default:
                console.warn(`Unknown domain shape type: ${domain.shapeType}`);
                break;
        }
    }

    createSiteMesh(site) {
        const newSite = new SiteMesh(site, this.defaultScaler);
        switch (site.shapeType) {
            case 'rectangle':
                const rectangularMesh = newSite.getRectangularForm();
                this.scene.add(rectangularMesh);
                this.siteMeshes.set(site.id, rectangularMesh);
                break;
            case 'polygon':
                const polygonalMesh = newSite.getPolygonalForm();
                this.scene.add(polygonalMesh);
                this.siteMeshes.set(site.id, polygonalMesh);
                break;
            case 'circle':
                const circularMesh = newSite.getCircularForm();
                this.scene.add(circularMesh);
                this.siteMeshes.set(site.id, circularMesh);
                break;
            default:
                console.warn(`Unknown site shape type: ${site.shapeType}`);
                break;
        }
    }

    createSpaceMesh(space) {
        const floor = this.store.floors.find(f => f.id === space.floorId);
        const altitude = floor ? floor.altitude || 0 : 0;

        const newSpace = new SpaceMesh(space, this.defaultScaler);
        let mesh;

        switch (space.shapeType) {
            case 'rectangle':
                mesh = newSpace.getRectangularForm();
                break;
            case 'polygon':
                mesh = newSpace.getPolygonalForm();
                break;
            case 'circle':
                mesh = newSpace.getCircularForm();
                break;
            default:
                console.warn(`Unknown space shape type: ${space.shapeType}`);
                return;
        }

        mesh.position.y = altitude;

        this.scene.add(mesh);
        this.spaceMeshes.set(space.id, mesh);
    }

    createFloorMesh(floor) {
        const site = this.store.sites.find(s => s.id === floor.siteId);
        if (!site) {
            console.warn(`Site not found for floor ${floor.id}`);
            return;
        }

        const newFloor = new FloorMesh(site, this.defaultScaler);
        let mesh;

        console.log(`Creating floor ${floor.id} with altitude ${floor.altitude}`);

        switch (floor.shapeType) {
            case 'rectangle':
                mesh = newFloor.getRectangularForm();
                break;
            case 'polygon':
                mesh = newFloor.getPolygonalForm();
                break;
            case 'circle':
                mesh = newFloor.getCircularForm();
                break;
            default:
                console.warn(`Unknown floor shape type: ${floor.shapeType}`);
                return;
        }

        mesh.position.y = floor.altitude || 0;

        this.scene.add(mesh);
        this.floorMeshes.set(floor.id, mesh);
    }

    async createDeviceGLTFMesh(device) {
        const newDevice = new DeviceMesh(device, this.defaultScaler);
        const deviceMesh = await newDevice.getMesh({
            gltfLoader: this.gltfLoader,
            objLoader: this.objLoader,
            fbxLoader: this.fbxLoader,
        }, deviceCatalog);

        const floor = this.store.floors.find(f => f.id === device.floorId);
        const altitude = floor ? floor.altitude || 0 : 0;

        const worldY = (device.transform?.position?.y ?? 0) + altitude + 2;
        deviceMesh.position.set(
            device.transform?.position?.x ?? 0,
            worldY,
            device.transform?.position?.z ?? 0
        );

        device.transform.position.y = worldY;

        deviceMesh.userData = { id: device.id, type: 'device' };
        // Apply floor altitude to position the device at the correct vertical height
        deviceMesh.position.y = altitude;

        this.scene.add(deviceMesh);
        this.deviceMeshes.set(device.id, deviceMesh);
    }

    createCableMesh(link) {
        const resolvedPath = this.routeManager.getPath(link.id);
        const newCable = new CableMesh(link, this.defaultScaler, this.deviceMeshes, resolvedPath);
        const cableMesh = newCable.getMesh();
        this.scene.add(cableMesh);
        this.cableMeshes.set(link.id, newCable);
    }

    async createFurnitureGLTFMesh(furniture) {
        if (this.furnitureMeshes.has(furniture.id)) {
            return this.furnitureMeshes.get(furniture.id);
        }

        const newFurniture = new FurnitureMesh(furniture, this.defaultScaler);
        const furnitureMesh = await newFurniture.getMesh(this.gltfLoader, this.furnitureCatalog);

        if (this.furnitureMeshes.has(furniture.id)) {
            return this.furnitureMeshes.get(furniture.id);
        }

        const floor = this.store.floors.find(f => f.id === furniture.floorId);
        const altitude = floor ? floor.altitude || 0 : 0;

        const worldY = (furniture.transform?.position?.y ?? 0) + altitude + 2;
        furnitureMesh.position.set(
            furniture.transform?.position?.x ?? 0,
            worldY,
            furniture.transform?.position?.z ?? 0
        );

        furnitureMesh.userData = { id: furniture.id, type: 'furniture' };
        // Apply floor altitude to position the furniture at the correct vertical height
        furnitureMesh.position.y = altitude;

        this.scene.add(furnitureMesh);
        this.furnitureMeshes.set(furniture.id, furnitureMesh);
    }
    
    updateDomainMesh(domain) {
        const { x, y, width, height } = domain.geometry;

        const modifiedX = x * this.defaultScaler;
        const modifiedY = y * this.defaultScaler;
        const modifiedWidth = width * this.defaultScaler;
        const modifiedHeight = height * this.defaultScaler;

        const mesh = this.domainMeshes.get(domain.id);
        mesh.scale.set(modifiedWidth, 1, modifiedHeight);
        mesh.position.set(modifiedX, 0.1, modifiedY);
    }

    getMeshById(id) {
        if (this.domainMeshes.has(id)) return this.domainMeshes.get(id);
        if (this.siteMeshes.has(id)) return this.siteMeshes.get(id);
        if (this.floorMeshes.has(id)) return this.floorMeshes.get(id);
        if (this.spaceMeshes.has(id)) return this.spaceMeshes.get(id);
        if (this.deviceMeshes.has(id)) return this.deviceMeshes.get(id);
        if (this.furnitureMeshes.has(id)) return this.furnitureMeshes.get(id);
        return null;
    }

    setGizmoTransformMode(mode) {
        this.gizmoManager.setTransformMode(mode);
    }
}
