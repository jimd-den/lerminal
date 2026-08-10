import React from "react";
import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "../Typography";
import {
  AppState,
  GriotController,
} from "../../../../adapters/presenters/GriotController";
import { presentBridge, ContactViewModel } from "../../../../adapters/presenters/BridgePresenter";
import { GriotTheme, Structure, TypeScale } from "../theme";
import { SituationStrip, StationRail } from "./instruments";
import { ContactPanel } from "./ContactPanel";

/**
 * # Bridge Screen — the master situation display
 *
 * ## Business Value & Purpose
 * The place the captain looks to see what the ship is doing. Not a feed, not an inbox, not
 * a conversation: an instrument panel whose readings are already there when you arrive,
 * and which changes while you watch it.
 *
 * Three bands, top to bottom, in the order a person actually needs them:
 *
 * 1. **Situation** — the ship's vitals, counted from cards in memory. Always true, always
 *    present, never blank because a model call failed.
 * 2. **Crew** — who is on watch, what cadence they keep, and what they have outstanding.
 * 3. **Scope** — every reading, nested into the tree its expansions describe.
 *
 * ## The loop lives here
 * A station with a clock watch needs something to wake it, and the shell is the only thing
 * that knows the bridge is on screen. So this screen holds one interval, ticking a minute
 * at a time, that asks the workflow whether anything is due — and the workflow, not this
 * screen, decides. That keeps the cadence policy in the domain where it can be tested, and
 * keeps the timer where it can be torn down when the captain leaves.
 *
 * The interval is deliberately coarse: a watch is a background reading, not an animation
 * frame, and a minute of latency on a thirty-minute cadence is not a latency anyone can
 * perceive.
 */
export function BridgeScreen({
  controller,
  state,
  theme,
}: {
  controller: GriotController;
  state: AppState;
  theme: GriotTheme;
}) {
  const view = presentBridge(state.bridge, Date.now());

  // Coming to the bridge: load the crew and the scope, and run whatever is due. The
  // workflow cooldown-gates `on-report` watches, so arriving repeatedly costs nothing.
  React.useEffect(() => {
    void controller.openBridge();
  }, [controller, state.activeWorkspaceId]);

  // The watch rotation. One coarse tick; the workflow decides what, if anything, is due.
  React.useEffect(() => {
    const timer = setInterval(() => {
      void controller.runDueWatches();
    }, 60000);
    return () => clearInterval(timer);
  }, [controller]);

  /**
   * Duty controls, on long press so the common tap stays a safe, reversible filter.
   *
   * Decommissioning is destructive — a station's readings go with it — so it confirms, and
   * says what goes, in the same discipline as deleting a selection.
   */
  const openStationControls = (stationId: string) => {
    const station = view.stations.find(s => s.id === stationId);
    if (!station) return;

    const relieved = station.status === "relieved";
    Alert.alert(
      station.name,
      `${station.statusLabel} · ${station.watchLabel}${station.error ? `\n\n${station.error}` : ""}`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Stand watch now", onPress: () => void controller.standWatch(stationId) },
        {
          text: relieved ? "Back on watch" : "Relieve",
          onPress: () =>
            void (relieved ? controller.resumeStation(stationId) : controller.relieveStation(stationId)),
        },
        {
          text: "Decommission",
          style: "destructive",
          onPress: () =>
            Alert.alert(
              `Decommission ${station.name}?`,
              "Its readings leave the scope with it. Nothing in your workspace is touched.",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Decommission",
                  style: "destructive",
                  onPress: () => void controller.decommissionStation(stationId),
                },
              ]
            ),
        },
      ]
    );
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.topBar, { borderBottomColor: theme.line }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: theme.text, fontFamily: theme.fontSans }]}>
            Bridge
          </Text>
          <Text style={[styles.subtitle, { color: theme.textMuted, fontFamily: theme.fontMono }]}>
            {view.scope.outstanding > 0
              ? `${view.scope.outstanding} OUTSTANDING`
              : "NOTHING OUTSTANDING"}
          </Text>
        </View>
        {view.scope.outstanding > 0 ? (
          <View style={[styles.alertPip, { backgroundColor: theme.warning }]} />
        ) : null}
      </View>

      <SituationStrip view={view.situation} theme={theme} scanning={view.scanning} />

      <StationRail
        stations={view.stations}
        theme={theme}
        onFocus={stationId => controller.focusStation(stationId)}
        onLongPress={openStationControls}
        onCommission={() => controller.openCommission()}
      />

      {/* An error the captain can act on, distinct from a single station being fouled —
          that lives on the rail, where a broken instrument belongs. */}
      {view.error ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${view.error}. Tap to dismiss.`}
          onPress={() => controller.clearBridgeError()}
          style={[styles.error, { borderColor: theme.danger, backgroundColor: theme.panel }]}
        >
          <Text style={[styles.errorText, { color: theme.danger, fontFamily: theme.fontSans }]}>
            {view.error}
          </Text>
        </Pressable>
      ) : null}

      <View style={styles.scopeHead}>
        <Text style={[styles.eyebrow, { color: theme.accent, fontFamily: theme.fontMono }]}>
          SCOPE
        </Text>
        {view.scope.filtered ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => controller.focusStation(null)}
            hitSlop={8}
          >
            <Text style={[styles.clearFilter, { color: theme.accent, fontFamily: theme.fontMono }]}>
              SHOW ALL →
            </Text>
          </Pressable>
        ) : null}
      </View>

      {view.scope.nodes.length === 0 ? (
        <EmptyScope
          theme={theme}
          loaded={view.loaded}
          hasStations={view.stations.length > 0}
          filtered={view.scope.filtered}
          onCommission={() => controller.openCommission()}
          onShowAll={() => controller.focusStation(null)}
        />
      ) : (
        view.scope.nodes.map((contact, index) => (
          <ContactPanel
            key={contact.id}
            contact={contact}
            theme={theme}
            index={index}
            onOrder={(contactId, orderId) => void controller.giveOrder(contactId, orderId)}
            onDismiss={contactId => void controller.dismissContact(contactId)}
            onDiscuss={openTable(controller)}
          />
        ))
      )}
    </ScrollView>
  );
}

/**
 * Takes a reading to the table.
 *
 * The bridge is where the captain sees; the table is where they deliberate. Opening the
 * conversation *from a specific contact*, with the reading already stated, is the version
 * of chat that was always worth keeping — a discussion you chose to have about something
 * concrete, rather than a blank box that makes you supply the context yourself. Once it is
 * open the captain can put the same question to a whole roundtable.
 */
function openTable(controller: GriotController) {
  return (contact: ContactViewModel) => {
    controller.openWorkspaceAgent();
    controller.sendWorkspaceAgentMessage(
      `${contact.stationName} raised this: “${contact.title}”. ${summarize(contact)} Let's talk it through.`
    );
  };
}

/** One honest sentence about what the reading actually said — never more than it holds. */
function summarize(contact: ContactViewModel): string {
  const readout = contact.readout;
  switch (readout.shape) {
    case "finding":
      return readout.detail ?? "";
    case "manifest":
      return `It proposed: ${readout.entries.map(entry => entry.title).join(", ")}.`;
    case "plan":
      return `It plotted a route toward ${readout.goal}.`;
    case "drill":
      return `${readout.dueCount} cards are due.`;
    case "signal":
      return readout.text;
  }
}

/**
 * The empty scope, which is four different situations wearing one layout. Saying which one
 * it is — and offering the one control that resolves it — is the difference between an
 * empty state and a dead end.
 */
function EmptyScope({
  theme,
  loaded,
  hasStations,
  filtered,
  onCommission,
  onShowAll,
}: {
  theme: GriotTheme;
  loaded: boolean;
  hasStations: boolean;
  filtered: boolean;
  onCommission: () => void;
  onShowAll: () => void;
}) {
  if (!loaded) {
    return (
      <Readout theme={theme} code="STANDING BY" text="Reading the bridge log." />
    );
  }

  if (filtered) {
    return (
      <Readout
        theme={theme}
        code="NOTHING FROM THIS POST"
        text="This station has raised nothing yet."
        actionLabel="SHOW EVERY POST"
        onAction={onShowAll}
      />
    );
  }

  if (!hasStations) {
    return (
      <Readout
        theme={theme}
        code="NOBODY ON WATCH"
        text="The scope is empty because nothing is crewed. Sensors and Tactical read your workspace directly — they need no model and no network, so they are the ones to start with."
        actionLabel="CREW A POST"
        onAction={onCommission}
      />
    );
  }

  return (
    <Readout
      theme={theme}
      code="ALL QUIET"
      text="Your crew is on watch and has found nothing outstanding. The scope fills as they do."
    />
  );
}

function Readout({
  theme,
  code,
  text,
  actionLabel,
  onAction,
}: {
  theme: GriotTheme;
  code: string;
  text: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={[styles.readout, { borderColor: theme.line, backgroundColor: theme.panel }]}>
      <Text style={[styles.readoutCode, { color: theme.textFaint, fontFamily: theme.fontMono }]}>
        — {code} —
      </Text>
      <Text style={[styles.readoutText, { color: theme.textMuted, fontFamily: theme.fontSans }]}>
        {text}
      </Text>
      {actionLabel && onAction ? (
        <Pressable
          accessibilityRole="button"
          onPress={onAction}
          style={({ pressed }) => [
            styles.readoutAction,
            { borderColor: theme.accent },
            pressed && { opacity: 0.7 },
          ]}
        >
          <Text
            style={[styles.readoutActionText, { color: theme.accent, fontFamily: theme.fontMono }]}
          >
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  // Clears the floating Ask and Capture affordances stacked above the nav, so the last
  // contact is never stranded underneath either of them.
  content: { paddingHorizontal: 16, paddingBottom: 180 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingTop: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  title: { fontSize: TypeScale.title, fontWeight: "800", letterSpacing: -0.4 },
  subtitle: { fontSize: TypeScale.label, fontWeight: "800", letterSpacing: 1.2, marginTop: 3 },
  alertPip: { width: 10, height: 10, borderRadius: 5 },
  eyebrow: { fontSize: TypeScale.label, fontWeight: "900", letterSpacing: 1.4 },
  scopeHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 20,
    marginBottom: 2,
    paddingHorizontal: 2,
  },
  clearFilter: { fontSize: TypeScale.label, fontWeight: "800", letterSpacing: 1 },
  error: {
    borderWidth: 1,
    borderRadius: Structure.radiusControl,
    padding: 12,
    marginTop: 12,
  },
  errorText: { fontSize: TypeScale.meta, lineHeight: 19 },
  readout: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: Structure.radiusControl,
    padding: 22,
    alignItems: "center",
    gap: 8,
    marginTop: 8,
  },
  readoutCode: { fontSize: TypeScale.label, fontWeight: "900", letterSpacing: 1.2 },
  readoutText: { fontSize: TypeScale.meta, lineHeight: 20, textAlign: "center" },
  readoutAction: {
    minHeight: Structure.tap,
    borderWidth: 1,
    borderRadius: Structure.radiusControl,
    paddingHorizontal: 18,
    justifyContent: "center",
    marginTop: 4,
  },
  readoutActionText: { fontSize: TypeScale.label, fontWeight: "900", letterSpacing: 1 },
});
