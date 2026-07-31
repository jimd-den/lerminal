import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  formatCounter,
  MissionCanvasViewModel,
  MissionCounter,
  SemanticTone,
} from "../../../adapters/presenters/MissionCanvasPresenter";
import { GriotTheme, Structure, TypeScale } from "./theme";

/**
 * # Mission Canvas Header
 *
 * ## Business Value & Purpose
 * The mission workstation readout at the top of the canvas: what you're building, the
 * three numbers that say where you stand, and one recommended next action with its reason.
 *
 * ## Restraint is the design
 * No progress bars, no percentages, no synthetic activity, no decoration that implies
 * measurement. Each counter is a count of cards that exist — verifiable by hand — and the
 * next action always carries *why*, because a recommendation without a reason is just an
 * instruction. The panel is calm on purpose: it should read as an instrument, not a
 * dashboard competing for attention with the work itself.
 */
export function MissionCanvasHeader({
  view,
  theme,
  onOpenReport,
  onDefineMission,
  onRunNextAction,
}: {
  view: MissionCanvasViewModel;
  theme: GriotTheme;
  onOpenReport: () => void;
  onDefineMission: () => void;
  onRunNextAction: () => void;
}) {
  if (!view.hasMission) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={onDefineMission}
        style={({ pressed }) => [
          styles.panel,
          {
            backgroundColor: theme.panelMuted,
            borderColor: theme.line,
            borderStyle: "dashed",
          },
          pressed && styles.pressed,
        ]}
      >
        <Text style={[styles.eyebrow, { color: theme.accent, fontFamily: theme.fontMono }]}>
          MISSION
        </Text>
        <Text style={[styles.title, { color: theme.text, fontFamily: theme.fontSans }]}>
          {view.title}
        </Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.identityRow}>
        <View style={styles.identityCopy}>
          <Text
            numberOfLines={2}
            style={[styles.workspaceTitle, { color: theme.text, fontFamily: theme.fontSans }]}
          >
            {view.title}
          </Text>
          <Text style={[styles.contextLine, { color: theme.textMuted, fontFamily: theme.fontMono }]}>
            {view.contextLine}
          </Text>
        </View>
        <View style={[styles.statusChip, { borderColor: theme.accent, backgroundColor: theme.accentSoft }]}>
          <Text style={[styles.statusText, { color: theme.accent, fontFamily: theme.fontMono }]}>
            {view.statusLabel}
          </Text>
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open mission status report"
        onPress={onOpenReport}
        style={({ pressed }) => [
          styles.panel,
          { backgroundColor: theme.panel, borderColor: theme.line },
          pressed && styles.pressed,
        ]}
      >
        <Text style={[styles.eyebrow, { color: theme.accent, fontFamily: theme.fontMono }]}>
          MISSION
        </Text>
        <Text style={[styles.title, { color: theme.text, fontFamily: theme.fontSans }]}>
          {view.title}
        </Text>
        {view.deliverable ? (
          <Text style={[styles.deliverable, { color: theme.textMuted }]}>{view.deliverable}</Text>
        ) : null}

        {view.counters.length > 0 ? (
          <View style={styles.counterRow}>
            {view.counters.map(counter => (
              <Counter key={counter.label} counter={counter} theme={theme} />
            ))}
          </View>
        ) : null}
      </Pressable>

      {view.nextAction ? (
        <Pressable
          accessibilityRole="button"
          onPress={onRunNextAction}
          style={({ pressed }) => [
            styles.nextPanel,
            { backgroundColor: theme.panelMuted, borderColor: theme.line },
            pressed && styles.pressed,
          ]}
        >
          <Text style={[styles.eyebrow, { color: theme.textFaint, fontFamily: theme.fontMono }]}>
            NEXT ACTION
          </Text>
          <Text style={[styles.nextLabel, { color: theme.text }]}>{view.nextAction.label}</Text>
          {/* The reason is not optional: a recommendation without one is an instruction. */}
          <Text style={[styles.nextReason, { color: theme.textMuted }]}>
            {view.nextAction.reason}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function Counter({ counter, theme }: { counter: MissionCounter; theme: GriotTheme }) {
  return (
    <View style={[styles.counter, { backgroundColor: theme.panelStrong, borderColor: theme.line }]}>
      <Text
        style={[
          styles.counterValue,
          { color: toneColor(counter.tone, theme), fontFamily: theme.fontMono },
        ]}
      >
        {formatCounter(counter.value)}
      </Text>
      <Text style={[styles.counterLabel, { color: theme.textMuted }]}>{counter.label}</Text>
    </View>
  );
}

/**
 * Resolves a semantic tone to a colour.
 *
 * The single place tones become pixels. Caution and evidence deliberately never resolve to
 * the accent, so choosing a teal accent can't make a blocker look like an ordinary card —
 * the customisation boundary the appearance system promises.
 */
export function toneColor(tone: SemanticTone, theme: GriotTheme): string {
  switch (tone) {
    case "accent":
      return theme.accent;
    case "caution":
      return theme.warning;
    case "evidence":
      return theme.evidence;
    case "positive":
      return theme.accent;
    case "neutral":
    default:
      return theme.textMuted;
  }
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  pressed: { opacity: 0.75 },
  identityRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  identityCopy: { flex: 1 },
  workspaceTitle: { fontSize: 24, fontWeight: "800", lineHeight: 30 },
  contextLine: { fontSize: TypeScale.meta, marginTop: 3 },
  statusChip: {
    borderWidth: 1,
    borderRadius: Structure.radiusElbow,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statusText: { fontSize: TypeScale.label, fontWeight: "900", letterSpacing: 1.1 },
  panel: {
    borderWidth: 1,
    borderRadius: Structure.radiusControl,
    padding: 16,
    gap: 6,
  },
  eyebrow: { fontSize: TypeScale.label, fontWeight: "900", letterSpacing: 1.4 },
  title: { fontSize: 19, fontWeight: "800", lineHeight: 25 },
  deliverable: { fontSize: TypeScale.meta, lineHeight: 19 },
  counterRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  counter: {
    flex: 1,
    borderWidth: 1,
    borderRadius: Structure.radiusElbow,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  counterValue: { fontSize: 26, fontWeight: "800", lineHeight: 30 },
  counterLabel: { fontSize: TypeScale.label, marginTop: 2 },
  nextPanel: {
    borderWidth: 1,
    borderRadius: Structure.radiusControl,
    padding: 14,
    gap: 3,
  },
  nextLabel: { fontSize: TypeScale.body, fontWeight: "700" },
  nextReason: { fontSize: TypeScale.meta, lineHeight: 18 },
});
