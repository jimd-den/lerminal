import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  AppState,
  LearnimalController,
} from "../../../adapters/presenters/LearnimalController";
import { presentActivity } from "../../../adapters/presenters/ActivityPresenter";
import { WorkingBar } from "../motion/communicative";
import { LearningTheme, Structure, TypeScale } from "./theme";

/**
 * # Activity Banner
 *
 * ## Business Value & Purpose
 * The app's one always-visible answer to "is something happening, and is it talking to a
 * model or the web?" Mounted in the shell rather than any screen, because work outlives
 * the screen that started it: you can run Explain from a document, navigate to the deck,
 * and the run is still going.
 *
 * ## What it says, and why that wording
 * It names the operation *and* labels the exposure — `MODEL`, `WEB`, or both — because
 * "is the AI reading this?" and "did it just go online?" are the two questions this whole
 * product exists to keep answerable. A generic spinner would technically indicate
 * activity while leaving both unanswered.
 *
 * Failures stay put until dismissed. A run that fails while you're on another screen must
 * not disappear silently — that's the same invisibility this banner was built to end.
 */
export function ActivityBanner({
  controller,
  state,
  theme,
}: {
  controller: LearnimalController;
  state: AppState;
  theme: LearningTheme;
}) {
  const activity = presentActivity(state);
  if (!activity) return null;

  const failed = activity.error !== null;
  const tint = failed ? theme.danger : theme.accent;

  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[
        styles.banner,
        {
          backgroundColor: theme.panelStrong,
          borderColor: tint,
        },
      ]}
    >
      <View style={styles.row}>
        <View style={styles.copy}>
          <View style={styles.labelRow}>
            <Text
              numberOfLines={1}
              style={[styles.label, { color: failed ? theme.danger : theme.text }]}
            >
              {failed ? `${activity.label} failed` : activity.label}
            </Text>

            {/* The exposure badges — the point of the whole banner. */}
            {activity.usesModel ? (
              <Badge text="MODEL" color={theme.accent} theme={theme} />
            ) : null}
            {activity.usesWeb ? (
              <Badge text="WEB" color={theme.warning} theme={theme} />
            ) : null}
          </View>

          <Text numberOfLines={2} style={[styles.detail, { color: theme.textMuted }]}>
            {failed ? activity.error!.message : "Working…"}
          </Text>
        </View>

        {failed ? (
          <View style={styles.actions}>
            {activity.error!.canRetry ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => void controller.retryPipeline(activity.error!.operationId)}
                hitSlop={6}
                style={styles.action}
              >
                <Text style={[styles.actionText, { color: theme.accent, fontFamily: theme.fontMono }]}>
                  RETRY
                </Text>
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Dismiss error"
              onPress={() => controller.removePendingOperation(activity.error!.operationId)}
              hitSlop={6}
              style={styles.action}
            >
              <Text style={[styles.actionText, { color: theme.textMuted, fontFamily: theme.fontMono }]}>
                DISMISS
              </Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      <WorkingBar active={!failed} color={tint} trackColor={theme.line} />
    </View>
  );
}

function Badge({ text, color, theme }: { text: string; color: string; theme: LearningTheme }) {
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <Text style={[styles.badgeText, { color, fontFamily: theme.fontMono }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderWidth: 1,
    borderRadius: Structure.radiusControl,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
    marginHorizontal: 12,
    marginBottom: 8,
    gap: 8,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  copy: { flex: 1 },
  labelRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  label: { fontSize: TypeScale.body, fontWeight: "700", flexShrink: 1 },
  detail: { fontSize: TypeScale.meta, lineHeight: 17, marginTop: 2 },
  badge: { borderWidth: 1, borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1 },
  badgeText: { fontSize: TypeScale.label, fontWeight: "900", letterSpacing: 0.8 },
  actions: { flexDirection: "row", gap: 4 },
  action: { minHeight: Structure.tap, minWidth: 60, alignItems: "center", justifyContent: "center" },
  actionText: { fontSize: TypeScale.label, fontWeight: "800", letterSpacing: 0.6 },
});
