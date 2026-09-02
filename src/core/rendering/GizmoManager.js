import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import appState from '../../state/AppState.js';

export class GizmoManager {
  constructor(camera, canvas, scene) {
    this.scene = scene;
    this.camera = camera;
    this.canvas = canvas;

    this.control = new TransformControls(this.camera, this.canvas);
    this.helper = this.control.getHelper();
    this.scene.add(this.helper);
    this.control.setMode('translate');
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.initialized = false;
    this.isTransformInteracting = false;
    this.activeDragSelectionIds = [];
    this.dragPrimaryId = null;
    this.lastPrimaryPosition = null;
    this.isApplyingGroupTransform = false;
    this.onTransformsApplied = null;
    
    this._setupEventListeners();
  }

  setTransformMode(mode) {
    this.control.setMode(mode);
  }

  _setupEventListeners() {
    
    this.control.addEventListener('objectChange', () => {
      this._applyGroupTranslation();
      this._syncTransformToStore();

      const object = this.control.object;
      if (object?.userData?.id) {
          window.dispatchEvent(new CustomEvent('gizmoObjectMoved', {
              detail: { id: object.userData.id }
          }));
      }
    });

    this.control.addEventListener('dragging-changed', (event) => {
      this.isTransformInteracting = !!event.value;
      if (event.value) {
        this._captureDragSelectionState();
      } else {
        this.activeDragSelectionIds = [];
        this.dragPrimaryId = null;
        this.lastPrimaryPosition = null;
      }
    });

    window.addEventListener('keydown', (event) => {
      switch (event.key) {
        case 'p': this.control.setMode('translate'); break;
        case 'r': this.control.setMode('rotate'); break;
        case 'm': this.control.setMode('scale'); break;
        default: this.control.setMode('translate'); break;
      }
    });

    this.canvas.addEventListener('pointerdown', (event) => {
      this._onPointerDown(event);
    });
  }

  _onPointerDown(event) {
    if (event.button !== 0) return;
    if (this.isTransformInteracting || this.control.dragging || this.control.axis) return;
    const multiSelect = event.ctrlKey || event.metaKey || event.shiftKey;

    console.log('Selected a Mesh');

    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.pointer, this.camera);

    const intersects = this.raycaster.intersectObjects(
      this.scene.children.filter(obj => obj !== this.helper),
        true
    );

    if (intersects.length > 0) {
      let object = intersects[0].object;

      while (object && !object.userData?.id && object.parent) {
          object = object.parent;
      }

      if (object && object.userData?.id) {
          if (object.userData.type === 'device') {
            if (multiSelect) {
              appState.selection.toggleDeviceSelection?.(object.userData.id);
            } else {
              appState.selection.selectDevice(object.userData.id, false);
            }
          } else if (object.userData.type === 'furniture') {
            if (multiSelect) {
              appState.selection.toggleFurnitureSelection?.(object.userData.id);
            } else {
              appState.selection.selectFurniture?.(object.userData.id, false);
            }
          } else {
            if (!multiSelect) {
              appState.selection.clearSelection();
              this.detach();
            }
          }
      } else {
        if (!multiSelect) {
          appState.selection.clearSelection();
          this.detach();
        }
      }
    } else {
        if (!multiSelect) {
          this.detach();
          appState.selection.clearSelection();
        }
    }
  }

  attach(object) {
    this.control.attach(object);
  }

  detach() {
    this.control.detach();
  }

  _captureDragSelectionState() {
    const object = this.control.object;
    if (!object?.userData?.id) return;

    this.dragPrimaryId = object.userData.id;
    this.lastPrimaryPosition = object.position.clone();

    const ids = new Set([
      ...(appState.selection.getSelectedDeviceIds?.() || []),
      ...(appState.selection.getSelectedFurnitureIds?.() || [])
    ]);
    ids.add(this.dragPrimaryId);

    this.activeDragSelectionIds = [...ids];
  }

  _applyGroupTranslation() {
    const object = this.control.object;
    if (!object?.userData?.id) return;
    if (this.isApplyingGroupTransform) return;
    if (this.control.getMode?.() !== 'translate') return;
    if (!this.isTransformInteracting || !this.lastPrimaryPosition) return;
    if (!this.activeDragSelectionIds || this.activeDragSelectionIds.length <= 1) {
      this.lastPrimaryPosition = object.position.clone();
      return;
    }

    const delta = new THREE.Vector3().subVectors(object.position, this.lastPrimaryPosition);
    if (delta.lengthSq() === 0) return;

    this.isApplyingGroupTransform = true;
    try {
      for (const id of this.activeDragSelectionIds) {
        if (id === object.userData.id) continue;
        const mesh = this._findMeshById(id);
        if (!mesh) continue;

        mesh.position.add(delta);
        mesh.updateMatrixWorld?.();
      }
    } finally {
      this.isApplyingGroupTransform = false;
      this.lastPrimaryPosition = object.position.clone();
    }
  }

  _findMeshById(id) {
    let match = null;

    this.scene.traverse((obj) => {
      if (!match && obj?.userData?.id === id) {
        match = obj;
      }
    });

    return match;
  }

  _syncMeshTransform(mesh) {
    if (!mesh?.userData?.id) return;

    const { id, type } = mesh.userData;
    const updates = {
      position: { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z },
      rotation: { x: mesh.rotation.x, y: mesh.rotation.y, z: mesh.rotation.z },
      scale: { x: mesh.scale.x, y: mesh.scale.y, z: mesh.scale.z }
    };

    if (type === 'device') {
      const device = appState.network.getDevice(id);
      if (device) device.transform = updates;
    } else if (type === 'furniture') {
      const furniture = appState.furniture.getFurniture(id);
      if (furniture) furniture.transform = updates;
    }
  }

  _syncTransformToStore() {
    const object = this.control.object;
    if (!object || !object.userData.id) return;
    console.log('Syncing transform to store');

    if (this.control.getMode?.() === 'translate' && this.activeDragSelectionIds.length > 1) {
      for (const id of this.activeDragSelectionIds) {
        const mesh = this._findMeshById(id);
        if (mesh) {
          this._syncMeshTransform(mesh);
        }
      }
    } else {
      this._syncMeshTransform(object);
    }

    this.onTransformsApplied?.(this.activeDragSelectionIds);
    appState.notifyListeners();
  }
}