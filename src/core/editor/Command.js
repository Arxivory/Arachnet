/**
 * Base Command class for undo/redo system
 * All commands must implement execute(), undo(), and optionally redo()
 */
export class Command {
  constructor() {
    this.description = 'Command';
  }

  /**
   * Execute the command
   * This should change the state (both UI and data)
   * @return {void}
   */
  execute() {
    throw new Error('execute() must be implemented by subclass');
  }

  /**
   * Undo the command - reverse what execute() did
   * @return {void}
   */
  undo() {
    throw new Error('undo() must be implemented by subclass');
  }

  /**
   * Redo the command - re-apply after undo
   * By default, this just calls execute()
   * @return {void}
   */
  redo() {
    this.execute();
  }

  /**
   * Get a human-readable description of this command
   * @return {string}
   */
  getDescription() {
    return this.description;
  }
}
