
export class SelectionStore {
  constructor() {
    this.selectedDeviceIds = [];
    this.selectedFurnitureIds = [];
    this.selectedLinkIds = [];
    this.focusedId = null;
    this.focusedType = null;
    this.highlightedIds = [];
    this.listeners = [];
  }

  _clearObjectSelections() {
    this.selectedDeviceIds = [];
    this.selectedFurnitureIds = [];
    this.selectedLinkIds = [];
  }

  _setFocus(id, type) {
    this.focusedId = id;
    this.focusedType = type;
  }

  _ensureFocusedSelection() {
    if (this.focusedId) return;

    if (this.selectedDeviceIds.length > 0) {
      this._setFocus(this.selectedDeviceIds[this.selectedDeviceIds.length - 1], 'device');
      return;
    }

    if (this.selectedFurnitureIds.length > 0) {
      this._setFocus(this.selectedFurnitureIds[this.selectedFurnitureIds.length - 1], 'furniture');
      return;
    }

    if (this.selectedLinkIds.length > 0) {
      this._setFocus(this.selectedLinkIds[this.selectedLinkIds.length - 1], 'cable');
      return;
    }

    this._setFocus(null, null);
  }

  focusedNode(id, type) {
    this._setFocus(id, type);
    this._clearObjectSelections();

    console.log(`Focused on ${type} with ID: ${id}`);

    this.notify();
  }

  isFocused(id) {
    return this.focusedId === id;
  }

  canAddChild(requiredParentType) {
    return this.focusedType === requiredParentType;
  }

  selectDevice(deviceId, multiSelect = false) {
    if (!multiSelect) {
      this._clearObjectSelections();
    }

    if (!this.selectedDeviceIds.includes(deviceId)) {
      this.selectedDeviceIds.push(deviceId);
    }

    this._setFocus(deviceId, 'device');
    this.notify();
  }

  deselectDevice(deviceId) {
    this.selectedDeviceIds = this.selectedDeviceIds.filter(id => id !== deviceId);
    if (this.focusedId === deviceId) {
      this._setFocus(null, null);
    }
    this._ensureFocusedSelection();
    this.notify();
  }

  selectConduit(conduitId, multiSelect = false) {
    if (!multiSelect) {
      this._clearObjectSelections();
    }
    this._setFocus(conduitId, 'conduit');
    this.notify();
  }

  deselectConduit(conduitId) {
    if (this.focusedId === conduitId) {
      this._setFocus(null, null);
    }
    this.notify();
  }

  selectRiser(riserId, multiSelect = false) {
    if (!multiSelect) this._clearObjectSelections();
    this._setFocus(riserId, 'riser');
    this.notify();
  }

  deselectRiser(riserId) {
    if (this.focusedId === riserId) this._setFocus(null, null);
    this.notify();
  }

  selectUndergroundConduit(ugConduitId, multiSelect = false) {
    if (!multiSelect) this._clearObjectSelections();
    this._setFocus(ugConduitId, 'underground-conduit');
    this.notify();
  }

  deselectUndergroundConduit(ugConduitId) {
    if (this.focusedId === ugConduitId) this._setFocus(null, null);
    this.notify();
  }

  toggleDeviceSelection(deviceId) {
    if (this.isDeviceSelected(deviceId)) {
      this.deselectDevice(deviceId);
      return false;
    }

    this.selectDevice(deviceId, true);
    return true;
  }

  selectFurniture(furnitureId, multiSelect = false) {
    if (!multiSelect) {
      this._clearObjectSelections();
    }

    if (!this.selectedFurnitureIds.includes(furnitureId)) {
      this.selectedFurnitureIds.push(furnitureId);
    }

    this._setFocus(furnitureId, 'furniture');
    this.notify();
  }

  deselectFurniture(furnitureId) {
    this.selectedFurnitureIds = this.selectedFurnitureIds.filter(id => id !== furnitureId);
    if (this.focusedId === furnitureId) {
      this._setFocus(null, null);
    }
    this._ensureFocusedSelection();
    this.notify();
  }

  toggleFurnitureSelection(furnitureId) {
    if (this.isFurnitureSelected(furnitureId)) {
      this.deselectFurniture(furnitureId);
      return false;
    }

    this.selectFurniture(furnitureId, true);
    return true;
  }

  selectLink(linkId, multiSelect = false) {
    if (!multiSelect) {
      this._clearObjectSelections();
    }

    if (!this.selectedLinkIds.includes(linkId)) {
      this.selectedLinkIds.push(linkId);
    }

    this._setFocus(linkId, 'cable');
    this.notify();
  }

  deselectLink(linkId) {
    this.selectedLinkIds = this.selectedLinkIds.filter(id => id !== linkId);
    if (this.focusedId === linkId) {
      this._setFocus(null, null);
    }
    this._ensureFocusedSelection();
    this.notify();
  }

  toggleLinkSelection(linkId) {
    if (this.isLinkSelected(linkId)) {
      this.deselectLink(linkId);
      return false;
    }

    this.selectLink(linkId, true);
    return true;
  }

  clearSelection() {
    this._clearObjectSelections();
    this._setFocus(null, null);
    this.highlightedIds = [];
    this.notify();
  }

  focusSelection(id, type) {
    this._setFocus(id, type);
    this.notify();
  }

  setHighlight(ids) {
    this.highlightedIds = Array.isArray(ids) ? ids : [ids];
    this.notify();
  }

  clearHighlight() {
    this.highlightedIds = [];
    this.notify();
  }

  getSelectedDeviceIds() {
    return [...this.selectedDeviceIds];
  }

  getSelectedLinkIds() {
    return [...this.selectedLinkIds];
  }

  getSelectedFurnitureIds() {
    return [...this.selectedFurnitureIds];
  }

  getFocusedId() {
    return this.focusedId;
  }

  isDeviceSelected(deviceId) {
    return this.selectedDeviceIds.includes(deviceId);
  }

  isLinkSelected(linkId) {
    return this.selectedLinkIds.includes(linkId);
  }

  isFurnitureSelected(furnitureId) {
    return this.selectedFurnitureIds.includes(furnitureId);
  }

  isHighlighted(id) {
    return this.highlightedIds.includes(id);
  }

  getSelectionCount() {
    return this.selectedDeviceIds.length + this.selectedFurnitureIds.length + this.selectedLinkIds.length;
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

  notify() {
    this.listeners.forEach(listener => {
      try {
        listener(this);
      } catch (error) {
        console.error('Error in SelectionStore listener:', error);
      }
    });
  }
}
