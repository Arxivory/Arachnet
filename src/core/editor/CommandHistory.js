/**
 * CommandHistory manages command execution and undo/redo coordination
 * Integrates with CommandStore for persistence
 */
export class CommandHistory {
  constructor(commandStore) {
    this.commandStore = commandStore;
  }

  /**
   * Execute a command, immediately apply it, and push to undo stack
   * @param {Command} command - The command to execute
   */
  executeCommand(command) {
    if (!command) {
      console.warn('Attempted to execute null or undefined command');
      return;
    }

    try {
      // 1. Execute the command (applies changes immediately)
      command.execute();

      // 2. Push to command store's undo stack (clears redo stack)
      this.commandStore.pushCommand(command);

      console.log(`✅ Executed: ${command.getDescription()}`);
    } catch (error) {
      console.error(`❌ Failed to execute command: ${command.getDescription()}`, error);
      throw error;
    }
  }

  /**
   * Undo the last command
   */
  undo() {
    const command = this.commandStore.undo();
    if (!command) {
      console.log('Nothing to undo');
      return;
    }

    try {
      command.undo();
      console.log(`↶ Undone: ${command.getDescription()}`);
    } catch (error) {
      console.error(`❌ Failed to undo command: ${command.getDescription()}`, error);
      // Re-push to undo stack if undo failed
      this.commandStore.pushCommand(command);
      throw error;
    }
  }

  /**
   * Redo the last undone command
   */
  redo() {
    const command = this.commandStore.redo();
    if (!command) {
      console.log('Nothing to redo');
      return;
    }

    try {
      command.redo();
      console.log(`↷ Redone: ${command.getDescription()}`);
    } catch (error) {
      console.error(`❌ Failed to redo command: ${command.getDescription()}`, error);
      // Re-push to redo stack if redo failed
      this.commandStore.redoStack.push(command);
      throw error;
    }
  }

  /**
   * Check if undo is available
   */
  canUndo() {
    return this.commandStore.canUndo();
  }

  /**
   * Check if redo is available
   */
  canRedo() {
    return this.commandStore.canRedo();
  }

  /**
   * Clear all history
   */
  clearHistory() {
    this.commandStore.clearHistory();
    console.log('History cleared');
  }

  /**
   * Get the undo/redo manager instance for UI subscriptions
   */
  getCommandStore() {
    return this.commandStore;
  }
}
