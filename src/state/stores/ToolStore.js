
export class ToolStore {
  constructor() {
    this.activeTool = null;
    this.isDragging = false;
    this.draggedObject = null;
    this.dragStartPos = null;
    this.dropPos = null;
    this.listeners = [];
  }

  setActiveTool(toolName) {
    this.activeTool = toolName;
    this.notify();
    return true;
  }

  getActiveTool() {
    return this.activeTool;
  }

  clearActiveTool() {
    this.activeTool = null;
    this.notify();
  }

  startDrag(draggedObject, startPos) {
    this.isDragging = true;
    this.draggedObject = draggedObject;
    this.dragStartPos = startPos;
    this.notify();
  }

  updateDragPosition(currentPos) {
    if (!this.isDragging) return;
    this.dropPos = currentPos;
    this.notify();
  }

  endDrag() {
    if (!this.isDragging) return null;

    const draggedObject = this.draggedObject;
    this.isDragging = false;
    this.draggedObject = null;
    this.dragStartPos = null;
    this.dropPos = null;
    this.notify();

    return draggedObject;
  }

  cancelDrag() {
    this.isDragging = false;
    this.draggedObject = null;
    this.dragStartPos = null;
    this.dropPos = null;
    this.notify();
  }

  getDragState() {
    return {
      isDragging: this.isDragging,
      draggedObject: this.draggedObject,
      dragStartPos: this.dragStartPos,
      dropPos: this.dropPos
    };
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
        console.error('Error in ToolStore listener:', error);
      }
    });
  }
}
