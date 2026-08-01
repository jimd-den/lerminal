import React from "react";
import { Modal } from "react-native";
import { AppState, GriotController } from "../../../adapters/presenters/GriotController";
import { GriotTheme } from "./theme";
import { modalAnimation, useReducedMotion } from "../useReducedMotion";
import { CaptureScreen } from "./screens/CaptureScreen";

/**
 * # Capture Sheet — the modal wrapper around the familiar door
 *
 * ## Business Value & Purpose
 * Capture used to be a fourth `CorePlace` — a screen you routed to and stayed on. It is
 * now a floating action (see `CaptureAffordance` in `components.tsx`), so this is the
 * thin modal shell that turns `CaptureScreen`'s content into a sheet, the same way
 * `ConversationSheet` turns the Ask conversation into one: visibility comes straight from
 * {@link AppState.isCaptureSheetOpen}, and everything `CaptureScreen` already did —
 * composing text, choosing an intent, running a command pipeline — is untouched.
 *
 * The capture draft itself still lives in `MainLayout`, not here: a pending-input prompt
 * can interrupt a capture, and the draft has to outlive that round trip, so it is passed
 * down rather than owned by this sheet.
 */
export function CaptureSheet({
  controller,
  state,
  theme,
  draft,
  working,
  onChangeText,
  onWorkingChange,
  onInputRequired,
  onComplete,
}: {
  controller: GriotController;
  state: AppState;
  theme: GriotTheme;
  draft: string;
  working: boolean;
  onChangeText: (value: string) => void;
  onWorkingChange: (working: boolean) => void;
  onInputRequired: () => void;
  onComplete: () => void;
}) {
  const reducedMotion = useReducedMotion();

  return (
    <Modal
      visible={state.isCaptureSheetOpen}
      animationType={modalAnimation(reducedMotion, "slide")}
      transparent={false}
      onRequestClose={() => {
        if (!working) controller.closeCaptureSheet();
      }}
    >
      <CaptureScreen
        controller={controller}
        theme={theme}
        initialIntent={state.captureIntent ?? "note"}
        value={draft}
        working={working}
        onChangeText={onChangeText}
        onWorkingChange={onWorkingChange}
        onInputRequired={onInputRequired}
        onComplete={onComplete}
      />
    </Modal>
  );
}
