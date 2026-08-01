import { useCallback, useEffect, useState } from "react";
import { BackHandler } from "react-native";
import {
  AppState,
  GriotController,
} from "../../adapters/presenters/GriotController";
import { CorePlace } from "./griot/components";

/**
 * # Deck Navigation
 *
 * ## Business Value & Purpose
 * All of the shell's *where am I* logic, extracted from `MainLayout` so that component
 * can go back to being a layout. Navigation here is not a router: the app is one canvas
 * with four places and a two-level drill into the library, and this hook is the whole of
 * that model — which place is showing, how deep the library is, and every legal
 * transition between them.
 *
 * ## Why a hook rather than a component or a controller field
 * It is genuinely *view* state: which screen the user is looking at has no meaning to the
 * domain and must not survive a reload. Putting it in `GriotController` would mix
 * presentation with the card graph; leaving it inline in `MainLayout` is what made that
 * file a God class. A hook keeps it colocated with the shell that owns it while making
 * each transition a named function instead of a pair of `setState` calls at the call site.
 */

/** How deep the library drill-down currently is. */
export type LibraryLevel = "index" | "space" | "document";

export interface DeckNavigation {
  place: CorePlace;
  libraryLevel: LibraryLevel;

  /** Switch a space, reset the drill, and show the library. */
  openSpace: (spaceId: string) => Promise<void>;
  /** Drill into a group. */
  openDocument: (groupId: string) => void;
  /** Step up one level out of a document, or back to the space index. */
  backFromDocument: () => void;
  /** Jump to wherever a completed run put its output. */
  openOperationResult: () => Promise<void>;
  /** Show the settings place. */
  openSettings: () => void;
  /** Bottom-nav tab change; refuses while a capture is mid-flight. */
  changePlace: (next: CorePlace) => void;
  /** Return to the library index (used when leaving a space). */
  showLibraryIndex: () => void;
}

export interface DeckNavigationOptions {
  controller: GriotController;
  state: AppState;
  /** True while the capture screen is submitting — navigation is blocked so work isn't lost. */
  captureWorking: boolean;
}

export function useDeckNavigation({
  controller,
  state,
  captureWorking,
}: DeckNavigationOptions): DeckNavigation {
  const [place, setPlace] = useState<CorePlace>("deck");
  const [libraryLevel, setLibraryLevel] = useState<LibraryLevel>("index");

  const openSpace = useCallback(
    async (spaceId: string) => {
      if (spaceId !== state.activeWorkspaceId) {
        await controller.switchWorkspace(spaceId);
      }
      controller.navigateToGroup(null);
      controller.clearSelection();
      setPlace("library");
      setLibraryLevel("space");
    },
    [controller, state.activeWorkspaceId]
  );

  const openDocument = useCallback(
    (groupId: string) => {
      controller.navigateToGroup(groupId);
      setPlace("library");
      setLibraryLevel("document");
    },
    [controller]
  );

  /**
   * Groups nest arbitrarily, so "back" from a document means *up one group* when there is
   * a parent, and only falls out to the space listing at the top — otherwise a deep drill
   * would collapse in one tap and lose the user's place.
   */
  const backFromDocument = useCallback(() => {
    const current = state.cards.find(card => card.id === state.currentGroupId);
    if (current?.parentId) {
      controller.navigateToGroup(current.parentId);
      setLibraryLevel("document");
    } else {
      controller.navigateToGroup(null);
      setLibraryLevel("space");
    }
  }, [controller, state.cards, state.currentGroupId]);

  const openOperationResult = useCallback(async () => {
    const result = state.operationResult;
    if (!result) return;
    await controller.openOperationResult();
    // A single new card opens directly; anything else is best seen in its container.
    if (result.destination.cardId && !result.destination.groupId) {
      controller.openCard(result.destination.cardId);
      return;
    }
    setPlace("library");
    setLibraryLevel(result.destination.groupId ? "document" : "space");
  }, [controller, state.operationResult]);

  const openSettings = useCallback(() => setPlace("more"), []);
  const showLibraryIndex = useCallback(() => setLibraryLevel("index"), []);

  const changePlace = useCallback(
    (next: CorePlace) => {
      if (captureWorking) return;
      controller.navigateToGroup(null);
      setPlace(next);
      if (next === "library") setLibraryLevel("index");
    },
    [captureWorking, controller]
  );

  // Settings is reachable from elsewhere in the app by flag; honour it as a place change.
  useEffect(() => {
    if (state.isSettingsSheetOpen) {
      setPlace("more");
      controller.setSettingsSheetOpen(false);
    }
  }, [controller, state.isSettingsSheetOpen]);

  // A run that produced a group asks the shell to open it, so the result is what the
  // user is looking at rather than something they have to go find. Consumed once, so a
  // re-render doesn't yank them back after they've navigated away themselves.
  useEffect(() => {
    if (!state.pendingGroupNavigation) return;
    const groupId = controller.consumeGroupNavigation();
    if (groupId) {
      setPlace("library");
      setLibraryLevel("document");
    }
  }, [controller, state.pendingGroupNavigation]);

  /**
   * Android back, resolved in priority order: dismiss a selection first (it's the most
   * recent, most reversible thing the user did), then refuse to interrupt an in-flight
   * capture (now a modal — closing it mid-submit would lose the draft), then close an open
   * capture sheet outright, then unwind the library drill one level, and only then leave
   * for the deck.
   */
  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (state.selection.size > 0) {
        controller.clearSelection();
        return true;
      }
      if (state.isCaptureSheetOpen) {
        if (!captureWorking) controller.closeCaptureSheet();
        return true;
      }
      if (place === "library" && libraryLevel === "document") {
        backFromDocument();
        return true;
      }
      if (place === "library" && libraryLevel === "space") {
        setLibraryLevel("index");
        return true;
      }
      if (place !== "deck") {
        controller.navigateToGroup(null);
        setPlace("deck");
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, [backFromDocument, captureWorking, controller, libraryLevel, place, state.isCaptureSheetOpen, state.selection.size]);

  return {
    place,
    libraryLevel,
    openSpace,
    openDocument,
    backFromDocument,
    openOperationResult,
    openSettings,
    changePlace,
    showLibraryIndex,
  };
}
