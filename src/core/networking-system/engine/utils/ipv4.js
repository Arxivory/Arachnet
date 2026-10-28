export function ipv4ToInt(address) {
  const parts = address.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) {
    throw new TypeError(`Invalid IPv4 address: ${address}`);
  }
  const octets = parts.map(Number);
  if (octets.some((octet) => octet < 0 || octet > 255)) {
    throw new TypeError(`Invalid IPv4 address: ${address}`);
  }
  return (((octets[0] << 24) >>> 0) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0;
}

export function parseIpv4Cidr(value) {
  const [address, prefixText, ...extra] = value.split("/");
  if (extra.length || !address) throw new TypeError(`Invalid IPv4 prefix: ${value}`);
  const prefixLength = prefixText === undefined ? 32 : Number(prefixText);
  if (!Number.isInteger(prefixLength) || prefixLength < 0 || prefixLength > 32) {
    throw new TypeError(`Invalid IPv4 prefix length: ${value}`);
  }
  const addressInt = ipv4ToInt(address);
  const mask = prefixLength === 0 ? 0 : (0xffffffff << (32 - prefixLength)) >>> 0;
  return { address, addressInt, prefixLength, mask, network: addressInt & mask };
}

export function ipv4PrefixContains(prefix, address) {
  const parsed = typeof prefix === "string" ? parseIpv4Cidr(prefix) : prefix;
  return (ipv4ToInt(address) & parsed.mask) === parsed.network;
}

export function normalizeMacAddress(macAddress) {
  if (typeof macAddress !== "string" || !/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(macAddress)) {
    throw new TypeError(`Invalid MAC address: ${macAddress}`);
  }
  return macAddress.toLowerCase();
}

export function isBroadcastMac(macAddress) {
  return normalizeMacAddress(macAddress) === "ff:ff:ff:ff:ff:ff";
}

export function isMulticastMac(macAddress) {
  return (parseInt(normalizeMacAddress(macAddress).slice(0, 2), 16) & 1) === 1;
}

export function interfaceAddresses(networkInterface) {
  return networkInterface.ipv4Addresses.map((value) => parseIpv4Cidr(value));
}
