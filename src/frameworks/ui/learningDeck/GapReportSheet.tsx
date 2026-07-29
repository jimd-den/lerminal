import React from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { AppState, LearnimalController } from "../../../adapters/presenters/LearnimalController";
import { LearningTheme } from "./theme";

/**
 * # Gap Report Sheet
 *
 * ## Business Value & Purpose
 * The full answer to "what do I have, what do I want, what is missing, and what should I
 * do next?" — every section here comes straight from the deterministic `GapReport`
 * (`state.gapReport`), computed without a model call. "Enrich with AI" is a clearly
 * separate, explicitly-scoped step (it opens the standard AI preflight for the
 * `status-report` preset) rather than something blended into this report silently.
 */
export function GapReportSheet({
  controller,
  state,
  theme,
}: {
  controller: LearnimalController;
  state: AppState;
  theme: LearningTheme;
}) {
  const report = state.gapReport;

  return (
    <Modal
      visible={state.isGapReportOpen}
      animationType="slide"
      onRequestClose={() => controller.closeGapReport()}
    >
      <View style={[styles.root, { backgroundColor: theme.background }]}>
        <View style={[styles.header, { borderBottomColor: theme.line }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.eyebrow, { color: theme.accent, fontFamily: theme.fontMono }]}>STATUS</Text>
            <Text style={[styles.title, { color: theme.text }]}>Gap report</Text>
          </View>
          <Pressable onPress={() => controller.closeGapReport()} style={styles.close}>
            <Text style={[styles.closeText, { color: theme.accent, fontFamily: theme.fontMono }]}>CLOSE</Text>
          </Pressable>
        </View>

        {!report ? (
          <View style={styles.centerFill}>
            <Text style={[styles.emptyText, { color: theme.textMuted }]}>Create a workspace first.</Text>
          </View>
        ) : (
          <ScrollView style={styles.body} contentContainerStyle={styles.content}>
            <Section label="MISSION / DESIRED OUTCOME" theme={theme}>
              <Text style={[styles.bodyText, { color: theme.text }]}>
                {report.hasMission ? report.missionTitle : "No mission defined yet."}
              </Text>
              {report.missionDeliverable ? (
                <Text style={[styles.mutedText, { color: theme.textMuted }]}>Deliverable: {report.missionDeliverable}</Text>
              ) : null}
            </Section>

            <Section label="CURRENT EVIDENCE" theme={theme}>
              <View style={styles.countsGrid}>
                <Count label="Sources" value={report.evidence.sources} theme={theme} />
                <Count label="Concepts" value={report.evidence.concepts} theme={theme} />
                <Count label="Claims" value={report.evidence.claims} theme={theme} />
                <Count label="Experiments" value={report.evidence.experiments} theme={theme} />
                <Count label="Tasks" value={report.evidence.tasks} theme={theme} />
                <Count label="Deliverables" value={report.evidence.deliverables} theme={theme} />
              </View>
            </Section>

            {report.blockers.length > 0 ? (
              <Section label={`KNOWN BLOCKERS / QUESTIONS (${report.blockers.length})`} theme={theme}>
                {report.blockers.map((b) => (
                  <Text key={b.id} numberOfLines={1} style={[styles.listItem, { color: theme.text }]}>
                    · {b.title}
                  </Text>
                ))}
              </Section>
            ) : null}

            {report.successCriteria.length > 0 ? (
              <Section label="SUCCESS CRITERIA" theme={theme}>
                {report.successCriteria.map((c, i) => (
                  <Text key={i} style={[styles.listItem, { color: c.hasEvidence ? theme.text : theme.warning }]}>
                    {c.hasEvidence ? "✓" : "○"} {c.text}
                  </Text>
                ))}
              </Section>
            ) : null}

            <Section label="EVIDENCE GAPS" theme={theme}>
              {report.evidenceGaps.length === 0 ? (
                <Text style={[styles.mutedText, { color: theme.textMuted }]}>No obvious gaps flagged.</Text>
              ) : (
                report.evidenceGaps.map((gap, i) => (
                  <Text key={i} style={[styles.listItem, { color: theme.warning }]}>⚠ {gap}</Text>
                ))
              )}
            </Section>

            <Section label="RECOMMENDED NEXT ACTIONS" theme={theme}>
              {report.recommendedActions.map((action, i) => (
                <Pressable
                  key={i}
                  disabled={!action.presetId}
                  onPress={() => {
                    if (!action.presetId) return;
                    controller.closeGapReport();
                    controller.openPreflight(action.presetId);
                  }}
                  style={({ pressed }) => [
                    styles.actionRow,
                    { borderColor: theme.line },
                    pressed && action.presetId ? { opacity: 0.7 } : null,
                  ]}
                >
                  <Text style={[styles.actionLabel, { color: action.presetId ? theme.accent : theme.text }]}>
                    {action.label}
                  </Text>
                  <Text style={[styles.actionReason, { color: theme.textMuted }]}>{action.reason}</Text>
                </Pressable>
              ))}
            </Section>

            <Section label="COMPLETION" theme={theme}>
              <Text style={[styles.mutedText, { color: theme.textMuted }]}>{report.maturityLabel}</Text>
            </Section>

            <Pressable
              onPress={() => controller.enrichGapReport()}
              style={({ pressed }) => [
                styles.enrichButton,
                { borderColor: theme.accent, backgroundColor: theme.accentSoft },
                pressed && { opacity: 0.7 },
              ]}
            >
              <Text style={[styles.enrichButtonText, { color: theme.accent, fontFamily: theme.fontMono }]}>
                ENRICH WITH AI →
              </Text>
            </Pressable>
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

function Section({ label, theme, children }: { label: string; theme: LearningTheme; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionLabel, { color: theme.textFaint, fontFamily: theme.fontMono }]}>{label}</Text>
      {children}
    </View>
  );
}

function Count({ label, value, theme }: { label: string; value: number; theme: LearningTheme }) {
  return (
    <View style={[styles.countBox, { borderColor: theme.line }]}>
      <Text style={[styles.countValue, { color: theme.text, fontFamily: theme.fontMono }]}>{value}</Text>
      <Text style={[styles.countLabel, { color: theme.textFaint }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", minHeight: 64, paddingHorizontal: 18, borderBottomWidth: 1 },
  eyebrow: { fontSize: 12, fontWeight: "900", letterSpacing: 1.4 },
  title: { fontSize: 18, fontWeight: "700", marginTop: 2 },
  close: { minHeight: 44, minWidth: 44, alignItems: "flex-end", justifyContent: "center" },
  closeText: { fontSize: 12, fontWeight: "800" },
  centerFill: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyText: { fontSize: 14 },
  body: { flex: 1 },
  content: { padding: 18 },
  section: { marginBottom: 22 },
  sectionLabel: { fontSize: 12, fontWeight: "800", letterSpacing: 1.2, marginBottom: 8 },
  bodyText: { fontSize: 16, fontWeight: "700" },
  mutedText: { fontSize: 13, lineHeight: 19 },
  listItem: { fontSize: 13, lineHeight: 20 },
  countsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  countBox: { width: "31%", borderWidth: 1, borderRadius: 8, paddingVertical: 10, alignItems: "center" },
  countValue: { fontSize: 16, fontWeight: "800" },
  countLabel: { fontSize: 12, marginTop: 2 },
  actionRow: { borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 8, minHeight: 48 },
  actionLabel: { fontSize: 14, fontWeight: "700" },
  actionReason: { fontSize: 12, marginTop: 3 },
  enrichButton: { borderWidth: 1, borderRadius: 10, minHeight: 50, justifyContent: "center", alignItems: "center", marginTop: 6, marginBottom: 24 },
  enrichButtonText: { fontSize: 13, fontWeight: "800" },
});
