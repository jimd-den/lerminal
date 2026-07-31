import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Card } from "../../../entities/card";
import { presentRole } from "../../../adapters/presenters/MissionCanvasPresenter";
import { LearningTheme, Structure, TypeScale } from "./theme";
import { toneColor } from "./MissionCanvas";

/**
 * # Context Cards
 *
 * ## Business Value & Purpose
 * The mission canvas's card list: each card wearing its semantic role as a structured
 * label and a coloured rail, so `EXPERIMENT`, `BLOCKER`, and `SOURCE` are distinguishable
 * at a glance without reading the title.
 *
 * ## Labels first, colour second
 * The role is spelled out in text. The rail is a secondary cue that reinforces it, never
 * the sole carrier of meaning — colour alone excludes anyone who can't distinguish the
 * hues, and the spec's instruction is to distinguish roles "through semantic labels, not
 * decorative colour overload". Every rail colour resolves through a semantic tone, so a
 * custom accent cannot repaint a blocker as an ordinary card.
 */
export function ContextCardRow({
  card,
  theme,
  selected,
  onPress,
  onLongPress,
}: {
  card: Card;
  theme: LearningTheme;
  selected: boolean;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const role = presentRole(card.role);
  const railColor = role ? toneColor(role.tone, theme) : theme.line;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={role ? `${role.label}: ${card.title}` : card.title}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: selected ? theme.accentSoft : theme.panel,
          borderColor: selected ? theme.accent : theme.line,
        },
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.rail, { backgroundColor: railColor }]} />
      <View style={styles.copy}>
        {role ? (
          <Text style={[styles.roleLabel, { color: railColor, fontFamily: theme.fontMono }]}>
            {role.label}
          </Text>
        ) : null}
        <Text
          numberOfLines={2}
          style={[styles.title, { color: theme.text, fontFamily: theme.fontSans }]}
        >
          {card.title}
        </Text>
        {card.body ? (
          <Text numberOfLines={2} style={[styles.body, { color: theme.textMuted }]}>
            {card.body}
          </Text>
        ) : null}
        {/* Provenance is stated, never implied: a web-derived card says so on its face. */}
        {card.provenance?.mode === "search" || card.provenance?.mode === "extraction" ? (
          <Text style={[styles.provenance, { color: theme.evidence, fontFamily: theme.fontMono }]}>
            WEB EVIDENCE
          </Text>
        ) : card.provenance?.isLocalFallback ? (
          <Text style={[styles.provenance, { color: theme.warning, fontFamily: theme.fontMono }]}>
            NO MODEL ANSWERED — LOCAL TEMPLATE
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.75 },
  row: {
    flexDirection: "row",
    borderWidth: 1,
    borderRadius: Structure.radiusControl,
    overflow: "hidden",
    minHeight: Structure.tapLarge,
    marginBottom: 8,
  },
  rail: { width: 3 },
  copy: { flex: 1, padding: 13, gap: 3 },
  roleLabel: { fontSize: TypeScale.label, fontWeight: "900", letterSpacing: 1.2 },
  title: { fontSize: TypeScale.body, fontWeight: "700", lineHeight: 21 },
  body: { fontSize: TypeScale.meta, lineHeight: 18 },
  provenance: { fontSize: TypeScale.label, fontWeight: "800", letterSpacing: 0.9, marginTop: 2 },
});
