/**
 * NetworkSimulationClock.js
 * 
 * Manages time progression in the network simulation.
 * Can run in:
 *  - Real-time mode: simulation time = wall-clock time
 *  - Accelerated mode: simulation can run faster or slower than real-time
 *  - Step mode: advance by discrete time intervals
 * 
 * Usage:
 *   const clock = new NetworkSimulationClock();
 *   clock.start();
 *   const now = clock.now();  // Current simulation time in ms
 */

export default class NetworkSimulationClock {
  constructor() {
    this.startRealTime = null;
    this.startSimTime = 0;
    this.elapsedMs = 0;
    this.timeScale = 1.0;  // 1.0 = real-time, 2.0 = 2x speed, 0.5 = half speed
    this._isRunning = false;
    this.listeners = [];
  }

  /**
   * Start the clock.
   */
  start() {
    if (this._isRunning) return;
    this.startRealTime = Date.now();
    this.startSimTime = this.elapsedMs;
    this._isRunning = true;
    console.log('[NetworkSimulationClock] Started');
  }

  /**
   * Stop the clock.
   */
  stop() {
    if (!this._isRunning) return;
    // Update elapsedMs before stopping
    this.elapsedMs = this.startSimTime + (Date.now() - this.startRealTime) * this.timeScale;
    this._isRunning = false;
    console.log('[NetworkSimulationClock] Stopped');
  }

  /**
   * Advance the clock by a specific amount (step mode).
   */
  advance(ms) {
    if (this._isRunning) {
      console.warn('[NetworkSimulationClock] Cannot advance while running');
      return;
    }
    this.elapsedMs += ms;
    this._notifyListeners();
  }

  /**
   * Get current simulation time in milliseconds.
   */
  now() {
    if (!this._isRunning) {
      return this.elapsedMs;
    }
    return this.startSimTime + (Date.now() - this.startRealTime) * this.timeScale;
  }

  /**
   * Set simulation time scale.
   * @param {number} scale - 1.0 = real-time, 2.0 = 2x speed, etc.
   */
  setTimeScale(scale) {
    if (scale <= 0) {
      console.warn('[NetworkSimulationClock] Time scale must be positive');
      return;
    }
    
    if (this._isRunning) {
      // Adjust start time to maintain continuous progression
      this.elapsedMs = this.now();
      this.startRealTime = Date.now();
      this.startSimTime = this.elapsedMs;
    }
    
    this.timeScale = scale;
    console.log(`[NetworkSimulationClock] Time scale set to ${scale}x`);
  }

  /**
   * Subscribe to clock updates.
   */
  subscribe(callback) {
    this.listeners.push(callback);
  }

  /**
   * Unsubscribe from clock updates.
   */
  unsubscribe(callback) {
    this.listeners = this.listeners.filter(l => l !== callback);
  }

  /**
   * Notify listeners of clock updates.
   * 
   * @private
   */
  _notifyListeners() {
    for (const listener of this.listeners) {
      listener(this.now());
    }
  }

  /**
   * Get clock status.
   */
  getStatus() {
    return {
      isRunning: this._isRunning,
      elapsedMs: this.now(),
      timeScale: this.timeScale,
      wallClockMs: Date.now(),
    };
  }
}
