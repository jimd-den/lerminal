import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "../Typography";
import { ContactReadout } from "../../../../entities/bridge";
import {
  ContactViewModel,
  OrderViewModel,
} from "../../../../adapters/presenters/BridgePresenter";
import { GriotTheme, Structure, TypeScale } from "../theme";
import { ArrivalView } from "../../motion/communicative";
import { dutyTone } from "./instruments";

/**
 * # Contact Panel — one reading on the scope
 *
 * ## Business Value & Purpose
 * This is the renderer that makes the "small models produce full-featured information"
 * claim true. A station's entire contribution was a few sentences with a few tags in them.
 * Everything below — the designation, the state badge, the manifest rows, the phase
 * ladder, the order buttons, the nesting, the escalation treatment — is drawn here from a
 * closed catalog of five readout shapes that the use-case layer picked deterministically.
 *
 * The model never chose a component, never described a layout, never emitted markup, and
 * never saw a colour. It cannot: {@link ContactReadout} is data, and this file is the only
 * thing that turns data into a surface. That is what makes the display safe to render from
 * a 2B model's output, and it is also why the panel looks the same whether the reading came
 * from a model or from plain counting.
 *
 * ## Reading a contact
 * - The rail is the duty's colour, so a glance says which post found it.
 * - The bearing (`SCI-04`) is identity on a display too small to repeat a title.
 * - The state badge changes as the captain acts, which is the display *being* the state
 *   rather than describing it.
 * - Escalation — a reading found again while still outstanding — thickens the border and
 *   says so in words. Nothing blinks; a nag that cannot be read is a nag that gets muted.
 */
export function ContactPanel({
  contact,
  theme,
  onOrder,
  onDismiss,
  onDiscuss,
  depth = 0,
  index = 0,
}: {
  contact: ContactViewModel;
  theme: GriotTheme;
  onOrder: (contactId: string, orderId: string) => void;
  onDismiss: (contactId: string) => void;
  /** Takes this reading to the roundtable — see the note on {@link DiscussOrder}. */
  onDiscuss: (contact: ContactViewModel) => void;
  depth?: number;
  /** Position among siblings, so a burst of new contacts arrives as a sequence. */
  index?: number;
}) {
  const tone = dutyTone(contact.duty, theme);
  const settled = !contact.outstanding;

  return (
    // Keyed on identity by the caller: an arrival animation that replays on every state
    // change stops meaning "this is new".
    <ArrivalView delay={Math.min(index * 45, 180)}>
      <View
        style={[
          styles.panel,
          {
            backgroundColor: settled ? theme.panelMuted : theme.panel,
            borderColor: contact.escalated ? theme.warning : theme.line,
            borderWidth: contact.escalated ? 2 : 1,
            // Children step in, so the tree reads as a tree without drawing connectors
            // that would clutter a phone-width display.
            marginLeft: depth > 0 ? 12 : 0,
            opacity: settled ? 0.82 : 1,
          },
        ]}
      >
        <View style={[styles.rail, { backgroundColor: settled ? theme.textFaint : tone }]} />

        <View style={styles.body}>
          <View style={styles.head}>
            <Text style={[styles.bearing, { color: tone, fontFamily: theme.fontMono }]}>
              {contact.bearing}
            </Text>
            <Text style={[styles.meta, { color: theme.textFaint, fontFamily: theme.fontMono }]}>
              {contact.stationName} · {contact.ageLabel}
            </Text>
            <View style={styles.headSpacer} />
            <StateBadge contact={contact} theme={theme} />
          </View>

          <Text style={[styles.title, { color: theme.text, fontFamily: theme.fontSans }]}>
            {contact.title}
          </Text>

          {contact.escalated ? (
            <Text style={[styles.escalation, { color: theme.warning, fontFamily: theme.fontMono }]}>
              STILL OPEN — FOUND AGAIN {contact.raised === 1 ? "ONCE" : `${contact.raised} TIMES`}
            </Text>
          ) : null}

          <Readout readout={contact.readout} theme={theme} tone={tone} />

          {contact.error ? (
            <Text style={[styles.error, { color: theme.danger, fontFamily: theme.fontMono }]}>
              {contact.error}
            </Text>
          ) : null}

          <View style={styles.orders}>
            {contact.orders.map(order => (
              <OrderButton
                key={order.id}
                order={order}
                theme={theme}
                tone={tone}
                onPress={() => onOrder(contact.id, order.id)}
              />
            ))}

            <DiscussOrder theme={theme} onPress={() => onDiscuss(contact)} />

            {contact.outstanding ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Clear this reading"
                onPress={() => onDismiss(contact.id)}
                hitSlop={6}
                style={({ pressed }) => [
                  styles.order,
                  { borderColor: theme.line },
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.orderText, { color: theme.textFaint, fontFamily: theme.fontMono }]}>
                  CLEAR
                </Text>
              </Pressable>
            ) : null}
          </View>

          {/* Any order's truthful outcome, shown once it has settled. Never a guess, never
              a retry prompt — the dispatcher's own message or nothing. */}
          {contact.orders
            .filter(order => order.note && order.state !== "available")
            .map(order => (
              <Text
                key={`${order.id}-note`}
                style={[
                  styles.outcome,
                  {
                    color: order.state === "failed" ? theme.danger : theme.textMuted,
                    fontFamily: theme.fontMono,
                  },
                ]}
              >
                {order.note}
              </Text>
            ))}
        </View>
      </View>

      {contact.children.map((child, childIndex) => (
        <ContactPanel
          key={child.id}
          contact={child}
          theme={theme}
          onOrder={onOrder}
          onDismiss={onDismiss}
          onDiscuss={onDiscuss}
          depth={depth + 1}
          index={childIndex}
        />
      ))}
    </ArrivalView>
  );
}

function StateBadge({ contact, theme }: { contact: ContactViewModel; theme: GriotTheme }) {
  const color =
    contact.state === "failed"
      ? theme.danger
      : contact.state === "resolved"
        ? theme.evidence
        : contact.escalated
          ? theme.warning
          : theme.textMuted;

  return (
    <Text style={[styles.stateBadge, { color, fontFamily: theme.fontMono }]}>
      {contact.stateLabel}
    </Text>
  );
}

/**
 * The five shapes. Exhaustive by construction — {@link ContactReadout} is a closed union,
 * so a sixth shape is a compile error rather than a blank panel at runtime.
 */
function Readout({
  readout,
  theme,
  tone,
}: {
  readout: ContactReadout;
  theme: GriotTheme;
  tone: string;
}) {
  switch (readout.shape) {
    case "finding":
      return (
        <View style={styles.readout}>
          {readout.detail ? (
            <Text style={[styles.prose, { color: theme.textMuted, fontFamily: theme.fontSans }]}>
              {readout.detail}
            </Text>
          ) : null}
          {readout.cardIds.length > 0 ? (
            <Text style={[styles.trace, { color: theme.textFaint, fontFamily: theme.fontMono }]}>
              {readout.cardIds.length} {readout.cardIds.length === 1 ? "card" : "cards"} involved
            </Text>
          ) : null}
        </View>
      );

    case "manifest":
      return (
        <View style={styles.readout}>
          {readout.groupName ? (
            <Text style={[styles.groupName, { color: tone, fontFamily: theme.fontMono }]}>
              {readout.groupName.toUpperCase()}
            </Text>
          ) : null}
          {readout.entries.map((entry, index) => (
            <View key={`${entry.title}-${index}`} style={styles.entry}>
              <Text style={[styles.entryIndex, { color: tone, fontFamily: theme.fontMono }]}>
                {String(index + 1).padStart(2, "0")}
              </Text>
              <View style={styles.entryBody}>
                <Text style={[styles.entryTitle, { color: theme.text, fontFamily: theme.fontSans }]}>
                  {entry.title}
                </Text>
                {entry.detail ? (
                  <Text
                    style={[styles.entryDetail, { color: theme.textMuted, fontFamily: theme.fontSans }]}
                  >
                    {entry.detail}
                  </Text>
                ) : null}
              </View>
            </View>
          ))}
        </View>
      );

    case "plan":
      return (
        <View style={styles.readout}>
          <Text style={[styles.groupName, { color: tone, fontFamily: theme.fontMono }]}>
            ROUTE → {readout.goal.toUpperCase()}
          </Text>
          {readout.phases.map((phase, index) => (
            <View key={`${phase.title}-${index}`} style={styles.phase}>
              {/* A ladder rather than bullets: phases are ordered, and the connector is
                  what says so without a word. */}
              <View style={styles.phaseGutter}>
                <View style={[styles.phaseDot, { backgroundColor: tone }]} />
                {index < readout.phases.length - 1 ? (
                  <View style={[styles.phaseLine, { backgroundColor: theme.line }]} />
                ) : null}
              </View>
              <Text style={[styles.phaseText, { color: theme.text, fontFamily: theme.fontSans }]}>
                {phase.title}
              </Text>
            </View>
          ))}
        </View>
      );

    case "drill":
      return (
        <View style={styles.readout}>
          <View style={styles.drillRow}>
            <Text style={[styles.drillCount, { color: theme.warning, fontFamily: theme.fontMono }]}>
              {readout.dueCount}
            </Text>
            <View style={styles.entryBody}>
              <Text style={[styles.entryTitle, { color: theme.text, fontFamily: theme.fontSans }]}>
                {readout.dueCount === 1 ? "card is due" : "cards are due"}
              </Text>
              {readout.oldestDueLabel ? (
                <Text style={[styles.entryDetail, { color: theme.textMuted, fontFamily: theme.fontSans }]}>
                  The oldest is {readout.oldestDueLabel}.
                </Text>
              ) : null}
            </View>
          </View>
        </View>
      );

    case "signal":
      return (
        <View style={styles.readout}>
          <Text style={[styles.prose, { color: theme.textMuted, fontFamily: theme.fontSans }]}>
            {readout.text}
          </Text>
        </View>
      );
  }
}

function OrderButton({
  order,
  theme,
  tone,
  onPress,
}: {
  order: OrderViewModel;
  theme: GriotTheme;
  tone: string;
  onPress: () => void;
}) {
  const executed = order.state === "executed";
  const failed = order.state === "failed";
  const executing = order.state === "executing";
  const enabled = order.available;

  const label = executing
    ? "…"
    : executed
      ? `✓ ${order.label}`
      : failed
        ? `↺ ${order.label}`
        : order.label;

  const color = executed
    ? theme.evidence
    : failed
      ? theme.danger
      : enabled
        ? // A tasking order deepens the scope rather than changing the workspace, so it
          // reads as secondary — the captain should be able to tell the two apart before
          // tapping, not after.
          order.tasking
          ? theme.textMuted
          : tone
        : theme.textFaint;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={order.label}
      accessibilityHint={order.note}
      accessibilityState={{ disabled: !enabled }}
      disabled={!enabled}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [
        styles.order,
        {
          borderColor: enabled && !order.tasking ? tone : theme.line,
          backgroundColor: enabled && !order.tasking ? theme.accentSoft : "transparent",
        },
        pressed && styles.pressed,
      ]}
    >
      <Text numberOfLines={1} style={[styles.orderText, { color, fontFamily: theme.fontMono }]}>
        {label.toUpperCase()}
      </Text>
    </Pressable>
  );
}

/**
 * Takes a reading to the roundtable.
 *
 * The bridge is where the captain *sees*; the table is where they *deliberate*. Chat was
 * never the problem — being handed prose you did not ask for was. A conversation you open
 * deliberately, about a specific reading, with a panel of voices you chose, is the one
 * shape of chat that earns its place, so every contact offers it.
 *
 * Deliberately not an {@link OrderViewModel}: it changes neither the workspace nor the
 * scope, and modelling it as an order would put something inert in a row whose whole
 * meaning is "this does something".
 */
function DiscussOrder({ theme, onPress }: { theme: GriotTheme; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Take it to the table"
      accessibilityHint="Opens the roundtable to discuss this reading."
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [
        styles.order,
        { borderColor: theme.line },
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.orderText, { color: theme.textMuted, fontFamily: theme.fontMono }]}>
        TO THE TABLE
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },
  panel: {
    borderRadius: Structure.radiusControl,
    flexDirection: "row",
    overflow: "hidden",
    marginTop: 8,
  },
  rail: { width: Structure.rail, alignSelf: "stretch" },
  body: { flex: 1, paddingHorizontal: 12, paddingVertical: 11, gap: 6 },
  head: { flexDirection: "row", alignItems: "center", gap: 8 },
  headSpacer: { flex: 1 },
  bearing: { fontSize: TypeScale.label, fontWeight: "900", letterSpacing: 1.1 },
  meta: { fontSize: TypeScale.label, fontWeight: "600" },
  stateBadge: { fontSize: TypeScale.label, fontWeight: "900", letterSpacing: 0.9 },
  title: { fontSize: TypeScale.bodyStrong, lineHeight: 24, fontWeight: "700" },
  escalation: { fontSize: TypeScale.label, fontWeight: "900", letterSpacing: 0.8 },
  error: { fontSize: TypeScale.meta, lineHeight: 18 },

  readout: { gap: 6, marginTop: 2 },
  prose: { fontSize: TypeScale.meta, lineHeight: 20 },
  trace: { fontSize: TypeScale.label, fontWeight: "700", letterSpacing: 0.5 },
  groupName: { fontSize: TypeScale.label, fontWeight: "900", letterSpacing: 1.1 },

  entry: { flexDirection: "row", gap: 9, alignItems: "flex-start" },
  entryIndex: { fontSize: TypeScale.label, fontWeight: "900", paddingTop: 2, minWidth: 18 },
  entryBody: { flex: 1, gap: 2 },
  entryTitle: { fontSize: TypeScale.meta, lineHeight: 19, fontWeight: "700" },
  entryDetail: { fontSize: TypeScale.meta, lineHeight: 19 },

  phase: { flexDirection: "row", gap: 9, alignItems: "flex-start" },
  phaseGutter: { width: 10, alignItems: "center", alignSelf: "stretch", paddingTop: 6 },
  phaseDot: { width: 7, height: 7, borderRadius: 4 },
  phaseLine: { width: 2, flex: 1, marginTop: 2 },
  phaseText: { flex: 1, fontSize: TypeScale.meta, lineHeight: 20, paddingBottom: 6 },

  drillRow: { flexDirection: "row", gap: 11, alignItems: "center" },
  drillCount: { fontSize: TypeScale.display, fontWeight: "900", letterSpacing: -1 },

  orders: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  order: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 11,
    minHeight: 34,
    justifyContent: "center",
    maxWidth: "100%",
  },
  orderText: { fontSize: TypeScale.label, fontWeight: "800", letterSpacing: 0.7 },
  outcome: { fontSize: TypeScale.label, lineHeight: 17, marginTop: 2 },
});
