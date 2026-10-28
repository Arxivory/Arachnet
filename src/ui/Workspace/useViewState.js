import { useEffect, useState } from "react";

export function useViewState(viewController) {
  const [state, setState] = useState(() => viewController.state);
  useEffect(() => {
    setState(viewController.state);
    return viewController.subscribe(setState);
  }, [viewController]);
  return state;
}
