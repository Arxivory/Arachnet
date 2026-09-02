import { createContext, useContext, useState, useEffect } from "react";
import appState from "../state/AppState";
import { showErrorModal } from "../util/ErrorHandling";

const HierarchyContext = createContext();

export function HierarchyProvider({ children }) {
  const [hierarchy, setHierarchy] = useState([]);

  useEffect(() => {
    const tree = appState.structural.getHierarchyTree(appState.network, appState.furniture);
    setHierarchy(tree);

    const unsubscribeStructural = appState.structural.subscribe(() => {
      const updatedTree = appState.structural.getHierarchyTree(appState.network, appState.furniture);
      setHierarchy(updatedTree);
    });

    const unsubscribeNetwork = appState.network.subscribe(() => {
      const updatedTree = appState.structural.getHierarchyTree(appState.network, appState.furniture);
      setHierarchy(updatedTree);
    });

    const unsubscribeFurniture = appState.furniture.subscribe(() => {
      const updatedTree = appState.structural.getHierarchyTree(appState.network, appState.furniture);
      setHierarchy(updatedTree);
    });

    return () => {
      unsubscribeStructural();
      unsubscribeNetwork();
      unsubscribeFurniture();
    };
  }, []);

  const selectNode = (id, type) => {
    appState.selection.focusedNode(id, type);
  }

 const addNode = (parentId, type, label) => {
    const currentFocusType = appState.selection.focusedType;
    const currentFocusId = appState.selection.focusedId;

    if (type === 'site') {
      if (currentFocusType !== 'domain' || !currentFocusId) {
        showErrorModal("You must select a Domain first before creating a Site.", "Invalid Hierarchy");
        return;
      }
      parentId = currentFocusId; 
    } 
    else if (type === 'floor') {
      if (currentFocusType !== 'site' || !currentFocusId) {
        showErrorModal("You must select a Site first before creating a Floor.", "Invalid Hierarchy");
        return;
      }
      parentId = currentFocusId;
    } 
    else if (type === 'space') {
      if (currentFocusType !== 'floor' || !currentFocusId) {
        showErrorModal("You must select a Floor first before creating a Space.", "Invalid Hierarchy");
        return;
      }
      parentId = currentFocusId;
    }

    const newNode = {
      id: Date.now(),
      label,
      type,
      children: [],
    };

    if (type === 'domain') {
      appState.structural.addDomain(newNode);
    } else if (type === 'site') {
      appState.structural.addSite({ ...newNode, domainId: parentId });
    } else if (type === 'floor') {
      const added = appState.structural.addFloor({ ...newNode, siteId: parentId });
      if (added && added.id) {
        appState.ui.setActiveFloor(added.id);
      }
    } else if (type === 'space') {
      appState.structural.addSpace({ ...newNode, floorId: parentId });
    }
  };
  return (
    <HierarchyContext.Provider value={{ hierarchy, addNode }}>
      {children}
    </HierarchyContext.Provider>
  );
}

export const useHierarchy = () => useContext(HierarchyContext);
