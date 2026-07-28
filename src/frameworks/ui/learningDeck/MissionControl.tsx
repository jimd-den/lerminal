import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { AppState, LearnimalController } from "../../../adapters/presenters/LearnimalController";
import { LearningTheme } from "./theme";

/**
 * # Mission Control Module
 *
 * ## Business Value & Purpose
 * The compact, top-of-canvas summary that shifts the deck from a generic card bucket
 * toward a goal-directed workbench (Phase 4) — without becoming a separate dashboard
 * screen. Reads `state.gapReport` (computed deterministically, no API key required — see
 * `GapReportInteractor`) and shows the mission, a maturity read explicitly labeled as
 * heuristic, evidence counts, and exactly one high-confidence next action. When the
 * workspace has no mission yet, it's an elegant, low-pressure prompt to define one —
 * the rest of the app keeps working normally either way.
 */
export function MissionControlModule({
  controller,
  state,
  theme,
  onOpenReport,
}: {
  controller: LearnimalController;
  state: AppState;
  theme: LearningTheme;
  onOpenReport: () => void;
}) {
  const report = state.gapReport;
  if (!report) return null;

  if (!report.hasMission) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={() => controller.openMissionEditor()}
        style={({ pressed }) => [
          styles.panel,
          { backgroundColor: theme.panelMuted, borderColor: theme.line, borderStyle: "dashed" },
          pressed && styles.pressed,
        ]}
      >
        <Text style={[styles.eyebrow, { color: theme.accent, fontFamily: theme.fontMono }]}>MISSION</Text>
        <Text style={[styles.emptyTitle, { color: theme.text }]}>Define what you're working toward</Text>
        <Text style={[styles.emptyBody, { color: theme.textMuted }]}>
          Set a goal and success criteria to track progress here. Everything else still works without one.
        </Text>
      </Pressable>
    );
  }

  const nextAction = report.recommendedActions[0];

  return (
    <View style={[styles.panel, { backgroundColor: theme.panelStrong, borderColor: theme.line }]}>
      <View style={[styles.rail, { backgroundColor: theme.accent }]} />
      <View style={styles.body}>
        <View style={styles.headerRow}>
          <Text style={[styles.eyebrow, { color: theme.accent, fontFamily: theme.fontMono }]}>MISSION</Text>
          <Pressable onPress={() => controller.openMissionEditor()} hitSlop={8}>
            <Text style={[styles.editLink, { color: theme.textFaint, fontFamily: theme.fontMono }]}>EDIT</Text>
          </Pressable>
        </View>
        <Text numberOfLines={2} style={[styles.title, { color: theme.text }]}>{report.missionTitle}</Text>
        {report.missionDeliverable ? (
          <Text numberOfLines={1} style={[styles.deliverable, { color: theme.textMuted }]}>
            Deliverable: {report.missionDeliverable}
          </Text>
        ) : null}
        <Text numberOfLines={2} style={[styles.status, { color: theme.textFaint }]}>{report.maturityLabel}</Text>

        <View style={styles.countsRow}>
          <CountBadge label="BLOCKERS" value={report.evidence.openQuestions} theme={theme} warn={report.evidence.openQuestions > 0} />
          <CountBadge label="EXPERIMENTS" value={report.evidence.experiments} theme={theme} />
          <CountBadge label="TASKS" value={report.evidence.tasks} theme={theme} />
        </View>

        {nextAction ? (
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              nextAction.presetId ? controller.openPreflight(nextAction.presetId) : controller.openMissionEditor()
            }
            style={({ pressed }) => [
              styles.nextAction,
              { backgroundColor: theme.accentSoft, borderColor: theme.accent },
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.nextActionLabel, { color: theme.accent, fontFamily: theme.fontMono }]}>
              NEXT ACTION
            </Text>
            <Text numberOfLines={1} style={[styles.nextActionText, { color: theme.text }]}>{nextAction.label}</Text>
          </Pressable>
        ) : null}

        <Pressable accessibilityRole="button" onPress={onOpenReport} style={styles.reportLink}>
          <Text style={[styles.reportLinkText, { color: theme.accent, fontFamily: theme.fontMono }]}>
            VIEW FULL STATUS →
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function CountBadge({
  label,
  value,
  theme,
  warn,
}: {
  label: string;
  value: number;
  theme: LearningTheme;
  warn?: boolean;
}) {
  return (
    <View style={[styles.badge, { borderColor: theme.line }]}>
      <Text style={[styles.badgeValue, { color: warn ? theme.warning : theme.text, fontFamily: theme.fontMono }]}>
        {value}
      </Text>
      <Text style={[styles.badgeLabel, { color: theme.textFaint, fontFamily: theme.fontMono }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.7 },
  panel: {
    borderWidth: 1,
    borderRadius: 16,
    marginBottom: 18,
    flexDirection: "row",
    overflow: "hidden",
    padding: 16,
  },
  rail: { width: 5, alignSelf: "stretch", marginRight: 12, marginLeft: -16, borderRadius: 3 },
  body: { flex: 1 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  eyebrow: { fontSize: 10, fontWeight: "900", letterSpacing: 1.4 },
  editLink: { fontSize: 10, fontWeight: "800", letterSpacing: 0.6, minHeight: 30 },
  title: { fontSize: 18, fontWeight: "700", lineHeight: 23, marginTop: 4 },
  deliverable: { fontSize: 12, marginTop: 4 },
  status: { fontSize: 11, lineHeight: 15, marginTop: 6 },
  countsRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  badge: { flex: 1, borderWidth: 1, borderRadius: 8, paddingVertical: 8, alignItems: "center" },
  badgeValue: { fontSize: 15, fontWeight: "800" },
  badgeLabel: { fontSize: 9, fontWeight: "800", letterSpacing: 0.5, marginTop: 2 },
  nextAction: { borderWidth: 1, borderRadius: 10, padding: 12, marginTop: 12, minHeight: 48, justifyContent: "center" },
  nextActionLabel: { fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  nextActionText: { fontSize: 13, fontWeight: "700", marginTop: 2 },
  reportLink: { minHeight: 40, justifyContent: "center", marginTop: 8 },
  reportLinkText: { fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
  emptyTitle: { fontSize: 16, fontWeight: "700", marginTop: 6 },
  emptyBody: { fontSize: 12, lineHeight: 17, marginTop: 4 },
});
