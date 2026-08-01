import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { GriotTheme } from "./theme";

/**
 * Capture used to be a fourth member of this union; it is now a floating modal (see
 * `CaptureAffordance` below), for the same reason the assistant is not a fifth one — a
 * modal is scoped to whatever screen it was opened from, and routing to it would mean
 * leaving that scope behind.
 */
export type CorePlace = "deck" | "library" | "more";

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
      <Text style={[styles.sectionLabel, { color: theme.accent, fontFamily: theme.fontMono }]}>{children}</Text>
      {code ? <Text style={[styles.sectionCode, { color: theme.textFaint, fontFamily: theme.fontMono }]}>{code}</Text> : null}
    </View>
  );
}

/**
 * # Collapsible Section
 *
 * ## Business Value & Purpose
 * A settings screen with nine sections each fully expanded is a long scroll past mostly
 * irrelevant controls to reach the one you actually want. Pressing a section's heading to
 * expand it means the screen's default state is a table of contents, not a wall — you see
 * every section's name at a glance and open only the one you came for.
 *
 * A plain expand/collapse rather than an animated height: RN's layout animation for
 * variable-height content is expensive and finicky across platforms, and the content
 * appearing is itself the feedback that something happened — no motion needed to convey it.
 */
export function CollapsibleSection({
  title,
  code,
  theme,
  defaultOpen = false,
  children,
}: {
  title: string;
  code?: string;
  theme: GriotTheme;
  /** Only the first section a user is likely to touch should start open. */
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <View style={styles.collapsible}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(o => !o)}
        style={({ pressed }) => [styles.collapsibleHead, pressed && styles.pressed]}
      >
        <Text style={[styles.sectionLabel, { color: theme.textMuted, fontFamily: theme.fontMono }]}>
          {title}
        </Text>
        <View style={styles.collapsibleHeadRight}>
          {code ? (
            <Text style={[styles.sectionCode, { color: theme.textFaint, fontFamily: theme.fontMono }]}>
              {code}
            </Text>
          ) : null}
          <Text style={[styles.collapsibleChevron, { color: theme.textFaint, fontFamily: theme.fontMono }]}>
            {open ? "▾" : "▸"}
          </Text>
        </View>
      </Pressable>
      {open ? <View style={styles.collapsibleBody}>{children}</View> : null}
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
        { backgroundColor: selected ? theme.accentSoft : theme.panel, borderColor: selected ? theme.accent : theme.line },
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.slabRailTrack}>
        <View style={[styles.slabRail, { backgroundColor: rail }]} />
      </View>
      <View style={styles.slabBody}>
        {label ? <Text style={[styles.slabLabel, { color: rail, fontFamily: theme.fontMono }]}>{label}</Text> : null}
        <Text numberOfLines={1} style={[styles.slabTitle, { color: theme.text, fontFamily: theme.fontSans }]}>{title}</Text>
        {meta ? <Text numberOfLines={2} style={[styles.slabMeta, { color: theme.textMuted }]}>{meta}</Text> : null}
      </View>
      {selected ? (
        <Text style={[styles.chevron, { color: theme.accent, fontFamily: theme.fontMono }]}>✓</Text>
      ) : null}
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
        { backgroundColor: active ? theme.accentSoft : theme.panel, borderColor: active ? theme.accent : theme.line },
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.chipText, { color: active ? theme.accent : theme.textMuted, fontFamily: theme.fontMono }]}>{label}</Text>
    </Pressable>
  );
}

/**
 * # Ask affordance — the always-there way to reach the assistant
 *
 * ## Business Value & Purpose
 * The assistant used to be reachable only from the Workspace Pulse (which appears only
 * when there is something to observe), from Settings, and from two "define mission"
 * buttons — so on an ordinary home screen there was no way to ask it anything. This is
 * that way: one persistent control, on every primary screen.
 *
 * Deliberately *not* a fifth `CorePlace` tab. `CorePlace` is a routing union — a place
 * you navigate to and stay in — and the conversation is a modal sheet layered over
 * whatever you were doing, which it must be, because its whole value is that it is scoped
 * to the screen you are looking at. Routing to it would mean leaving that scope behind.
 *
 * Positioned by its parent (see `MainLayout`) relative to the *bottom cluster* as a
 * whole, not to any nav item: it floats above whatever that cluster currently is — the
 * pulse, the activity banner, or the bar itself — so nothing about it depends on how many
 * tabs the bar has.
 */
export function AskAffordance({
  theme,
  onPress,
  reducedMotion,
}: {
  theme: GriotTheme;
  onPress: () => void;
  /** When true the press feedback is opacity only — no scale. */
  reducedMotion?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Ask GRIOT"
      accessibilityHint="Opens the assistant for what you are looking at."
      onPress={onPress}
      style={({ pressed }) => [
        styles.ask,
        { backgroundColor: theme.accent, borderColor: theme.line },
        pressed && (reducedMotion ? { opacity: 0.7 } : styles.pressed),
      ]}
    >
      <Text style={[styles.askText, { color: theme.accentInk, fontFamily: theme.fontMono }]}>
        ASK
      </Text>
    </Pressable>
  );
}

export function BottomNavigation({ place, theme, onChange }: { place: CorePlace; theme: GriotTheme; onChange: (place: CorePlace) => void }) {
  const items: { id: CorePlace; label: string; glyph: string }[] = [
    { id: "deck", label: "Deck", glyph: ">_" },
    { id: "library", label: "Library", glyph: "[]" },
    { id: "more", label: "More", glyph: "::" },
  ];
  return (
    <View style={[styles.bottomNav, { backgroundColor: theme.panelMuted, borderColor: theme.line }]}>
      {items.map(item => {
        const active = item.id === place;
        return (
          <Pressable key={item.id} accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={() => onChange(item.id)} style={({ pressed }) => [styles.navItem, active && { backgroundColor: theme.accentSoft }, pressed && styles.pressed]}>
            <View style={[styles.navGlyphBox, { borderColor: active ? theme.accent : theme.line }]}>
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

/**
 * # Capture affordance — the "+" that used to live in the nav bar
 *
 * ## Business Value & Purpose
 * Capture moved off the bottom nav because it isn't a place you navigate to and stay
 * in — it is a single, disposable action (write this down) that returns you to wherever
 * you were. That is the same shape as `AskAffordance`, so it gets the same treatment:
 * a floating button, not a tab, stacked with Ask above the nav rather than competing
 * with it for one of a shrinking set of slots.
 *
 * Sized and gated exactly like `AskAffordance` — 52pt circle, theme tokens only, opacity
 * only under reduced motion — and hidden by the same parent-owned logic in `MainLayout`
 * (its own sheet, another modal, or an active selection), so the two floating controls
 * always appear and disappear together.
 */
export function CaptureAffordance({
  theme,
  onPress,
  reducedMotion,
}: {
  theme: GriotTheme;
  onPress: () => void;
  /** When true the press feedback is opacity only — no scale. */
  reducedMotion?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Capture"
      accessibilityHint="Opens a place to write down a note, question, or source."
      onPress={onPress}
      style={({ pressed }) => [
        styles.ask,
        { backgroundColor: theme.panel, borderColor: theme.accent },
        pressed && (reducedMotion ? { opacity: 0.7 } : styles.pressed),
      ]}
    >
      <Text style={[styles.askText, { color: theme.accent, fontFamily: theme.fontMono }]}>
        +
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.7, transform: [{ scale: 0.99 }] },
  textButton: { minHeight: 38, justifyContent: "center" },
  textButtonText: { fontSize: 12, fontWeight: "800", letterSpacing: 1 },
  sectionLabelRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 24, marginBottom: 9 },
  collapsible: { marginTop: 24 },
  collapsibleHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    minHeight: 44,
  },
  collapsibleHeadRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  collapsibleChevron: { fontSize: 14, fontWeight: "900" },
  collapsibleBody: { marginTop: 9 },
  sectionLabel: { fontSize: 12, fontWeight: "800", letterSpacing: 1.6 },
  sectionCode: { fontSize: 12, letterSpacing: 1 },
  slab: {
    minHeight: 64,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 12,
  },
  // A short, inset rail rather than a full-height bar — the mockup's `.card:before`
  // (top:11, bottom:11), not an LCARS-style edge-to-edge spine.
  slabRailTrack: { width: 13, alignSelf: "stretch", justifyContent: "center", alignItems: "center" },
  slabRail: { width: 3, borderRadius: 2, alignSelf: "stretch", marginVertical: 11 },
  slabBody: { flex: 1, paddingVertical: 12, paddingRight: 4, gap: 2 },
  slabLabel: { fontSize: 10, lineHeight: 13, fontWeight: "800", letterSpacing: 1.1 },
  slabTitle: { fontSize: 14, lineHeight: 19, fontWeight: "700", letterSpacing: -0.2 },
  slabMeta: { fontSize: 11, lineHeight: 16 },
  chevron: { paddingHorizontal: 12, fontSize: 15, fontWeight: "900" },
  chip: {
    minHeight: 40,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    paddingHorizontal: 12,
    marginRight: 8,
  },
  chipText: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
  // 52 square clears the 44pt floor with room for the label; the parent decides where
  // it sits, so nothing here encodes the nav's height or item count.
  ask: {
    minWidth: 52,
    minHeight: 52,
    borderRadius: 26,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  askText: { fontSize: 13, fontWeight: "900", letterSpacing: 1.2 },
  bottomNav: { minHeight: 82, borderTopWidth: 1, borderTopLeftRadius: 18, borderTopRightRadius: 18, flexDirection: "row", paddingHorizontal: 8, paddingTop: 6, overflow: "hidden" },
  navItem: { flex: 1, minHeight: 67, borderRadius: 11, justifyContent: "center", alignItems: "center", position: "relative" },
  navGlyphBox: { width: 30, height: 27, borderRadius: 7, borderWidth: 1, alignItems: "center", justifyContent: "center", marginBottom: 2 },
  navGlyph: { fontSize: 13, lineHeight: 17, fontWeight: "900" },
  navLabel: { fontSize: 12, lineHeight: 15, fontWeight: "600" },
  navActiveRail: { position: "absolute", left: 13, right: 13, bottom: 0, height: 4, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
});
