import React, { useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { Text, TextInput } from "../Typography";
import { GriotController } from "../../../../adapters/presenters/GriotController";
import { ModalSurface } from "../ModalSurface";
import { GriotTheme, Structure, TypeScale } from "../theme";

/**
 * # Think Tank Sheet — one prompt, a table already talking
 *
 * ## Business Value & Purpose
 * The Bridge's front door onto the table. `RoundtableSheet` asks *who* should be at the
 * table — a cast description — because it is reached from inside a conversation where
 * that is exactly what is missing. This is reached from the Bridge, where there is no
 * conversation yet, and asking the captain to first describe characters before they can
 * even see whether the idea is worth discussing is one step too many.
 *
 * So this sheet asks for a *topic* instead, and hands it straight to
 * {@link GriotController.conveneThinkTank} — the same `roundtable-architect` used
 * everywhere else, whose own output contract already covers a topic with no named cast
 * ("infer a panel that genuinely serves the subject they described"). One field, one
 * button: describe what the table should think about, and it starts thinking.
 *
 * ## Full-page, not a bottom sheet — and why that is the fix, not a preference
 * This used to float as a transparent bottom sheet capped at 82% height. Add a keyboard
 * on top of two toggle rows and a multiline field, and the one button that actually does
 * anything could end up pushed below the visible 82% — reachable only by first dismissing
 * the keyboard, which is not an obvious move and is exactly the "the button is hidden"
 * failure. `ModalSurface` + a **pinned footer outside the scrollable body** is the same
 * fix `CommissionSheet` already uses for the identical shape of problem: the header and
 * the CONVENE button never scroll, `KeyboardAvoidingView` (the `react-native-keyboard-
 * controller` build, not React Native's own — see `ConversationSheet`'s note on why that
 * distinction matters on Android's edge-to-edge window model) only ever moves the *body*,
 * and the button rides above the keyboard rather than under it. This is the general
 * pattern for a full-screen modal in this app, not a one-off.
 */
export function ThinkTankSheet({
  visible,
  controller,
  theme,
  onClose,
}: {
  visible: boolean;
  controller: GriotController;
  theme: GriotTheme;
  onClose: () => void;
}) {
  const [topic, setTopic] = useState("");
  const [working, setWorking] = useState(false);
  const [includeSkeptic, setIncludeSkeptic] = useState(false);
  const [fast, setFast] = useState(false);

  const convene = async () => {
    if (!topic.trim() || working) return;
    setWorking(true);
    await controller.conveneThinkTank(topic, { includeSkeptic, reasoning: !fast });
    setWorking(false);
    // A failure is reported as a toast by `createRoundtable` underneath; the sheet keeps
    // whatever was typed either way, since "try again" needs it and "it worked" already
    // closed the sheet by the time this line matters.
    setTopic("");
    onClose();
  };

  const canConvene = topic.trim().length > 0 && !working;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      {/* Bottom inset is left to the keyboard avoider, which already accounts for it —
          same split `CommissionSheet` uses. */}
      <ModalSurface theme={theme} edges={["top", "left", "right"]}>
        <KeyboardAvoidingView style={styles.root} behavior="padding">
          <View style={[styles.header, { borderBottomColor: theme.line }]}>
            <Text style={[styles.eyebrow, { color: theme.accent, fontFamily: theme.fontMono }]}>
              CONVENE A THINK TANK
            </Text>
            <Pressable accessibilityRole="button" onPress={onClose} style={styles.close}>
              <Text style={[styles.closeText, { color: theme.accent, fontFamily: theme.fontMono }]}>
                CLOSE
              </Text>
            </Pressable>
          </View>

          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={[styles.label, { color: theme.textFaint, fontFamily: theme.fontMono }]}>
              WHAT SHOULD THE TABLE THINK ABOUT
            </Text>
            <TextInput
              value={topic}
              onChangeText={setTopic}
              multiline
              autoFocus
              placeholder="A random topic, a claim you're not sure about, anything"
              placeholderTextColor={theme.textFaint}
              accessibilityLabel="Topic for the think tank"
              style={[styles.input, { color: theme.text, borderColor: theme.line }]}
            />
            <Text style={[styles.hint, { color: theme.textMuted }]}>
              A panel suited to it is assembled on the spot — you never have to describe
              who should be there. Once it's talking, tap any line it says to push back on
              it, or ask what to research next.
            </Text>

            <ToggleRow
              theme={theme}
              checked={includeSkeptic}
              onToggle={() => setIncludeSkeptic(v => !v)}
              label="SEAT THE SKEPTIC"
              hint="Guarantees a voice pushing back — not left to chance."
              accessibilityLabel="Seat the Skeptic"
              accessibilityHint="Guarantees a voice whose only job is to push back, rather than trusting the panel to invent one."
            />
            <ToggleRow
              theme={theme}
              checked={fast}
              onToggle={() => setFast(v => !v)}
              label="FAST — SKIP REASONING"
              hint="Faster, cheaper replies. Switch it back on for this table any time from the board."
              accessibilityLabel="Skip extended reasoning"
              accessibilityHint="Answers arrive faster and cost less, without the model's own deliberation step."
            />
          </ScrollView>

          {/* Outside the ScrollView, inside the keyboard avoider: this is what keeps the
              one button that matters on screen no matter how tall the form above it gets,
              and no matter what the keyboard is doing. Never hidden — see the class doc. */}
          <View style={[styles.footer, { borderTopColor: theme.line }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !canConvene, busy: working }}
              disabled={!canConvene}
              onPress={() => void convene()}
              style={[
                styles.action,
                { backgroundColor: canConvene ? theme.accent : theme.panelMuted },
              ]}
            >
              {working ? (
                <ActivityIndicator size="small" color={theme.textMuted} />
              ) : (
                <Text
                  style={[
                    styles.actionText,
                    { color: canConvene ? theme.accentInk : theme.textMuted, fontFamily: theme.fontMono },
                  ]}
                >
                  CONVENE
                </Text>
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </ModalSurface>
    </Modal>
  );
}

/**
 * One checkbox-style option row. Extracted once a second toggle (fast mode, alongside the
 * Skeptic) needed the exact same shape — a single implementation is what stops the two
 * from drifting apart in how they look or behave.
 */
function ToggleRow({
  theme,
  checked,
  onToggle,
  label,
  hint,
  accessibilityLabel,
  accessibilityHint,
}: {
  theme: GriotTheme;
  checked: boolean;
  onToggle: () => void;
  label: string;
  hint: string;
  accessibilityLabel: string;
  accessibilityHint: string;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ checked }}
      onPress={onToggle}
      style={[styles.toggleRow, { borderColor: checked ? theme.accent : theme.line }]}
    >
      <View
        style={[
          styles.checkbox,
          {
            borderColor: checked ? theme.accent : theme.textFaint,
            backgroundColor: checked ? theme.accentSoft : "transparent",
          },
        ]}
      >
        {checked ? <Text style={[styles.checkboxMark, { color: theme.accent }]}>✓</Text> : null}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.toggleLabel, { color: theme.text, fontFamily: theme.fontMono }]}>
          {label}
        </Text>
        <Text style={[styles.toggleHint, { color: theme.textMuted }]}>{hint}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 56,
    paddingHorizontal: 18,
    borderBottomWidth: 1,
  },
  eyebrow: { fontSize: TypeScale.label, fontWeight: "900", letterSpacing: 1.4 },
  close: { minHeight: Structure.tap, justifyContent: "center" },
  closeText: { fontSize: TypeScale.label, fontWeight: "800" },
  body: { flex: 1 },
  content: { padding: 18 },
  label: { fontSize: TypeScale.label, fontWeight: "900", letterSpacing: 1.2, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderRadius: Structure.radiusControl,
    padding: 12,
    fontSize: TypeScale.body,
    minHeight: 108,
    textAlignVertical: "top",
  },
  hint: { fontSize: TypeScale.meta, lineHeight: 19, marginTop: 8 },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: Structure.tap,
    borderWidth: 1,
    borderRadius: Structure.radiusControl,
    paddingHorizontal: 12,
    marginTop: 10,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxMark: { fontSize: 14, fontWeight: "900" },
  toggleLabel: { fontSize: TypeScale.label, fontWeight: "900", letterSpacing: 0.8 },
  toggleHint: { fontSize: TypeScale.label, lineHeight: 16, marginTop: 2 },
  footer: { padding: 16, borderTopWidth: 1 },
  action: {
    minHeight: Structure.tapLarge,
    borderRadius: Structure.radiusControl,
    alignItems: "center",
    justifyContent: "center",
  },
  actionText: { fontSize: TypeScale.bodyStrong, fontWeight: "900", letterSpacing: 1.4 },
});
