import React from "react";
import {
  AppState,
  GriotController,
} from "../../../adapters/presenters/GriotController";
import { GriotTheme } from "./theme";
import { CardDetailModal } from "./CardDetailModal";
import { ReviewModal } from "./ReviewModal";
import { CommandConsoleModal, PendingInputModal } from "./CommandConsoleModal";
import { AiPreflightSheet } from "./AiPreflightSheet";
import { ResearchResultsSheet } from "./ResearchResultsSheet";
import { MissionEditorSheet } from "./MissionEditorSheet";
import { GapReportSheet } from "./GapReportSheet";
import { GoalArchitectSheet } from "./GoalArchitectSheet";

/**
 * # Modal Stack
 *
 * ## Business Value & Purpose
 * Every sheet and modal the shell mounts, in one place. Each decides its own visibility
 * from {@link AppState}, so this is a flat list rather than a stack of conditionals — and
 * because they all read the same state, mounting them together means there is exactly one
 * answer to "what can be open right now".
 *
 * Extracted from `MainLayout`, where eight modal elements sat inline beneath the layout
 * markup and made a layout component look like a router.
 */
export function ModalStack({
  controller,
  state,
  theme,
  onPendingInputCancel,
  onPendingInputComplete,
}: {
  controller: GriotController;
  state: AppState;
  theme: GriotTheme;
  /** The capture screen owns the draft that a pending-input prompt belongs to. */
  onPendingInputCancel: () => void;
  onPendingInputComplete: () => void;
}) {
  return (
    <>
      <CardDetailModal controller={controller} state={state} theme={theme} />
      <ReviewModal controller={controller} state={state} theme={theme} />
      <CommandConsoleModal controller={controller} state={state} theme={theme} />
      <AiPreflightSheet controller={controller} state={state} theme={theme} />
      <ResearchResultsSheet controller={controller} state={state} theme={theme} />
      <MissionEditorSheet controller={controller} state={state} theme={theme} />
      <GapReportSheet controller={controller} state={state} theme={theme} />
      <GoalArchitectSheet controller={controller} state={state} theme={theme} />
      <PendingInputModal
        controller={controller}
        state={state}
        theme={theme}
        onCancel={onPendingInputCancel}
        onPipelineComplete={onPendingInputComplete}
      />
    </>
  );
}
