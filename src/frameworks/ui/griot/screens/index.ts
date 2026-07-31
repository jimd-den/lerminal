/**
 * # Deck Screens
 *
 * One file per screen, re-exported here so importers name the barrel rather than reaching
 * for a path per screen. Replaces a single 1,385-line `screens.tsx` that held all five
 * screens, their helpers, and one shared stylesheet — a file nobody could open to change
 * one thing without scrolling past four others.
 */
export type { CaptureIntent, SharedProps } from "./types";
export { DeckScreen } from "./DeckScreen";
export { LibraryScreen } from "./LibraryScreen";
export { SpaceScreen } from "./SpaceScreen";
export { DocumentScreen } from "./DocumentScreen";
export { CaptureScreen } from "./CaptureScreen";
