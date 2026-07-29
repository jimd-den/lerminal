import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  AppState,
  LearnimalController,
} from "../../../adapters/presenters/LearnimalController";
import { presentCaptureReceipt } from "../../../adapters/presenters/CaptureReceiptPresenter";
import { ArrivalView } from "../motion/communicative";
import { LearningTheme, Structure, TypeScale } from "./theme";

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
  controller: LearnimalController;
  state: AppState;
  theme: LearningTheme;
  onOpenOutput: () => void;
}) {
  const receipt = presentCaptureReceipt(state);
  if (!receipt) return null;

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

      <Text style={[styles.destination, { color: theme.textMuted }]}>
        Added to {receipt.destinationLabel}
        {receipt.selectionChanged ? " · now selected, ready for the next step" : ""}
      </Text>

      {receipt.nextActions.length > 0 ? (
        <>
          <Text style={[styles.nextLabel, { color: theme.textFaint, fontFamily: theme.fontMono }]}>
            NEXT
          </Text>
          <View style={styles.actionRow}>
            {receipt.nextActions.map((action) => (
              <Pressable
                key={action.id}
                accessibilityRole="button"
                onPress={() => void controller.dispatchSuggestedAction(action.dispatch)}
                style={({ pressed }) => [
                  styles.nextAction,
                  { borderColor: theme.accent, backgroundColor: theme.accentSoft },
                  pressed && styles.pressed,
                ]}
              >
                <Text numberOfLines={1} style={[styles.nextActionText, { color: theme.accent }]}>
                  {action.label}
                </Text>
              </Pressable>
            ))}
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
  nextLabel: { fontSize: TypeScale.label, fontWeight: "900", letterSpacing: 1.2, marginTop: 14 },
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
