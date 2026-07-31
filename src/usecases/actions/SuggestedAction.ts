/**
 * # Suggested Action Dispatch
 *
 * ## Business Value & Purpose
 * Three different surfaces now propose things for the user to do — the capture receipt's
 * follow-ups, the selection tray's buttons, and the command palette's canonical actions.
 * They are different *menus*, but they offer the same small set of *moves*, so they share
 * one vocabulary for describing how a move is carried out.
 *
 * Consolidating the union here (rather than letting each module define its own) buys the
 * property that matters: `preflight` is the only route to anything AI-backed, and that
 * invariant is stated in exactly one place. A new surface can propose actions without
 * being able to invent a way to reach a gateway directly.
 */
export type SuggestedActionDispatch =
  /** Opens the AI scope sheet. Never executes — the user still confirms. */
  | { kind: "preflight"; presetId: string }
  /** Runs a deterministic pipeline command (no model involved). */
  | { kind: "pipeline"; text: string }
  /** Opens the mission editor. */
  | { kind: "mission" }
  /** Opens the goal architect to plan a new goal from scratch. */
  | { kind: "goal" }
  /** Opens the command palette. */
  | { kind: "palette" }
  /** Opens the deterministic gap/status report. */
  | { kind: "status" }
  /** Opens the capture screen with a given intent. */
  | { kind: "capture"; intent: "note" | "paste" | "link" | "ask" };
