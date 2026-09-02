import { useEffect, useState } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
import appState from "../../state/AppState";

export default function FloorNavigator() {
  const [activeFloorId, setActiveFloorId] = useState(appState.ui.activeFloorId);
  const [floors, setFloors] = useState([]);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    const unsubUi = appState.ui.subscribe((store) => {
      setActiveFloorId(store.activeFloorId);
    });

    const unsubSel = appState.selection.subscribe((store) => {
      let siteId = null;
      if (store.focusedType === "site") {
        siteId = store.focusedId;
      } else if (store.focusedType === "floor") {
        const floor = appState.structural.getFloor(store.focusedId);
        if (floor) siteId = floor.siteId;
      }
      if (siteId) {
        const list = appState.structural.getFloorsBySite(siteId);
        setFloors(list);
        if (!list.find((f) => f.id === appState.ui.activeFloorId)) {
          if (list.length) {
            appState.ui.setActiveFloor(list[0].id);
            setActiveFloorId(list[0].id);
          } else {
            appState.ui.setActiveFloor(null);
            setActiveFloorId(null);
          }
        }
      } else {
        setFloors([]);
        appState.ui.setActiveFloor(null);
      }
    });

    return () => {
      unsubUi();
      unsubSel();
    };
  }, []);

  const changeFloor = (direction) => {
    if (floors.length === 0) return;
    let idx = floors.findIndex((f) => f.id === activeFloorId);
    if (idx === -1) idx = 0;
    if (direction === "up") idx = (idx + 1) % floors.length;
    else idx = (idx - 1 + floors.length) % floors.length;
    const newId = floors[idx].id;
    appState.ui.setActiveFloor(newId);
    appState.selection.focusedNode(newId, "floor");
  };

  return (
    <div className={`toolbar-group floor-navigator ${flash ? 'flash' : ''}`}>
      <div className="toolbar-row">
        <button onClick={() => changeFloor("down")} className="toolbar-btn">
          <ChevronDown size={16} />
        </button>
        <button onClick={() => changeFloor("up")} className="toolbar-btn">
          <ChevronUp size={16} />
        </button>
      </div>
      <span className="toolbar-label">Floor</span>
    </div>
  );
}