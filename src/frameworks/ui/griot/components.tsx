import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { GriotTheme } from "./theme";

export type CorePlace = "deck" | "library" | "capture" | "more";

export function SystemHeader({
  eyebrow,
  title,
  theme,
  leftAction,
  rightAction,
}: {
  eyebrow: string;
  title: string;
  theme: GriotTheme;
  leftAction?: { label: string; onPress: () => void };
  rightAction?: { label: string; onPress: () => void };
}) {
  return (
    <View style={styles.header}>
      <View style={[styles.headerRail, { backgroundColor: theme.accent }]}>
        <View style={[styles.headerRailCut, { backgroundColor: theme.background }]} />
      </View>
      <View style={styles.headerBody}>
        <View style={styles.headerActions}>
          {leftAction ? <TextButton {...leftAction} theme={theme} /> : <Text style={[styles.systemId, { color: theme.textFaint, fontFamily: theme.fontMono }]}>SYS // 01</Text>}
          {rightAction ? <TextButton {...rightAction} theme={theme} /> : <Text style={[styles.readyText, { color: theme.accent, fontFamily: theme.fontMono }]}>READY</Text>}
        </View>
        <Text style={[styles.eyebrow, { color: theme.accent, fontFamily: theme.fontMono }]}>{eyebrow}</Text>
        <Text numberOfLines={2} style={[styles.title, { color: theme.text, fontFamily: theme.fontMono }]}>{title}</Text>
        <View style={styles.headerBus}>
          <View style={[styles.headerBusLine, { backgroundColor: theme.line }]} />
          <View style={[styles.busBlockWide, { backgroundColor: theme.accent }]} />
          <View style={[styles.busBlock, { backgroundColor: theme.textFaint }]} />
          <View style={[styles.busBlock, { backgroundColor: theme.line }]} />
        </View>
      </View>
    </View>
  );
}

export function TextButton({ label, onPress, theme }: { label: string; onPress: () => void; theme: GriotTheme }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={8} style={({ pressed }) => [styles.textButton, pressed && { opacity: 0.65 }]}>
      <Text style={[styles.textButtonText, { color: theme.accent, fontFamily: theme.fontMono }]}>{label}</Text>
    </Pressable>
  );
}

export function SectionLabel({ children, theme, code }: { children: React.ReactNode; theme: GriotTheme; code?: string }) {
  return (
    <View style={styles.sectionLabelRow}>
      <Text style={[styles.sectionLabel, { color: theme.textMuted, fontFamily: theme.fontMono }]}>{children}</Text>
      {code ? <Text style={[styles.sectionCode, { color: theme.textFaint, fontFamily: theme.fontMono }]}>{code}</Text> : null}
    </View>
  );
}

export function Slab({
  title,
  meta,
  label,
  theme,
  onPress,
  onLongPress,
  selected,
  accent,
}: {
  title: string;
  meta?: string;
  label?: string;
  theme: GriotTheme;
  onPress: () => void;
  onLongPress?: () => void;
  selected?: boolean;
  accent?: string;
}) {
  const rail = accent ?? theme.accent;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      accessibilityHint={onLongPress ? "Double tap to open. Long press to select." : undefined}
      accessibilityActions={onLongPress ? [{ name: "longpress", label: selected ? "Deselect item" : "Select item" }] : undefined}
      onAccessibilityAction={event => {
        if (event.nativeEvent.actionName === "longpress") onLongPress?.();
      }}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={320}
      style={({ pressed }) => [
        styles.slab,
        { backgroundColor: selected ? theme.accentSoft : theme.panelStrong, borderColor: selected ? theme.accent : theme.line },
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.slabRail, { backgroundColor: rail }]} />
      <View style={styles.slabBody}>
        {label ? <Text style={[styles.slabLabel, { color: rail, fontFamily: theme.fontMono }]}>{label}</Text> : null}
        <Text numberOfLines={2} style={[styles.slabTitle, { color: theme.text, fontFamily: theme.fontMono }]}>{title}</Text>
        {meta ? <Text numberOfLines={2} style={[styles.slabMeta, { color: theme.textMuted }]}>{meta}</Text> : null}
      </View>
      <Text style={[styles.chevron, { color: selected ? theme.accent : theme.textFaint, fontFamily: theme.fontMono }]}>{selected ? "[x]" : ">"}</Text>
    </Pressable>
  );
}

export function Chip({ label, active, theme, onPress }: { label: string; active: boolean; theme: GriotTheme; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        { backgroundColor: active ? theme.accent : theme.panel, borderColor: active ? theme.accent : theme.line },
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.chipText, { color: active ? theme.accentInk : theme.textMuted, fontFamily: theme.fontMono }]}>{label}</Text>
    </Pressable>
  );
}

export function BottomNavigation({ place, theme, onChange }: { place: CorePlace; theme: GriotTheme; onChange: (place: CorePlace) => void }) {
  const items: { id: CorePlace; label: string; glyph: string }[] = [
    { id: "deck", label: "Deck", glyph: ">_" },
    { id: "library", label: "Library", glyph: "[]" },
    { id: "capture", label: "Capture", glyph: "+" },
    { id: "more", label: "More", glyph: "::" },
  ];
  return (
    <View style={[styles.bottomNav, { backgroundColor: theme.panelMuted, borderColor: theme.line }]}>
      {items.map(item => {
        const active = item.id === place;
        return (
          <Pressable key={item.id} accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={() => onChange(item.id)} style={({ pressed }) => [styles.navItem, active && { backgroundColor: theme.accentSoft }, pressed && styles.pressed]}>
            <View style={[styles.navGlyphBox, { borderColor: active ? theme.accent : theme.line, backgroundColor: item.id === "capture" ? theme.accentSoft : "transparent" }]}>
              <Text style={[styles.navGlyph, { color: active ? theme.accent : theme.textFaint, fontFamily: theme.fontMono }]}>{item.glyph}</Text>
            </View>
            <Text style={[styles.navLabel, { color: active ? theme.text : theme.textMuted, fontFamily: theme.fontMono }]}>{item.label}</Text>
            {active ? <View style={[styles.navActiveRail, { backgroundColor: theme.accent }]} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.7, transform: [{ scale: 0.99 }] },
  header: { flexDirection: "row", minHeight: 128, paddingHorizontal: 18, paddingTop: 12, paddingBottom: 12 },
  headerRail: { width: 10, borderTopLeftRadius: 5, borderTopRightRadius: 5, borderBottomLeftRadius: 24, borderBottomRightRadius: 3, marginRight: 12, overflow: "hidden" },
  headerRailCut: { position: "absolute", top: 37, right: 0, width: 5, height: 27, borderTopLeftRadius: 5, borderBottomLeftRadius: 5 },
  headerBody: { flex: 1 },
  headerActions: { minHeight: 30, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  systemId: { fontSize: 12, fontWeight: "800", letterSpacing: 1.2 },
  readyText: { fontSize: 12, fontWeight: "900", letterSpacing: 1.4 },
  eyebrow: { fontSize: 12, lineHeight: 15, fontWeight: "900", letterSpacing: 1.6, marginTop: 2 },
  title: { fontSize: 25, lineHeight: 31, fontWeight: "700", letterSpacing: -0.7, marginTop: 1, textTransform: "uppercase" },
  headerBus: { height: 6, flexDirection: "row", alignItems: "center", gap: 4, marginTop: 9 },
  headerBusLine: { height: 1, flex: 1 },
  busBlockWide: { width: 29, height: 5, borderRadius: 2 },
  busBlock: { width: 8, height: 5, borderRadius: 2 },
  textButton: { minHeight: 38, justifyContent: "center" },
  textButtonText: { fontSize: 12, fontWeight: "800", letterSpacing: 1 },
  sectionLabelRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 24, marginBottom: 9 },
  sectionLabel: { fontSize: 12, fontWeight: "800", letterSpacing: 1.6 },
  sectionCode: { fontSize: 12, letterSpacing: 1 },
  slab: { minHeight: 88, borderTopLeftRadius: 5, borderTopRightRadius: 14, borderBottomRightRadius: 14, borderBottomLeftRadius: 14, borderWidth: 1, marginBottom: 9, flexDirection: "row", overflow: "hidden", alignItems: "center" },
  slabRail: { width: 7, alignSelf: "stretch" },
  slabBody: { flex: 1, paddingHorizontal: 14, paddingVertical: 12 },
  slabLabel: { fontSize: 12, lineHeight: 14, fontWeight: "800", letterSpacing: 1.3, marginBottom: 3 },
  slabTitle: { fontSize: 17, lineHeight: 22, fontWeight: "700" },
  slabMeta: { marginTop: 4, fontSize: 13, lineHeight: 18 },
  chevron: { paddingHorizontal: 13, fontSize: 15, fontWeight: "800" },
  chip: { minHeight: 48, borderRadius: 9, borderWidth: 1, justifyContent: "center", paddingHorizontal: 13, marginRight: 8 },
  chipText: { fontSize: 12, fontWeight: "800", letterSpacing: 0.7 },
  bottomNav: { minHeight: 82, borderTopWidth: 1, borderTopLeftRadius: 18, borderTopRightRadius: 18, flexDirection: "row", paddingHorizontal: 8, paddingTop: 6, overflow: "hidden" },
  navItem: { flex: 1, minHeight: 67, borderRadius: 11, justifyContent: "center", alignItems: "center", position: "relative" },
  navGlyphBox: { width: 30, height: 27, borderRadius: 7, borderWidth: 1, alignItems: "center", justifyContent: "center", marginBottom: 2 },
  navGlyph: { fontSize: 13, lineHeight: 17, fontWeight: "900" },
  navLabel: { fontSize: 12, lineHeight: 15, fontWeight: "600" },
  navActiveRail: { position: "absolute", left: 13, right: 13, bottom: 0, height: 4, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
});
