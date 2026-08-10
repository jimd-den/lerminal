import React from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "../Typography";
import { StationDuty } from "../../../../entities/bridge";
import {
  SituationViewModel,
  StationViewModel,
} from "../../../../adapters/presenters/BridgePresenter";
import { GriotTheme, Structure, TypeScale } from "../theme";
import { CountPulse, WorkingBar } from "../../motion/communicative";

/**
 * # Bridge Instruments — the vitals strip and the crew rail
 *
 * ## Business Value & Purpose
 * The two fixed readings at the top of the panel: *what state is the ship in* and *who is
 * on watch*. Both are always present and always true — the strip is plain counting over
 * cards in memory, and the rail describes stations that exist. Neither can go blank
 * because a model call failed, which is what stops the bridge being dark exactly when the
 * captain needs orientation.
 *
 * ## Why duty colour lives here and not in the presenter
 * Colour is a theme decision. The presenter names the duty; this file decides what a duty
 * looks like, drawing every value from the theme's own tokens so the palette the user
 * picked reaches the bridge like it reaches everything else. A presenter that emitted hex
 * codes would be a palette the user cannot change.
 */

/**
 * A duty's colour, drawn from the theme rather than a fixed table.
 *
 * The pairing is meaning-first: the two deterministic posts share the calm `evidence`
 * tone because they report what is verifiably there, the two that propose new material
 * take the accent, and the two that flag work take warning and danger. A captain scanning
 * the rail learns *what kind of station* it is before reading a word.
 */
export function dutyTone(duty: StationDuty, theme: GriotTheme): string {
  switch (duty) {
    case "sensors":
      return theme.evidence;
    case "tactical":
      return theme.warning;
    case "science":
      return theme.accent;
    case "engineering":
      return theme.accent;
    case "navigation":
      return theme.evidence;
    case "comms":
      return theme.textMuted;
  }
}

/**
 * The vitals strip.
 *
 * Four cells and one sentence. Cells that represent something outstanding are drawn in the
 * warning tone; totals stay quiet. The settled bar is the one proportional reading, and it
 * is labelled with what it measures — housekeeping — rather than "progress", which
 * counting cannot honestly claim.
 */
export function SituationStrip({
  view,
  theme,
  scanning,
}: {
  view: SituationViewModel;
  theme: GriotTheme;
  /** True while any watch is in flight. Drives the one sweeping bar on the panel. */
  scanning: boolean;
}) {
  return (
    <View style={[styles.strip, { backgroundColor: theme.panelStrong, borderColor: theme.line }]}>
      <View style={styles.stripHead}>
        <Text style={[styles.eyebrow, { color: theme.accent, fontFamily: theme.fontMono }]}>
          SITUATION
        </Text>
        <Text style={[styles.settledLabel, { color: theme.textFaint, fontFamily: theme.fontMono }]}>
          {view.settledLabel}
        </Text>
      </View>

      <Text style={[styles.headline, { color: theme.text, fontFamily: theme.fontSans }]}>
        {view.headline}
      </Text>

      <View style={styles.cells}>
        {view.cells.map(cell => (
          <View key={cell.id} style={[styles.cell, { borderColor: theme.line }]}>
            {/* Pulses when the number changes, which is how a watch finishing reads as
                something happening rather than a silent re-render. */}
            <CountPulse value={cell.value}>
              <Text
                style={[
                  styles.cellValue,
                  {
                    color: cell.attention ? theme.warning : theme.text,
                    fontFamily: theme.fontMono,
                  },
                ]}
              >
                {cell.value}
              </Text>
            </CountPulse>
            <Text
              style={[styles.cellLabel, { color: theme.textFaint, fontFamily: theme.fontMono }]}
            >
              {cell.label.toUpperCase()}
            </Text>
          </View>
        ))}
      </View>

      {/* A settled bar rather than a percentage alone: the proportion is the point, and a
          bar shows it without the captain having to read a number twice. */}
      <View style={[styles.settledTrack, { backgroundColor: theme.line }]}>
        <View
          style={[
            styles.settledFill,
            {
              backgroundColor: theme.evidence,
              width: `${Math.round(view.settled * 100)}%`,
            },
          ]}
        />
      </View>

      <WorkingBar active={scanning} color={theme.accent} trackColor={theme.line} />
    </View>
  );
}

/**
 * The crew rail: one card per station, horizontally scrolled.
 *
 * Tapping a station focuses the scope on its readings — the fastest way to answer "what
 * has *this* post found". Long-pressing offers the duty controls, so the common tap stays
 * a single, safe, reversible filter.
 */
export function StationRail({
  stations,
  theme,
  onFocus,
  onLongPress,
  onCommission,
}: {
  stations: StationViewModel[];
  theme: GriotTheme;
  onFocus: (stationId: string) => void;
  onLongPress: (stationId: string) => void;
  onCommission: () => void;
}) {
  return (
    <View style={styles.railBlock}>
      <View style={styles.railHead}>
        <Text style={[styles.eyebrow, { color: theme.accent, fontFamily: theme.fontMono }]}>
          CREW
        </Text>
        <Text style={[styles.railCount, { color: theme.textFaint, fontFamily: theme.fontMono }]}>
          {stations.length === 0 ? "NOBODY ON WATCH" : `${stations.length} ON THE RAIL`}
        </Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rail}
      >
        {stations.map(station => (
          <StationCard
            key={station.id}
            station={station}
            theme={theme}
            onPress={() => onFocus(station.id)}
            onLongPress={() => onLongPress(station.id)}
          />
        ))}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Commission a station"
          accessibilityHint="Puts a new post on watch over this workspace."
          onPress={onCommission}
          style={({ pressed }) => [
            styles.stationCard,
            styles.commissionCard,
            { borderColor: theme.accent, backgroundColor: theme.panel },
            pressed && styles.pressed,
          ]}
        >
          <Text style={[styles.commissionPlus, { color: theme.accent, fontFamily: theme.fontMono }]}>
            +
          </Text>
          <Text style={[styles.commissionText, { color: theme.accent, fontFamily: theme.fontMono }]}>
            CREW A POST
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function StationCard({
  station,
  theme,
  onPress,
  onLongPress,
}: {
  station: StationViewModel;
  theme: GriotTheme;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const tone = dutyTone(station.duty, theme);
  // A fouled or relieved post must not wear its duty colour: the rail's job is to make a
  // post that is not working visibly not working.
  const rail =
    station.status === "fouled"
      ? theme.danger
      : station.status === "relieved"
        ? theme.textFaint
        : tone;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${station.name}, ${station.statusLabel.toLowerCase()}`}
      accessibilityHint="Tap to show only this station's readings. Long press for duty controls."
      accessibilityState={{ selected: station.focused }}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={320}
      style={({ pressed }) => [
        styles.stationCard,
        {
          backgroundColor: station.focused ? theme.accentSoft : theme.panel,
          borderColor: station.focused ? theme.accent : theme.line,
        },
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.stationRail, { backgroundColor: rail }]} />

      <View style={styles.stationBody}>
        <View style={styles.stationTop}>
          <Text style={[styles.stationDuty, { color: rail, fontFamily: theme.fontMono }]}>
            {station.dutyLabel.toUpperCase()}
          </Text>
          {station.outstanding > 0 ? (
            <CountPulse value={station.outstanding}>
              <View style={[styles.stationBadge, { backgroundColor: theme.warning }]}>
                <Text
                  style={[
                    styles.stationBadgeText,
                    { color: theme.background, fontFamily: theme.fontMono },
                  ]}
                >
                  {station.outstanding}
                </Text>
              </View>
            </CountPulse>
          ) : null}
        </View>

        <Text
          numberOfLines={2}
          style={[styles.stationName, { color: theme.text, fontFamily: theme.fontSans }]}
        >
          {station.subject || station.name}
        </Text>

        <Text
          numberOfLines={1}
          style={[
            styles.stationStatus,
            {
              color: station.status === "fouled" ? theme.danger : theme.textMuted,
              fontFamily: theme.fontMono,
            },
          ]}
        >
          {station.statusLabel} · {station.watchLabel}
        </Text>

        {/* Only where it is genuinely true: two of six duties need no key and no network,
            and saying so is the difference between the bridge working offline and the
            captain assuming it doesn't. */}
        {station.offline ? (
          <Text style={[styles.stationOffline, { color: theme.evidence, fontFamily: theme.fontMono }]}>
            NO MODEL NEEDED
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.75, transform: [{ scale: 0.99 }] },
  eyebrow: { fontSize: TypeScale.label, fontWeight: "900", letterSpacing: 1.4 },

  strip: {
    borderWidth: 1,
    borderRadius: Structure.radius,
    padding: 14,
    gap: 10,
    marginTop: 12,
  },
  stripHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  settledLabel: { fontSize: TypeScale.label, fontWeight: "700", letterSpacing: 0.8 },
  headline: { fontSize: TypeScale.body, lineHeight: 22, fontWeight: "600" },
  cells: { flexDirection: "row", gap: 8 },
  cell: {
    flex: 1,
    borderWidth: 1,
    borderRadius: Structure.radiusElbow,
    paddingVertical: 9,
    alignItems: "center",
    gap: 3,
  },
  cellValue: { fontSize: TypeScale.title, fontWeight: "900", letterSpacing: -0.5 },
  cellLabel: { fontSize: TypeScale.label, fontWeight: "700", letterSpacing: 0.9 },
  settledTrack: { height: 4, borderRadius: 2, overflow: "hidden" },
  settledFill: { height: 4, borderRadius: 2 },

  railBlock: { marginTop: 16, gap: 8 },
  railHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 2,
  },
  railCount: { fontSize: TypeScale.label, fontWeight: "700", letterSpacing: 0.9 },
  rail: { gap: 8, paddingRight: 8 },
  stationCard: {
    width: 168,
    minHeight: 108,
    borderWidth: 1,
    borderRadius: Structure.radiusControl,
    flexDirection: "row",
    overflow: "hidden",
  },
  stationRail: { width: Structure.rail, alignSelf: "stretch" },
  stationBody: { flex: 1, paddingHorizontal: 10, paddingVertical: 9, gap: 3 },
  stationTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  stationDuty: { fontSize: TypeScale.label, fontWeight: "900", letterSpacing: 1.1 },
  stationBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  stationBadgeText: { fontSize: TypeScale.label, fontWeight: "900" },
  stationName: { fontSize: TypeScale.meta, lineHeight: 18, fontWeight: "700" },
  stationStatus: { fontSize: TypeScale.label, fontWeight: "700", letterSpacing: 0.4 },
  stationOffline: { fontSize: TypeScale.label, fontWeight: "800", letterSpacing: 0.7 },

  commissionCard: {
    alignItems: "center",
    justifyContent: "center",
    borderStyle: "dashed",
    gap: 4,
    width: 132,
  },
  commissionPlus: { fontSize: 24, fontWeight: "900" },
  commissionText: { fontSize: TypeScale.label, fontWeight: "900", letterSpacing: 1 },
});
