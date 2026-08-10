import React, { useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { Text, TextInput } from "../Typography";
import { GriotController } from "../../../../adapters/presenters/GriotController";
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

  const convene = async () => {
    if (!topic.trim() || working) return;
    setWorking(true);
    await controller.conveneThinkTank(topic);
    setWorking(false);
    // A failure is reported as a toast by `createRoundtable` underneath; the sheet keeps
    // whatever was typed either way, since "try again" needs it and "it worked" already
    // closed the sheet by the time this line matters.
    setTopic("");
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <View style={[styles.backdrop, { backgroundColor: `${theme.background}E6` }]}>
        <KeyboardAvoidingView behavior="padding" automaticOffset style={styles.avoider}>
          <View style={[styles.sheet, { backgroundColor: theme.panel, borderColor: theme.line }]}>
            <View style={styles.head}>
              <Text style={[styles.title, { color: theme.text, fontFamily: theme.fontMono }]}>
                CONVENE A THINK TANK
              </Text>
              <Pressable accessibilityRole="button" onPress={onClose} style={styles.close}>
                <Text style={[styles.closeText, { color: theme.accent, fontFamily: theme.fontMono }]}>
                  CLOSE
                </Text>
              </Pressable>
            </View>

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

            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !topic.trim() || working, busy: working }}
              disabled={!topic.trim() || working}
              onPress={() => void convene()}
              style={[
                styles.action,
                { backgroundColor: topic.trim() && !working ? theme.accent : theme.panelMuted },
              ]}
            >
              {working ? (
                <ActivityIndicator size="small" color={theme.textMuted} />
              ) : (
                <Text
                  style={[
                    styles.actionText,
                    { color: topic.trim() ? theme.accentInk : theme.textMuted, fontFamily: theme.fontMono },
                  ]}
                >
                  CONVENE
                </Text>
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end" },
  avoider: { justifyContent: "flex-end" },
  sheet: {
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderTopLeftRadius: Structure.radius,
    borderTopRightRadius: Structure.radius,
    padding: Structure.gutter,
    maxHeight: "82%",
  },
  head: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  title: { flex: 1, fontSize: TypeScale.meta, fontWeight: "900", letterSpacing: 1.2 },
  close: { minHeight: Structure.tap, justifyContent: "center", paddingHorizontal: 8 },
  closeText: { fontSize: TypeScale.label, fontWeight: "900", letterSpacing: 1.2 },
  label: { fontSize: TypeScale.label, fontWeight: "900", letterSpacing: 1.2, marginTop: 8, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderRadius: Structure.radiusControl,
    padding: 12,
    fontSize: TypeScale.body,
    minHeight: 108,
    textAlignVertical: "top",
  },
  hint: { fontSize: TypeScale.meta, lineHeight: 19, marginTop: 8 },
  action: {
    minHeight: Structure.tapLarge,
    borderRadius: Structure.radiusControl,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16,
  },
  actionText: { fontSize: TypeScale.bodyStrong, fontWeight: "900", letterSpacing: 1.4 },
});
