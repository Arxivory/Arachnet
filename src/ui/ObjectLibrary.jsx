import { useMemo, useState } from "react";
import {
  Cable,
  Laptop,
  Monitor,
  Network,
  Router as RouterIcon,
  Search,
  Server,
  Wifi,
} from "lucide-react";
import { DeviceCatalog } from "../core/networking-system";

const CATEGORY_PRESENTATION = {
  router: { label: "Routers", Icon: RouterIcon },
  switch: { label: "Switches", Icon: Network },
  "wireless-ap": { label: "EndDevices", Icon: Wifi },
  pc: { label: "EndDevices", Icon: Monitor },
  laptop: { label: "EndDevices", Icon: Laptop },
  server: { label: "EndDevices", Icon: Server },
};

const CATEGORY_ORDER = ["Routers", "Switches", "EndDevices"];
const PROFILE_DRAG_TYPE = "application/x-arachnet-device-profile";

const profiles = DeviceCatalog.listProfiles().map((summary) => ({
  ...DeviceCatalog.getProfile(summary.id),
  ...summary,
}));

function handleProfileDragStart(event, profile) {
  const payload = JSON.stringify({
    type: "arachnet/device-profile",
    profileId: profile.id,
  });
  event.dataTransfer.effectAllowed = "copy";
  event.dataTransfer.setData(PROFILE_DRAG_TYPE, payload);
  event.dataTransfer.setData("text/plain", profile.id);
}

export default function ObjectLibrary() {
  const [query, setQuery] = useState("");

  const categories = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const matchingProfiles = profiles.filter((profile) => {
      const searchableText = `${profile.manufacturer} ${profile.family} ${profile.model} ${profile.id}`.toLowerCase();
      return !normalizedQuery || searchableText.includes(normalizedQuery);
    });

    return CATEGORY_ORDER.map((label) => ({
      label,
      profiles: matchingProfiles.filter(
        (profile) => CATEGORY_PRESENTATION[profile.kind]?.label === label
      ),
    })).filter(({ profiles: categoryProfiles }) => categoryProfiles.length > 0);
  }, [query]);

  return (
    <aside className="object-library" aria-label="Object library">
      <div className="object-library-header">
        <h3>Object Library</h3>
      </div>
      <hr className="header-separator" />

      {categories.map(({ label, profiles: categoryProfiles }) => (
        <section className="device-category" key={label}>
          <p className="category-title">{label}</p>
          <div className="device-grid" role="list" aria-label={label}>
            {categoryProfiles.map((profile) => {
              const { Icon } = CATEGORY_PRESENTATION[profile.kind] ?? {
                Icon: Cable,
              };

              return (
                <article
                  key={profile.id}
                  className="device-tile draggable"
                  role="listitem"
                  draggable
                  aria-label={`Drag ${profile.model} into the workspace`}
                  title={`${profile.model} (${profile.portGroups.reduce((count, group) => count + group.count, 0)} ports)`}
                  onDragStart={(event) => handleProfileDragStart(event, profile)}
                >
                  <span className="device-icon" aria-hidden="true">
                    <Icon size={24} strokeWidth={2} />
                  </span>
                  <span className="device-type">{profile.model}</span>
                </article>
              );
            })}
          </div>
        </section>
      ))}
      {categories.length === 0 && (
        <p className="category-title" role="status">No matching devices.</p>
      )}
    </aside>
  );
}
