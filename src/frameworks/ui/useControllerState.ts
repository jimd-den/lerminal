import { useEffect, useState } from "react";
import { AppState, LearnimalController } from "../../adapters/presenters/LearnimalController";

/**
 * # useControllerState Hook
 * 
 * ## Business Value & Purpose
 * Connects the Learnimal Controller (Interface Adapter) state stream to the React component tree
 * (Frameworks & Drivers layer). By subscribing to state updates, it guarantees that any state
 * transitions triggered within the controller (like grading a card or finishing onboarding) are
 * automatically drawn on screen.
 * 
 * @param controller The Learnimal application controller.
 * @returns The current AppState.
 */
export function useControllerState(controller: LearnimalController): AppState {
  const [state, setState] = useState<AppState>(controller.getState());

  useEffect(() => {
    const unsubscribe = controller.subscribe((nextState) => {
      setState(nextState);
    });
    return unsubscribe;
  }, [controller]);

  return state;
}
