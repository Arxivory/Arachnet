import catalyst2924Xl from "./catalyst-2924-xl.json";
import catalyst9200L24T4G from "./catalyst-9200l-24t-4g.json";
import catalyst930048T from "./catalyst-9300-48t.json";
import isr4331 from "./isr-4331.json";
import cisco1941 from "./cisco-1941.json";

const PROFILE_DATA = [
  catalyst2924Xl,
  catalyst9200L24T4G,
  catalyst930048T,
  isr4331,
  cisco1941,
];

function cloneProfile(profile) {
  return JSON.parse(JSON.stringify(profile));
}

function validateProfile(profile) {
  if (!profile?.id || !profile.model || !["switch", "router", "wireless-ap", "pc", "laptop", "server"].includes(profile.kind)) {
    throw new TypeError("A device profile requires an id, model, and supported device kind.");
  }
  if (!Array.isArray(profile.portGroups)) {
    throw new TypeError(`Device profile ${profile.id} must define portGroups.`);
  }
  for (const group of profile.portGroups) {
    if (!group?.namePattern || !Number.isInteger(group.count) || group.count < 0 ||
      !Number.isInteger(group.startIndex ?? 1) || !Array.isArray(group.supportedSpeedsMbps)) {
      throw new TypeError(`Device profile ${profile.id} contains an invalid port group.`);
    }
  }
}

for (const profile of PROFILE_DATA) validateProfile(profile);

const PROFILES = new Map(PROFILE_DATA.map((profile) => [profile.id, profile]));

export class DeviceCatalog {
  static getProfile(profileId) {
    const profile = PROFILES.get(profileId);
    if (!profile) throw new Error(`Unknown hardware profile: ${profileId}`);
    return cloneProfile(profile);
  }

  static listProfiles({ kind = null, family = null } = {}) {
    return PROFILE_DATA
      .filter((profile) => (!kind || profile.kind === kind) && (!family || profile.family === family))
      .map(({ id, manufacturer, family: profileFamily, model, kind: profileKind }) => ({
        id,
        manufacturer,
        family: profileFamily,
        model,
        kind: profileKind,
      }));
  }
}
