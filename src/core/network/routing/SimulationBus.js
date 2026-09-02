/**
 * SimulationBus.js
 * 
 * Discrete event simulation engine.
 * Maintains a priority queue of timed events and executes them in order.
 * 
 * Replaces ad-hoc setTimeout calls with a centralized, pausable/replayable simulation.
 * 
 * Uses:
 *  - ARP request timeouts / retries
 *  - RIP periodic updates (every 30 seconds)
 *  - OSPF Hello timers
 *  - Link state advertisements
 *  - Packet transit simulation (instead of hardcoded setTimeout)
 * 
 * Features:
 *  - Priority queue (min-heap by timestamp)
 *  - Pause/resume/step simulation
 *  - Event logging & visualization hooks
 *  - Time acceleration (simulated time vs real time)
 */

/**
 * @typedef {object} SimulationEvent
 * @property {number} time        - When to execute (milliseconds in simulated time)
 * @property {string} type        - Event category ('arp-request', 'rip-update', 'link-down', etc.)
 * @property {Function} handler   - Callback: (event) => void
 * @property {object} data        - Event-specific data
 * @property {boolean} recurring  - If true, reschedule after executing
 * @property {number} [interval]  - Interval for recurring events (ms)
 */

export default class SimulationBus {
  constructor() {
    /**
     * Event queue (min-heap, sorted by time).
     * @type {SimulationEvent[]}
     */
    this._queue = [];

    /**
     * Current simulated time (milliseconds).
     * @type {number}
     */
    this._currentTime = 0;

    /**
     * Whether simulation is running.
     * @type {boolean}
     */
    this._running = false;

    /**
     * Simulation speed multiplier (1.0 = real-time, 2.0 = 2x speed).
     * @type {number}
     */
    this._speedFactor = 1.0;

    /**
     * Callback for event execution (logging/visualization).
     * @type {Function|null}
     */
    this._onEventExecuted = null;

    /**
     * Callback for pausing/resuming.
     * @type {Function|null}
     */
    this._onStateChanged = null;

    /**
     * Unique event ID counter.
     * @type {number}
     */
    this._eventIdCounter = 0;

    /**
     * Statistics.
     * @type {object}
     */
    this._stats = {
      eventsScheduled: 0,
      eventsExecuted: 0,
      eventsCanceled: 0,
    };
  }

  // ---------------------------------------------------------------------------
  // SCHEDULING
  // ---------------------------------------------------------------------------

  /**
   * Schedule an event to occur at a specific simulated time.
   * 
   * @param {number} delayMs - Delay from now (in simulated time)
   * @param {string} type - Event type/category
   * @param {Function} handler - Callback to execute
   * @param {object} [data] - Event-specific data
   * @param {object} [opts] - Options
   * @param {boolean} [opts.recurring] - Reschedule after executing
   * @param {number} [opts.interval] - Interval for recurring events
   * @returns {number} Event ID (for cancellation)
   */
  schedule(delayMs, type, handler, data = {}, opts = {}) {
    const eventId = this._eventIdCounter++;
    const executeTime = this._currentTime + delayMs;

    const event = {
      id: eventId,
      time: executeTime,
      type,
      handler,
      data,
      recurring: opts.recurring || false,
      interval: opts.interval || delayMs,
    };

    // Insert into queue (maintaining min-heap)
    this._insert(event);
    this._stats.eventsScheduled++;

    return eventId;
  }

  /**
   * Cancel a scheduled event by ID.
   * @param {number} eventId
   */
  cancel(eventId) {
    const index = this._queue.findIndex(e => e.id === eventId);
    if (index !== -1) {
      this._queue.splice(index, 1);
      this._stats.eventsCanceled++;
    }
  }

  /**
   * Cancel all events of a specific type.
   * @param {string} type
   */
  cancelByType(type) {
    const before = this._queue.length;
    this._queue = this._queue.filter(e => e.type !== type);
    this._stats.eventsCanceled += before - this._queue.length;
  }

  /**
   * Clear all events.
   */
  clear() {
    this._stats.eventsCanceled += this._queue.length;
    this._queue = [];
  }

  // ---------------------------------------------------------------------------
  // EXECUTION
  // ---------------------------------------------------------------------------

  /**
   * Start the simulation loop.
   * Processes events until stopped or queue is empty.
   */
  start() {
    if (this._running) return;
    this._running = true;
    this._notifyStateChanged('running');
    this._run();
  }

  /**
   * Stop the simulation.
   */
  stop() {
    this._running = false;
    this._notifyStateChanged('stopped');
  }

  /**
   * Pause the simulation without stopping it.
   */
  pause() {
    this._running = false;
    this._notifyStateChanged('paused');
  }

  /**
   * Resume from pause.
   */
  resume() {
    if (!this._running) {
      this._running = true;
      this._notifyStateChanged('running');
      this._run();
    }
  }

  /**
   * Execute one event and pause.
   * Useful for debugging/visualization.
   */
  step() {
    if (this._queue.length === 0) return;

    const event = this._queue.shift();
    this._currentTime = event.time;
    this._executeEvent(event);
  }

  /**
   * Run until a specific simulated time.
   * @param {number} untilTime - Simulated time to run until
   */
  runUntil(untilTime) {
    this._running = true;

    while (this._running && this._queue.length > 0) {
      const nextEvent = this._queue[0];
      if (nextEvent.time > untilTime) break;

      const event = this._queue.shift();
      this._currentTime = event.time;
      this._executeEvent(event);
    }

    this._running = false;
  }

  /**
   * Main simulation loop (runs asynchronously).
   * @private
   */
  _run() {
    if (!this._running) return;

    if (this._queue.length === 0) {
      this._running = false;
      this._notifyStateChanged('stopped');
      return;
    }

    const event = this._queue.shift();
    this._currentTime = event.time;

    // Execute event
    this._executeEvent(event);

    // Schedule next iteration (non-blocking)
    const timeTillNext = this._queue.length > 0 ? 0 : 100;
    setTimeout(() => this._run(), timeTillNext);
  }

  /**
   * Execute a single event.
   * @private
   */
  _executeEvent(event) {
    try {
      event.handler(event);
      this._stats.eventsExecuted++;
      this._notifyEventExecuted(event);
    } catch (err) {
      console.error(`[SimulationBus] Error executing event: ${event.type}`, err);
    }

    // Reschedule if recurring
    if (event.recurring) {
      this.schedule(event.interval, event.type, event.handler, event.data, {
        recurring: true,
        interval: event.interval,
      });
    }
  }

  // ---------------------------------------------------------------------------
  // CONTROL
  // ---------------------------------------------------------------------------

  /**
   * Set simulation speed multiplier.
   * @param {number} factor - 0.5 = half speed, 2.0 = double speed
   */
  setSpeed(factor) {
    if (factor <= 0) throw new Error('Speed factor must be positive');
    this._speedFactor = factor;
  }

  /**
   * Get current simulated time.
   * @returns {number}
   */
  getCurrentTime() {
    return this._currentTime;
  }

  /**
   * Get remaining events count.
   * @returns {number}
   */
  getQueueSize() {
    return this._queue.length;
  }

  /**
   * Get next event without executing.
   * @returns {SimulationEvent|null}
   */
  peekNextEvent() {
    return this._queue[0] || null;
  }

  // ---------------------------------------------------------------------------
  // STATISTICS & LOGGING
  // ---------------------------------------------------------------------------

  /**
   * Get simulation statistics.
   * @returns {object}
   */
  getStats() {
    return {
      ...this._stats,
      currentTime: this._currentTime,
      queueSize: this._queue.length,
      running: this._running,
    };
  }

  /**
   * Reset statistics.
   */
  resetStats() {
    this._stats = {
      eventsScheduled: 0,
      eventsExecuted: 0,
      eventsCanceled: 0,
    };
  }

  /**
   * Display statistics.
   * @returns {string}
   */
  showStats() {
    const stats = this.getStats();
    let output = 'Simulation Bus Statistics:\n';
    output += `Current Time:      ${stats.currentTime} ms\n`;
    output += `Queue Size:        ${stats.queueSize} events\n`;
    output += `Running:           ${stats.running}\n`;
    output += `Events Scheduled:  ${stats.eventsScheduled}\n`;
    output += `Events Executed:   ${stats.eventsExecuted}\n`;
    output += `Events Canceled:   ${stats.eventsCanceled}\n`;
    return output;
  }

  // ---------------------------------------------------------------------------
  // CALLBACKS
  // ---------------------------------------------------------------------------

  /**
   * Register callback for event execution.
   * @param {Function} callback - (event) => void
   */
  onEventExecuted(callback) {
    this._onEventExecuted = callback;
  }

  /**
   * Register callback for state changes.
   * @param {Function} callback - (state: 'running'|'paused'|'stopped') => void
   */
  onStateChanged(callback) {
    this._onStateChanged = callback;
  }

  /**
   * Notify event executed.
   * @private
   */
  _notifyEventExecuted(event) {
    if (this._onEventExecuted) {
      this._onEventExecuted(event);
    }
  }

  /**
   * Notify state changed.
   * @private
   */
  _notifyStateChanged(state) {
    if (this._onStateChanged) {
      this._onStateChanged(state);
    }
  }

  // ---------------------------------------------------------------------------
  // INTERNAL HEAP OPERATIONS
  // ---------------------------------------------------------------------------

  /**
   * Insert event into priority queue (maintaining min-heap).
   * @private
   */
  _insert(event) {
    this._queue.push(event);
    this._heapifyUp(this._queue.length - 1);
  }

  /**
   * Bubble up to maintain heap property.
   * @private
   */
  _heapifyUp(index) {
    while (index > 0) {
      const parentIdx = Math.floor((index - 1) / 2);
      if (this._queue[parentIdx].time <= this._queue[index].time) break;

      [this._queue[parentIdx], this._queue[index]] = [this._queue[index], this._queue[parentIdx]];
      index = parentIdx;
    }
  }
}
