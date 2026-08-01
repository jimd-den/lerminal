import { useEffect, useState } from "react";
import { AppState, GriotController } from "../../adapters/presenters/GriotController";

/**
 * # useControllerState Hook
 * 
 * ## Business Value & Purpose
 * Connects the GRIOT Controller (Interface Adapter) state stream to the React component tree
 * (Frameworks & Drivers layer). By subscribing to state updates, it guarantees that any state
 * transitions triggered within the controller (like grading a card or finishing onboarding) are
 * automatically drawn on screen.
 * 
 * @param controller The GRIOT application controller.
 * @returns The current AppState.
 */
export function useControllerState(controller: GriotController): AppState {
  const [state, setState] = useState<AppState>(controller.getState());

  useEffect(() => {
    const unsubscribe = controller.subscribe((nextState) => {
      setState(nextState);
    });
    return unsubscribe;
  }, [controller]);

  return state;
}
