
export class CommandStore {
  constructor() {
    this.undoStack = [];
    this.redoStack = [];
    this.maxStackSize = 100;
    this.listeners = [];
  }

  pushCommand(command) {
    this.undoStack.push(command);
    this.redoStack = [];

    if (this.undoStack.length > this.maxStackSize) {
      this.undoStack.shift();
    }

    this.notify();
  }

  undo() {
    if (this.undoStack.length === 0) return null;

    const command = this.undoStack.pop();
    this.redoStack.push(command);
    this.notify();

    return command;
  }

  redo() {
    if (this.redoStack.length === 0) return null;

    const command = this.redoStack.pop();
    this.undoStack.push(command);
    this.notify();

    return command;
  }

  canUndo() {
    return this.undoStack.length > 0;
  }

  canRedo() {
    return this.redoStack.length > 0;
  }

  getUndoStackLength() {
    return this.undoStack.length;
  }

  getRedoStackLength() {
    return this.redoStack.length;
  }

  clearHistory() {
    this.undoStack = [];
    this.redoStack = [];
    this.notify();
  }

  getUndoCommand() {
    return this.undoStack[this.undoStack.length - 1] || null;
  }

  getRedoCommand() {
    return this.redoStack[this.redoStack.length - 1] || null;
  }

  setMaxStackSize(size) {
    if (size > 0) {
      this.maxStackSize = size;
      if (this.undoStack.length > size) {
        this.undoStack = this.undoStack.slice(-size);
      }
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

  notify() {
    this.listeners.forEach(listener => {
      try {
        listener(this);
      } catch (error) {
        console.error('Error in CommandStore listener:', error);
      }
    });
  }
}
