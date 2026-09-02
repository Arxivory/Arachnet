
export class ModeStore {
  constructor() {
    this.current = 'logical';
    this.previous = null;
    this.listeners = [];

    this.AVAILABLE_TOOLS = {
      logical: [
        'createDomain',
        'createSite',
        'createSpace',
        'addDevice',
        'drawWall',
        'drawCable',
        'select',
        'pan'
      ],
      physical: [
        'addDevice',
        'drawCable',
        'rotate',
        'scale',
        'select',
        'pan'
      ]
    };

    this.DEVICE_TYPES = [
      'Router',
      'Switch',
      'Hub',
      'EndDevice',
      'Wireless',
      'Firewall'
    ];
  }

  switchMode(newMode) {
    if (newMode === this.current) return false;

    if (!['logical', 'physical'].includes(newMode)) {
      console.error(`Invalid mode: ${newMode}`);
      return false;
    }

    this.previous = this.current;
    this.current = newMode;
    this.notify();
    return true;
  }

  getCurrentMode() {
    return this.current;
  }

  getPreviousMode() {
    return this.previous;
  }

  getAvailableTools() {
    return this.AVAILABLE_TOOLS[this.current] || [];
  }

  isToolAvailable(toolName) {
    return this.getAvailableTools().includes(toolName);
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
        console.error('Error in ModeStore listener:', error);
      }
    });
  }
}
