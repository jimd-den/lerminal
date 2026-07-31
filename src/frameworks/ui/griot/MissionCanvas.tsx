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
    // No mission is the HUD's most important state, not its least: with nothing else to
    // show, the one thing worth doing fills the space instead of sitting in a small
    // dashed card easy to scroll past.
    return (
      <Pressable
        accessibilityRole="button"
        onPress={onDefineMission}
        style={({ pressed }) => [
          styles.heroPanel,
          {
            backgroundColor: theme.panelStrong,
            borderColor: theme.accent,
          },
          pressed && styles.pressed,
        ]}
      >
        <Text style={[styles.eyebrow, { color: theme.accent, fontFamily: theme.fontMono }]}>
          NO MISSION YET
        </Text>
        <Text style={[styles.heroTitle, { color: theme.text, fontFamily: theme.fontSans }]}>
          {view.title}
        </Text>
        <Text style={[styles.heroBody, { color: theme.textMuted }]}>
          Describe what you're trying to make, understand, or solve — the Goal Architect
          will ask a few questions and turn it into a mission you can actually work from.
        </Text>
        <View style={[styles.heroCta, { backgroundColor: theme.accent }]}>
          <Text style={[styles.heroCtaText, { color: theme.accentInk, fontFamily: theme.fontMono }]}>
            START THE GOAL ARCHITECT
          </Text>
        </View>
      </Pressable>
    );
  }

  // One panel, not a title shown twice across two boxes: eyebrow, the mission itself,
  // the trio, done — the mockup's `.mission` block in a single glance.
  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open mission status report"
        onPress={onOpenReport}
        style={({ pressed }) => [
          styles.missionPanel,
          { backgroundColor: theme.panelStrong, borderColor: theme.accent + "55" },
          pressed && styles.pressed,
        ]}
      >
        <View style={styles.eyebrowRow}>
          <Text style={[styles.eyebrow, { color: theme.accent, fontFamily: theme.fontMono }]}>
            MISSION
          </Text>
          <Text style={[styles.statusText, { color: theme.textFaint, fontFamily: theme.fontMono }]}>
            {view.statusLabel}
          </Text>
        </View>
        <Text numberOfLines={2} style={[styles.title, { color: theme.text, fontFamily: theme.fontSans }]}>
          {view.title}
        </Text>
        <Text style={[styles.contextLine, { color: theme.textMuted, fontFamily: theme.fontMono }]}>
          {view.contextLine}
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
  contextLine: { fontSize: TypeScale.meta, marginTop: 3 },
  eyebrowRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  statusText: { fontSize: TypeScale.label, fontWeight: "800", letterSpacing: 1.1 },
  heroPanel: {
    borderWidth: 2,
    borderRadius: Structure.radius,
    padding: 22,
    gap: 10,
    alignItems: "flex-start",
  },
  heroTitle: { fontSize: 26, fontWeight: "800", lineHeight: 32, marginTop: 4 },
  heroBody: { fontSize: TypeScale.body, lineHeight: 22 },
  heroCta: {
    marginTop: 8,
    minHeight: Structure.tapLarge,
    borderRadius: Structure.radiusControl,
    paddingHorizontal: 20,
    justifyContent: "center",
    alignSelf: "stretch",
    alignItems: "center",
  },
  heroCtaText: { fontSize: TypeScale.label, fontWeight: "900", letterSpacing: 1.2 },
  missionPanel: {
    borderWidth: 1,
    borderRadius: Structure.radius,
    padding: 16,
    gap: 4,
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
