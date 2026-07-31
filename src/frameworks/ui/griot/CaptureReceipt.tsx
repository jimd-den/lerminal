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
      style={[styles.panel, { backgroundColor: theme.panelStrong, borderColor: theme.accent }]}
    >
      <Text style={[styles.status, { color: theme.accent, fontFamily: theme.fontMono }]}>
        RUN COMPLETE
      </Text>
      <Text style={[styles.summary, { color: theme.text }]}>{receipt.summary}</Text>

      {receipt.localFallbackReason ? (
        <View style={[styles.fallbackNotice, { borderColor: theme.warning, backgroundColor: `${theme.warning}14` }]}>
          <Text style={[styles.fallbackText, { color: theme.warning }]}>
            {receipt.localFallbackReason}
          </Text>
        </View>
      ) : null}

      <Text style={[styles.destination, { color: theme.textMuted }]}>
        Added to {receipt.destinationLabel}
        {receipt.selectionChanged ? " · now selected, ready for the next step" : ""}
      </Text>

      {receipt.nextActions.length > 0 ? (
        <>
          <View style={styles.nextHeader}>
            <Text style={[styles.nextLabel, { color: theme.textFaint, fontFamily: theme.fontMono }]}>
              NEXT
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

          <View style={styles.actionRow}>
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
                    styles.nextAction,
                    {
                      borderColor: highlighted ? theme.evidence : theme.accent,
                      backgroundColor: highlighted ? `${theme.evidence}22` : theme.accentSoft,
                    },
                    pressed && styles.pressed,
                  ]}
                >
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.nextActionText,
                      { color: highlighted ? theme.evidence : theme.accent },
                    ]}
                  >
                    {action.label}
                  </Text>
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
  status: { fontSize: TypeScale.label, fontWeight: "900", letterSpacing: 1.4 },
  summary: { fontSize: TypeScale.title, lineHeight: 28, fontWeight: "700", marginTop: 8 },
  destination: { fontSize: TypeScale.meta, lineHeight: 19, marginTop: 5 },
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
  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  nextAction: {
    minHeight: Structure.tap,
    borderWidth: 1,
    borderRadius: Structure.radiusControl,
    paddingHorizontal: 12,
    justifyContent: "center",
    maxWidth: "100%",
  },
  nextActionText: { fontSize: TypeScale.body, fontWeight: "700" },
  footer: { flexDirection: "row", alignItems: "center", gap: 14, marginTop: 16 },
  primary: { minHeight: Structure.tapLarge, paddingHorizontal: 17, borderRadius: 10, justifyContent: "center" },
  primaryText: { fontSize: TypeScale.body, fontWeight: "800" },
  dismiss: { minHeight: 48, justifyContent: "center" },
  dismissText: { fontSize: TypeScale.label, fontWeight: "800", letterSpacing: 1 },
});
