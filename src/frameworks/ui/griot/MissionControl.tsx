import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { AppState, GriotController } from "../../../adapters/presenters/GriotController";
import { WorkspacePhase } from "../../../entities/workspace";
import { GriotTheme } from "./theme";

const PHASES: WorkspacePhase[] = ["define", "explore", "build", "review", "done"];

/**
 * # Mission Control Module
 *
 * ## Business Value & Purpose
 * The compact, top-of-canvas summary that shifts the deck from a generic card bucket
 * toward a goal-directed workbench (Phase 4) — without becoming a separate dashboard
 * screen or competing with the deck's one primary "Continue" action. Reads
 * `state.gapReport` (computed deterministically, no API key required — see
 * `GapReportInteractor`) and shows the mission, evidence counts, and one high-confidence
 * next action as a lightweight text link (not a second button) alongside the link into
 * the full report, where the heuristic maturity read lives. When the workspace has no
 * mission yet, it's an elegant, low-pressure prompt to define one — the rest of the app
 * keeps working normally either way.
 */
export function MissionControlModule({
  controller,
  state,
  theme,
  onOpenReport,
}: {
  controller: GriotController;
  state: AppState;
  theme: GriotTheme;
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
          styles.emptyPanel,
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
  const currentPhase = state.workspaces.find(w => w.id === state.activeWorkspaceId)?.mission?.currentPhase;

  return (
    <View style={[styles.panel, styles.row, { backgroundColor: theme.panelStrong, borderColor: theme.line }]}>
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

        <View style={styles.phaseRow}>
          {PHASES.map((phase) => {
            const active = phase === currentPhase;
            return (
              <Pressable
                key={phase}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => void controller.setMissionPhase(phase)}
                style={[
                  styles.phaseChip,
                  {
                    borderColor: active ? theme.accent : theme.line,
                    backgroundColor: active ? theme.accentSoft : "transparent",
                  },
                ]}
              >
                <Text
                  style={[
                    styles.phaseChipText,
                    { color: active ? theme.accent : theme.textFaint, fontFamily: theme.fontMono },
                  ]}
                >
                  {phase.toUpperCase()}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.countsRow}>
          <CountBadge label="BLOCKERS" value={report.evidence.openQuestions} theme={theme} warn={report.evidence.openQuestions > 0} />
          <CountBadge label="EXPERIMENTS" value={report.evidence.experiments} theme={theme} />
          <CountBadge label="TASKS" value={report.evidence.tasks} theme={theme} />
        </View>

        <View style={styles.linkRow}>
          {nextAction ? (
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                nextAction.presetId ? controller.openPreflight(nextAction.presetId) : controller.openMissionEditor()
              }
              hitSlop={6}
            >
              <Text numberOfLines={1} style={[styles.linkText, { color: theme.accent, fontFamily: theme.fontMono }]}>
                NEXT: {nextAction.label} →
              </Text>
            </Pressable>
          ) : <View />}
          <Pressable accessibilityRole="button" onPress={onOpenReport} hitSlop={6}>
            <Text style={[styles.linkText, { color: theme.textFaint, fontFamily: theme.fontMono }]}>
              FULL STATUS →
            </Text>
          </Pressable>
        </View>

        <View style={styles.linkRow}>
          <Pressable accessibilityRole="button" onPress={() => void controller.generateSyllabus()} hitSlop={6}>
            <Text style={[styles.linkText, { color: theme.accent, fontFamily: theme.fontMono }]}>
              GENERATE SYLLABUS →
            </Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => controller.openPreflight("research-web")} hitSlop={6}>
            <Text style={[styles.linkText, { color: theme.textFaint, fontFamily: theme.fontMono }]}>
              SEARCH WEB →
            </Text>
          </Pressable>
        </View>
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
  theme: GriotTheme;
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
    overflow: "hidden",
  },
  row: { flexDirection: "row" },
  emptyPanel: { padding: 16 },
  rail: { width: 5, alignSelf: "stretch" },
  body: { flex: 1, padding: 16 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  eyebrow: { fontSize: 12, fontWeight: "900", letterSpacing: 1.4 },
  editLink: { fontSize: 12, fontWeight: "800", letterSpacing: 0.6, minHeight: 30 },
  title: { fontSize: 18, fontWeight: "700", lineHeight: 23, marginTop: 4 },
  deliverable: { fontSize: 12, marginTop: 4 },
  countsRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  badge: { flex: 1, borderWidth: 1, borderRadius: 8, paddingVertical: 8, alignItems: "center" },
  badgeValue: { fontSize: 15, fontWeight: "800" },
  badgeLabel: { fontSize: 12, fontWeight: "800", letterSpacing: 0.5, marginTop: 2 },
  phaseRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  phaseChip: { minHeight: 32, borderWidth: 1, borderRadius: 7, paddingHorizontal: 8, justifyContent: "center" },
  phaseChipText: { fontSize: 12, fontWeight: "800", letterSpacing: 0.8 },
  linkRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 12, minHeight: 44 },
  linkText: { fontSize: 12, fontWeight: "800", letterSpacing: 0.4, maxWidth: 180 },
  emptyTitle: { fontSize: 16, fontWeight: "700", marginTop: 6 },
  emptyBody: { fontSize: 12, lineHeight: 17, marginTop: 4 },
});
