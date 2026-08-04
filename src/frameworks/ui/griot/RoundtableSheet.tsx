import React, { useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { Text, TextInput } from "./Typography";
import { GriotController } from "../../../adapters/presenters/GriotController";
import { GriotTheme } from "./theme";

/**
 * # Roundtable Sheet — describing a panel instead of writing one
 *
 * ## Business Value & Purpose
 * The panel a learner would most want is the one they will never assemble by hand: three
 * or four personas, each with a real point of view, written to disagree with each other.
 * That is an afternoon of prompt writing. This sheet asks for one sentence instead.
 *
 * ## Why the brief is free text
 * "Feynman, a skeptical statistician, and a hard-nosed editor" carries more about the room
 * the user wants than any set of dropdowns would. The architect is told to take names
 * literally and to invent someone specific when given a role, so the sentence is the
 * design — there is nothing here for a form to add.
 *
 * ## What the user gets back
 * Ordinary chat personas, saved to their profile list, grouped by a roundtable. They can
 * edit any of them afterwards, pin one to a different model, or ask one alone — the sheet
 * is a shortcut into the machinery that already exists, never a parallel one.
 */
export function RoundtableSheet({
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
  const [name, setName] = useState("");
  const [brief, setBrief] = useState("");
  const [working, setWorking] = useState(false);

  const create = async () => {
    if (!brief.trim() || working) return;
    setWorking(true);
    const created = await controller.createRoundtable(name, brief);
    setWorking(false);
    // Only a success clears the sheet. A failure keeps every word the user typed, because
    // the usual causes — no key, a model that returned nothing — are worth retrying as-is.
    if (created) {
      setName("");
      setBrief("");
      onClose();
    }
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
          <View
            style={[
              styles.sheet,
              { backgroundColor: theme.panel, borderColor: theme.line },
            ]}
          >
            <View style={styles.head}>
              <Text style={[styles.title, { color: theme.text, fontFamily: theme.fontMono }]}>
                NEW ROUNDTABLE
              </Text>
              <Pressable accessibilityRole="button" onPress={onClose} style={styles.close}>
                <Text style={[styles.closeText, { color: theme.accent, fontFamily: theme.fontMono }]}>
                  CLOSE
                </Text>
              </Pressable>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={[styles.label, { color: theme.textFaint, fontFamily: theme.fontMono }]}>
                NAME · OPTIONAL
              </Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="The skeptics"
                placeholderTextColor={theme.textFaint}
                accessibilityLabel="Roundtable name"
                style={[styles.input, { color: theme.text, borderColor: theme.line }]}
              />

              <Text style={[styles.label, { color: theme.textFaint, fontFamily: theme.fontMono }]}>
                WHO IS AT THE TABLE
              </Text>
              <TextInput
                value={brief}
                onChangeText={setBrief}
                multiline
                placeholder="Feynman, a skeptical statistician, and a hard-nosed editor who hates jargon"
                placeholderTextColor={theme.textFaint}
                accessibilityLabel="Describe the characters"
                style={[styles.brief, { color: theme.text, borderColor: theme.line }]}
              />
              <Text style={[styles.hint, { color: theme.textMuted }]}>
                Name real people, invent roles, or mix both. Each one becomes a persona you
                can also edit or ask on its own.
              </Text>
            </ScrollView>

            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !brief.trim() || working, busy: working }}
              disabled={!brief.trim() || working}
              onPress={() => void create()}
              style={[
                styles.action,
                {
                  backgroundColor: brief.trim() && !working ? theme.accent : theme.panelMuted,
                },
              ]}
            >
              {working ? (
                <ActivityIndicator size="small" color={theme.textMuted} />
              ) : (
                <Text
                  style={[
                    styles.actionText,
                    {
                      color: brief.trim() ? theme.accentInk : theme.textMuted,
                      fontFamily: theme.fontMono,
                    },
                  ]}
                >
                  SEAT THE TABLE
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
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    padding: 16,
    maxHeight: "88%",
  },
  head: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  title: { flex: 1, fontSize: 14, fontWeight: "900", letterSpacing: 1.2 },
  close: { minHeight: 44, justifyContent: "center", paddingHorizontal: 8 },
  closeText: { fontSize: 12, fontWeight: "900", letterSpacing: 1.2 },
  label: { fontSize: 11, fontWeight: "900", letterSpacing: 1.2, marginTop: 12, marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 7, padding: 12, fontSize: 15, minHeight: 48 },
  brief: {
    borderWidth: 1,
    borderRadius: 7,
    padding: 12,
    fontSize: 15,
    minHeight: 108,
    textAlignVertical: "top",
  },
  hint: { fontSize: 12, lineHeight: 18, marginTop: 8 },
  action: {
    minHeight: 52,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16,
  },
  actionText: { fontSize: 13, fontWeight: "900", letterSpacing: 1.4 },
});
