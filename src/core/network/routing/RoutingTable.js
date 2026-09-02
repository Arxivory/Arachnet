/**
 * RoutingTable.js
 * 
 * Manages the routing table for a router.
 * Implements Longest Prefix Match (LPM) lookup for IPv4 routing.
 * 
 * Features:
 *  - Static route management (addRoute, removeRoute)
 *  - LPM lookup for route selection
 *  - Connected routes auto-generation from interface IPs
 *  - Route metrics for distance vector protocols (RIP, OSPF)
 */

/**
 * @typedef {object} Route
 * @property {string} destination    - Destination network (e.g., '192.168.1.0')
 * @property {string} mask           - Subnet mask (e.g., '255.255.255.0')
 * @property {string|null} nextHop   - Next hop IP (null for direct/connected)
 * @property {string} egressInterface - Interface name to forward out (e.g., 'GigabitEthernet0/0')
 * @property {number} metric         - Route metric/cost (static: 1, RIP: 1-15, OSPF: varies)
 * @property {string} protocol       - 'static' | 'connected' | 'rip' | 'ospf'
 * @property {boolean} active        - Whether this route is active in forwarding table
 */

/**
 * @typedef {object} RouteLookupResult
 * @property {Route|null} route      - The matched route, or null if no match
 * @property {string} reason         - 'no-route' | 'direct' | 'routed' | 'connected'
 */

export default class RoutingTable {
  /**
   * @param {Device} device - The router device this table belongs to
   */
  constructor(device) {
    this.device = device;
    
    /**
     * Route storage, indexed by destination (for simplicity).
     * In production, this would be a trie for efficient LPM.
     * @type {Map<string, Route[]>}
     */
    this._routes = new Map();

    this._initConnectedRoutes();
  }

  // ---------------------------------------------------------------------------
  // INITIALIZATION
  // ---------------------------------------------------------------------------

  /**
   * Auto-generate connected routes from all active interfaces with IP config.
   * Called during construction and whenever an interface comes up.
   */
  _initConnectedRoutes() {
    this.device.interfaces.forEach(iface => {
      if (iface.ipv4) {
        this._addConnectedRoute(iface);
      }
    });
  }

  /**
   * Generate a connected route entry from an interface.
   * For 192.168.1.1/255.255.255.0, creates route to 192.168.1.0/255.255.255.0
   * @private
   */
  _addConnectedRoute(iface) {
    const { address, subnetMask } = iface.ipv4;
    const network = _networkAddress(address, subnetMask);

    const connectedRoute = {
      destination: network,
      mask: subnetMask,
      nextHop: null,  // Directly connected
      egressInterface: iface.name,
      metric: 0,
      protocol: 'connected',
      active: iface.isUp,
    };

    this.addRoute(connectedRoute);
  }

  /**
   * Called when an interface comes up or goes down.
   * Updates connected route status.
   */
  updateConnectedRoute(iface) {
    if (!iface.ipv4) return;

    const network = _networkAddress(iface.ipv4.address, iface.ipv4.subnetMask);
    const routes = this._routes.get(network) || [];

    routes.forEach(route => {
      if (route.protocol === 'connected' && route.egressInterface === iface.name) {
        route.active = iface.isUp;
      }
    });
  }

  // ---------------------------------------------------------------------------
  // ROUTE MANAGEMENT
  // ---------------------------------------------------------------------------

  /**
   * Add a static or learned route to the routing table.
   * @param {Route} routeData
   */
  addRoute(routeData) {
    const { destination, mask } = routeData;
    const key = `${destination}/${mask}`;

    if (!this._routes.has(key)) {
      this._routes.set(key, []);
    }

    const routeList = this._routes.get(key);
    
    // Check if this exact route already exists
    const existing = routeList.find(r => 
      r.nextHop === routeData.nextHop &&
      r.egressInterface === routeData.egressInterface
    );

    if (existing) {
      // Update metric/protocol if better route
      if (routeData.metric < existing.metric) {
        Object.assign(existing, routeData);
      }
      return;
    }

    routeList.push({ ...routeData, active: true });

    // Sort by metric (lowest first) for preference
    routeList.sort((a, b) => a.metric - b.metric);
  }

  /**
   * Remove a route from the table.
   * @param {string} destination
   * @param {string} mask
   * @param {string} [nextHop] - If provided, only removes that specific route
   */
  removeRoute(destination, mask, nextHop = null) {
    const key = `${destination}/${mask}`;
    if (!this._routes.has(key)) return false;

    const routeList = this._routes.get(key);
    const originalLength = routeList.length;

    if (nextHop) {
      const index = routeList.findIndex(r => r.nextHop === nextHop);
      if (index !== -1) routeList.splice(index, 1);
    } else {
      this._routes.delete(key);
    }

    return routeList.length < originalLength;
  }

  /**
   * Clear all static routes (keep connected routes).
   */
  clearStaticRoutes() {
    const toDelete = [];
    this._routes.forEach((routes, key) => {
      const staticRoutes = routes.filter(r => r.protocol === 'static');
      if (staticRoutes.length > 0) {
        toDelete.push(key);
      }
    });
    toDelete.forEach(key => this._routes.delete(key));
  }

  // ---------------------------------------------------------------------------
  // LOOKUP (Longest Prefix Match)
  // ---------------------------------------------------------------------------

  /**
   * Perform Longest Prefix Match (LPM) lookup for a destination IP.
   * @param {string} dstIP - Destination IP address
   * @returns {RouteLookupResult}
   */
  lookup(dstIP) {
    let bestMatch = null;
    let bestPrefixLength = -1;

    // Iterate all routes, find the one with longest matching prefix
    this._routes.forEach((routeList, key) => {
      const route = routeList[0]; // Primary route (lowest metric)
      if (!route.active) return;

      if (_isIPInSubnet(dstIP, route.destination, route.mask)) {
        const prefixLen = _subnetMaskToPrefixLength(route.mask);
        if (prefixLen > bestPrefixLength) {
          bestMatch = route;
          bestPrefixLength = prefixLen;
        }
      }
    });

    if (bestMatch) {
      const reason = bestMatch.protocol === 'connected' ? 'direct' : 'routed';
      return { route: bestMatch, reason };
    }

    return { route: null, reason: 'no-route' };
  }

  /**
   * Get all active routes in table.
   * @returns {Route[]}
   */
  getAllRoutes() {
    const allRoutes = [];
    this._routes.forEach(routeList => {
      routeList.forEach(route => {
        if (route.active) allRoutes.push(route);
      });
    });
    return allRoutes;
  }

  /**
   * Get routes to a specific destination.
   * @param {string} destination
   * @param {string} mask
   * @returns {Route[]}
   */
  getRoutes(destination, mask) {
    const key = `${destination}/${mask}`;
    return this._routes.get(key) || [];
  }

  /**
   * Display routing table (similar to Cisco `show ip route`).
   * @returns {string}
   */
  showRoutes() {
    let output = 'Routing Table:\n';
    output += 'Destination     Mask            Next Hop        Interface       Metric Protocol\n';
    output += ''.padEnd(90, '-') + '\n';

    const routes = this.getAllRoutes();
    routes.forEach(route => {
      const dest = route.destination.padEnd(15);
      const mask = route.mask.padEnd(15);
      const nextHop = (route.nextHop || 'direct').padEnd(15);
      const iface = route.egressInterface.padEnd(15);
      const metric = route.metric.toString().padEnd(6);
      const proto = route.protocol;
      
      output += `${dest} ${mask} ${nextHop} ${iface} ${metric} ${proto}\n`;
    });

    return output;
  }
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Calculate the network address from IP and subnet mask.
 * E.g., 192.168.1.100 + 255.255.255.0 = 192.168.1.0
 * @private
 */
function _networkAddress(ip, mask) {
  const ipParts = ip.split('.').map(Number);
  const maskParts = mask.split('.').map(Number);
  return ipParts.map((part, i) => part & maskParts[i]).join('.');
}

/**
 * Check if an IP is in a given subnet.
 * @private
 */
function _isIPInSubnet(ip, network, mask) {
  return _networkAddress(ip, mask) === network;
}

/**
 * Convert subnet mask (e.g., '255.255.255.0') to prefix length (e.g., 24).
 * @private
 */
function _subnetMaskToPrefixLength(mask) {
  const parts = mask.split('.').map(Number);
  let bits = 0;
  for (let part of parts) {
    let byte = part.toString(2).padStart(8, '0');
    bits += byte.replace(/0/g, '').length;
  }
  return bits;
}

/**
 * Convert prefix length (e.g., 24) to subnet mask (e.g., '255.255.255.0').
 * @private
 */
function _prefixLengthToSubnetMask(prefixLen) {
  let mask = '';
  for (let i = 0; i < 4; i++) {
    const bitsInOctet = Math.min(8, Math.max(0, prefixLen - i * 8));
    const octet = (255 << (8 - bitsInOctet)) & 0xff;
    mask += octet.toString();
    if (i < 3) mask += '.';
  }
  return mask;
}
