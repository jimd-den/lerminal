import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import {
  AppState,
  GriotController,
} from "../../../adapters/presenters/GriotController";
import { presentCaptureReceipt } from "../../../adapters/presenters/CaptureReceiptPresenter";
import { ArrivalView } from "../motion/communicative";
import { GriotTheme, Structure, TypeScale } from "./theme";

/**
 * # Capture Receipt Panel
 *
 * ## Business Value & Purpose
 * The visible answer to "what just happened, and what now?". It replaces a panel that
 * said only "N items created" with one that states *where* the output landed, whether
 * the selection moved, and offers the two or three follow-ups that keep the work going.
 *
 * The component holds no policy — every string and suggestion comes from
 * {@link presentCaptureReceipt}. Its whole job is layout.
 */
export function CaptureReceipt({
  controller,
  state,
  theme,
  onOpenOutput,
}: {
  controller: GriotController;
  state: AppState;
  theme: GriotTheme;
  onOpenOutput: () => void;
}) {
  const receipt = presentCaptureReceipt(state);
  if (!receipt) return null;

  // The suggestion is scoped to the run's representative card, the same one
  // `nextActionsForCard` keyed the menu off — see CaptureReceiptPresenter.
  const primaryCard = receipt.createdCards[0] ?? null;

  return (
    // Keyed on the run's output so a *new* result animates in, but unrelated re-renders
    // don't replay the arrival — that would drain the motion of its meaning.
    <ArrivalView key={receipt.createdCards.map(card => card.id).join(",")}>
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[styles.panel, { backgroundColor: theme.panelStrong, borderColor: theme.line }]}
    >
      {/* The seal: a small, calm confirmation rather than a headline claiming victory —
          one note saved, nothing else changed, matching the mockup's restraint. */}
      <View style={[styles.seal, { borderColor: theme.line, backgroundColor: theme.panelMuted }]}>
        <View style={[styles.sealDot, { backgroundColor: theme.accent }]} />
        <Text style={[styles.sealText, { color: theme.accent }]}>{receipt.summary}</Text>
      </View>

      {receipt.localFallbackReason ? (
        <View style={[styles.fallbackNotice, { borderColor: theme.warning, backgroundColor: `${theme.warning}14` }]}>
          <Text style={[styles.fallbackText, { color: theme.warning }]}>
            {receipt.localFallbackReason}
          </Text>
        </View>
      ) : null}

      {primaryCard ? (
        <View
          style={[
            styles.noteCard,
            { borderColor: theme.line, backgroundColor: theme.panel, borderLeftColor: theme.accent },
          ]}
        >
          <Text style={[styles.noteTag, { color: theme.accent, fontFamily: theme.fontMono }]}>
            YOUR NOTE
          </Text>
          <Text numberOfLines={2} style={[styles.noteTitle, { color: theme.text }]}>
            {primaryCard.title}
          </Text>
          {primaryCard.body ? (
            <Text numberOfLines={3} style={[styles.noteBody, { color: theme.textMuted }]}>
              {primaryCard.body}
            </Text>
          ) : null}
        </View>
      ) : null}

      <Text style={[styles.destination, { color: theme.textFaint }]}>
        Added to {receipt.destinationLabel}
        {receipt.selectionChanged ? " · now selected, ready for the next step" : ""}
      </Text>

      {receipt.nextActions.length > 0 ? (
        <>
          <View style={styles.nextHeader}>
            <Text style={[styles.nextLabel, { color: theme.accent, fontFamily: theme.fontMono }]}>
              CHOOSE ONE USEFUL NEXT MOVE
            </Text>
            {/* The agentic layer: not a new capability, only a highlighted pick among
                the same actions below — see SuggestNextActionInteractor. */}
            {primaryCard &&
            state.suggestedActionForCardId !== primaryCard.id &&
            !state.isSuggestingNextAction ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => primaryCard && void controller.suggestNextActionFor(primaryCard)}
              >
                <Text style={[styles.askLink, { color: theme.evidence, fontFamily: theme.fontMono }]}>
                  ASK GRIOT
                </Text>
              </Pressable>
            ) : null}
          </View>

          {state.isSuggestingNextAction && state.suggestedActionForCardId === primaryCard?.id ? (
            <View style={styles.thinkingRow}>
              <ActivityIndicator size="small" color={theme.evidence} />
              <Text style={[styles.thinkingText, { color: theme.textFaint }]}>Thinking…</Text>
            </View>
          ) : null}

          {state.suggestedActionError && state.suggestedActionForCardId === primaryCard?.id ? (
            <Text style={[styles.suggestError, { color: theme.textFaint }]}>
              {state.suggestedActionError}
            </Text>
          ) : null}

          {state.suggestedActionReason && state.suggestedActionForCardId === primaryCard?.id ? (
            <View style={[styles.suggestionNote, { borderColor: theme.evidence }]}>
              <Text style={[styles.suggestionLabel, { color: theme.evidence, fontFamily: theme.fontMono }]}>
                GRIOT SUGGESTS
              </Text>
              <Text style={[styles.suggestionReason, { color: theme.textMuted }]}>
                {state.suggestedActionReason}
              </Text>
            </View>
          ) : null}

          <View style={styles.choiceList}>
            {receipt.nextActions.map((action) => {
              const highlighted =
                state.suggestedActionForCardId === primaryCard?.id &&
                state.suggestedActionId === action.id;
              return (
                <Pressable
                  key={action.id}
                  accessibilityRole="button"
                  onPress={() => void controller.dispatchSuggestedAction(action.dispatch)}
                  style={({ pressed }) => [
                    styles.choice,
                    {
                      borderColor: highlighted ? theme.evidence : theme.line,
                      backgroundColor: highlighted ? `${theme.evidence}14` : theme.panel,
                    },
                    pressed && styles.pressed,
                  ]}
                >
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.choiceText,
                      { color: highlighted ? theme.evidence : theme.text },
                    ]}
                  >
                    {action.label}
                  </Text>
                  {highlighted ? (
                    <Text style={[styles.choiceBadge, { color: theme.evidence, fontFamily: theme.fontMono }]}>
                      SUGGESTED
                    </Text>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </>
      ) : null}

      <View style={styles.footer}>
        <Pressable
          accessibilityRole="button"
          onPress={onOpenOutput}
          style={({ pressed }) => [
            styles.primary,
            { backgroundColor: theme.accent },
            pressed && styles.pressed,
          ]}
        >
          <Text style={[styles.primaryText, { color: theme.accentInk, fontFamily: theme.fontMono }]}>
            {receipt.primaryActionLabel}
          </Text>
        </Pressable>
        {receipt.canUndo ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => void controller.undoLastOperation()}
            style={({ pressed }) => [styles.dismiss, pressed && styles.pressed]}
          >
            <Text style={[styles.dismissText, { color: theme.accent, fontFamily: theme.fontMono }]}>
              UNDO
            </Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          onPress={() => controller.dismissOperationResult()}
          style={({ pressed }) => [styles.dismiss, pressed && styles.pressed]}
        >
          <Text style={[styles.dismissText, { color: theme.textMuted, fontFamily: theme.fontMono }]}>
            DISMISS
          </Text>
        </Pressable>
      </View>
    </View>
    </ArrivalView>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.7 },
  panel: {
    borderWidth: 1,
    borderRadius: Structure.radius,
    padding: Structure.gutter,
    marginBottom: 18,
  },
  seal: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: Structure.radiusControl,
    paddingVertical: 9,
    paddingHorizontal: 12,
  },
  sealDot: { width: 7, height: 7, borderRadius: 4 },
  sealText: { fontSize: TypeScale.meta, fontWeight: "700", flexShrink: 1 },
  noteCard: {
    borderWidth: 1,
    borderLeftWidth: 3,
    borderRadius: Structure.radiusControl,
    padding: 12,
    marginTop: 12,
    gap: 4,
  },
  noteTag: { fontSize: TypeScale.label, fontWeight: "900", letterSpacing: 1 },
  noteTitle: { fontSize: TypeScale.bodyStrong, fontWeight: "700" },
  noteBody: { fontSize: TypeScale.meta, lineHeight: 19 },
  destination: { fontSize: TypeScale.label, lineHeight: 17, marginTop: 10 },
  fallbackNotice: { borderWidth: 1, borderRadius: 10, padding: 10, marginTop: 10 },
  fallbackText: { fontSize: TypeScale.meta, lineHeight: 18, fontWeight: "600" },
  nextHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 14,
  },
  nextLabel: { fontSize: TypeScale.label, fontWeight: "900", letterSpacing: 1.2 },
  askLink: { fontSize: TypeScale.label, fontWeight: "800", letterSpacing: 1 },
  thinkingRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  thinkingText: { fontSize: TypeScale.meta },
  suggestError: { fontSize: TypeScale.meta, marginTop: 8, lineHeight: 18 },
  suggestionNote: {
    borderLeftWidth: 2,
    paddingLeft: 10,
    marginTop: 8,
    gap: 2,
  },
  suggestionLabel: { fontSize: TypeScale.label, fontWeight: "900", letterSpacing: 1 },
  suggestionReason: { fontSize: TypeScale.meta, lineHeight: 18 },
  choiceList: { gap: 7, marginTop: 8 },
  choice: {
    minHeight: Structure.tapLarge,
    borderWidth: 1,
    borderRadius: Structure.radiusControl,
    paddingHorizontal: 14,
    paddingVertical: 12,
    justifyContent: "center",
    gap: 3,
  },
  choiceText: { fontSize: TypeScale.bodyStrong, fontWeight: "700" },
  choiceBadge: { fontSize: TypeScale.label, fontWeight: "900", letterSpacing: 1 },
  footer: { flexDirection: "row", alignItems: "center", gap: 14, marginTop: 16 },
  primary: { minHeight: Structure.tapLarge, paddingHorizontal: 17, borderRadius: 10, justifyContent: "center" },
  primaryText: { fontSize: TypeScale.body, fontWeight: "800" },
  dismiss: { minHeight: 48, justifyContent: "center" },
  dismissText: { fontSize: TypeScale.label, fontWeight: "800", letterSpacing: 1 },
});
