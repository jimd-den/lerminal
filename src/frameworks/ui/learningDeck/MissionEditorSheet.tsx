import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { AppState, LearnimalController } from "../../../adapters/presenters/LearnimalController";
import { LearningTheme } from "./theme";

/**
 * # Mission Editor Sheet
 *
 * ## Business Value & Purpose
 * Lets a learner define (or edit) the goal a workspace is organized around — the
 * `WorkspaceMission` the Mission Control module and Gap Report both read. Kept to exactly
 * the fields the domain model carries (goal, description, success criteria, target
 * deliverable); saving is the only way this sheet touches persistence, via
 * `LearnimalController.saveMission`.
 */
export function MissionEditorSheet({
  controller,
  state,
  theme,
}: {
  controller: LearnimalController;
  state: AppState;
  theme: LearningTheme;
}) {
  const [criterionDraft, setCriterionDraft] = useState("");
  const draft = state.missionDraft;

  return (
    <Modal
      visible={state.isMissionEditorOpen}
      animationType="slide"
      onRequestClose={() => controller.closeMissionEditor()}
    >
      <KeyboardAvoidingView
        style={[styles.root, { backgroundColor: theme.background }]}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={[styles.header, { borderBottomColor: theme.line }]}>
          <Text style={[styles.eyebrow, { color: theme.accent, fontFamily: theme.fontMono }]}>MISSION</Text>
          <Pressable onPress={() => controller.closeMissionEditor()} style={styles.close}>
            <Text style={[styles.closeText, { color: theme.accent, fontFamily: theme.fontMono }]}>CLOSE</Text>
          </Pressable>
        </View>

        <ScrollView style={styles.body} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Field label="GOAL" theme={theme}>
            <TextInput
              value={draft.goalTitle}
              onChangeText={(text) => controller.updateMissionDraft({ goalTitle: text })}
              placeholder="What are you trying to achieve?"
              placeholderTextColor={theme.textFaint}
              style={[styles.input, { color: theme.text, borderColor: theme.line }]}
            />
          </Field>

          <Field label="WHY (OPTIONAL)" theme={theme}>
            <TextInput
              multiline
              value={draft.goalDescription}
              onChangeText={(text) => controller.updateMissionDraft({ goalDescription: text })}
              placeholder="Why this goal matters"
              placeholderTextColor={theme.textFaint}
              style={[styles.textarea, { color: theme.text, borderColor: theme.line }]}
            />
          </Field>

          <Field label="TARGET DELIVERABLE (OPTIONAL)" theme={theme}>
            <TextInput
              value={draft.targetDeliverable}
              onChangeText={(text) => controller.updateMissionDraft({ targetDeliverable: text })}
              placeholder="What does 'done' produce?"
              placeholderTextColor={theme.textFaint}
              style={[styles.input, { color: theme.text, borderColor: theme.line }]}
            />
          </Field>

          <Field label="SUCCESS CRITERIA" theme={theme}>
            {draft.successCriteria.map((criterion, index) => (
              <View key={index} style={[styles.criterionRow, { borderColor: theme.line }]}>
                <Text style={[styles.criterionText, { color: theme.text }]} numberOfLines={2}>
                  {criterion}
                </Text>
                <Pressable onPress={() => controller.removeMissionCriterion(index)} hitSlop={8}>
                  <Text style={[styles.removeText, { color: theme.danger, fontFamily: theme.fontMono }]}>×</Text>
                </Pressable>
              </View>
            ))}
            <View style={styles.addRow}>
              <TextInput
                value={criterionDraft}
                onChangeText={setCriterionDraft}
                placeholder="Add a success criterion"
                placeholderTextColor={theme.textFaint}
                style={[styles.input, styles.addInput, { color: theme.text, borderColor: theme.line }]}
                onSubmitEditing={() => {
                  controller.addMissionCriterion(criterionDraft);
                  setCriterionDraft("");
                }}
              />
              <Pressable
                onPress={() => {
                  controller.addMissionCriterion(criterionDraft);
                  setCriterionDraft("");
                }}
                style={[styles.addButton, { backgroundColor: theme.accentSoft, borderColor: theme.accent }]}
              >
                <Text style={[styles.addButtonText, { color: theme.accent, fontFamily: theme.fontMono }]}>ADD</Text>
              </Pressable>
            </View>
          </Field>
        </ScrollView>

        <View style={[styles.footer, { borderTopColor: theme.line }]}>
          <Pressable
            disabled={!draft.goalTitle.trim()}
            onPress={() => void controller.saveMission()}
            style={({ pressed }) => [
              styles.saveButton,
              { backgroundColor: theme.accent, opacity: draft.goalTitle.trim() ? 1 : 0.4 },
              pressed && { opacity: 0.7 },
            ]}
          >
            <Text style={[styles.saveButtonText, { color: theme.accentInk, fontFamily: theme.fontMono }]}>
              SAVE MISSION
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Field({ label, theme, children }: { label: string; theme: LearningTheme; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: theme.textMuted, fontFamily: theme.fontMono }]}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 56, paddingHorizontal: 18, borderBottomWidth: 1 },
  eyebrow: { fontSize: 12, fontWeight: "900", letterSpacing: 1.4 },
  close: { minHeight: 44, justifyContent: "center" },
  closeText: { fontSize: 12, fontWeight: "800" },
  body: { flex: 1 },
  content: { padding: 18 },
  field: { marginBottom: 20 },
  fieldLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 1, marginBottom: 8 },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, fontSize: 15 },
  textarea: { minHeight: 80, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingTop: 12, fontSize: 14, textAlignVertical: "top" },
  criterionRow: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 8, padding: 10, marginBottom: 8, gap: 8 },
  criterionText: { flex: 1, fontSize: 13, lineHeight: 18 },
  removeText: { fontSize: 18, fontWeight: "900", minWidth: 30, textAlign: "center" },
  addRow: { flexDirection: "row", gap: 8 },
  addInput: { flex: 1 },
  addButton: { minHeight: 48, paddingHorizontal: 16, borderRadius: 10, borderWidth: 1, justifyContent: "center", alignItems: "center" },
  addButtonText: { fontSize: 12, fontWeight: "800" },
  footer: { padding: 16, borderTopWidth: 1 },
  saveButton: { minHeight: 50, borderRadius: 10, justifyContent: "center", alignItems: "center" },
  saveButtonText: { fontSize: 14, fontWeight: "800" },
});
