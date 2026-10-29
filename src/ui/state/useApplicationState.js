import { useSyncExternalStore } from "react";

export default function useApplicationState(stateManager) {
  return useSyncExternalStore(
    stateManager.subscribe,
    stateManager.getSnapshot,
    stateManager.getSnapshot
  );
}
