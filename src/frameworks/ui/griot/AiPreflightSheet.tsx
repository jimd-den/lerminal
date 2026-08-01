import React from "react";
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
import { AppState, GriotController } from "../../../adapters/presenters/GriotController";
import { AgentPreflightModel, presentAgentPreflight } from "../../../adapters/presenters/AgentPreflightPresenter";
import { GriotTheme } from "./theme";

/**
 * # AI Preflight Sheet
 *
 * ## Business Value & Purpose
 * The concrete UI for the non-negotiable rule "every AI operation must have explicit
 * scope": before any operation preset runs, this sheet states what will be read (context
 * scope + preview), whether the web is used, what will be created, where it lands, and
 * whether a model is actually configured — using {@link presentAgentPreflight} so the
 * preview and the eventual run request are the same object. The Run button's label is the
 * exact action being taken, never a generic "OK".
 */
export function AiPreflightSheet({
  controller,
  state,
  theme,
}: {
  controller: GriotController;
  state: AppState;
  theme: GriotTheme;
}) {
  const model = state.activePreflightPresetId
    ? presentAgentPreflight(state, state.activePreflightPresetId, state.preflightQuery)
    : null;
  const visible = Boolean(model);

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={() => controller.closePreflight()}
    >
      <View style={styles.backdrop}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.sheetWrap}
        >
          <View
            style={[styles.sheet, { backgroundColor: theme.panelStrong, borderColor: theme.accent }]}
          >
            {model ? (
              <>
                <Text style={[styles.eyebrow, { color: theme.accent, fontFamily: theme.fontMono }]}>
                  AI PREFLIGHT
                </Text>
                <Text style={[styles.title, { color: theme.text }]}>{model.preset.label}</Text>
                <Text style={[styles.purpose, { color: theme.textMuted }]}>{model.preset.purpose}</Text>

                <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
                  <Row theme={theme} label="CONTEXT" value={contextSummary(model)} />
                  {model.contextPreview.length > 0 ? (
                    <View style={styles.previewList}>
                      {model.contextPreview.map((title, i) => (
                        <Text
                          key={i}
                          numberOfLines={1}
                          style={[styles.previewItem, { color: theme.textMuted, fontFamily: theme.fontMono }]}
                        >
                          · {title}
                        </Text>
                      ))}
                      {model.request.contextTruncated ? (
                        <Text style={[styles.previewTruncated, { color: theme.warning, fontFamily: theme.fontMono }]}>
                          showing a bounded subset — some related cards were left out
                        </Text>
                      ) : null}
                    </View>
                  ) : null}

                  <Row
                    theme={theme}
                    label="WEB"
                    value={model.webEnabled ? "ENABLED — will search the live web" : "OFF — will not browse or search"}
                    valueColor={model.webEnabled ? theme.warning : theme.textMuted}
                  />
                  <Row theme={theme} label="OUTPUT" value={model.preset.outputDescription} />
                  <Row theme={theme} label="DESTINATION" value={model.request.destinationLabel} />
                  {model.preset.command === "ask" ? (
                    <Row theme={theme} label="MODEL" value={model.modelLabel} />
                  ) : null}

                  {model.preset.requiresQuery ? (
                    <View style={styles.queryBlock}>
                      <Text style={[styles.queryLabel, { color: theme.textMuted, fontFamily: theme.fontMono }]}>
                        QUERY
                      </Text>
                      <TextInput
                        autoFocus
                        value={state.preflightQuery}
                        onChangeText={(text) => controller.setPreflightQuery(text)}
                        placeholder="What do you want to search for?"
                        placeholderTextColor={theme.textFaint}
                        style={[
                          styles.queryInput,
                          { color: theme.text, borderColor: theme.line, fontFamily: theme.fontMono },
                        ]}
                      />
                      {model.querySuggestions.length > 0 ? (
                        <View style={styles.suggestionRow}>
                          {model.querySuggestions.map((suggestion, i) => (
                            <Pressable
                              key={i}
                              accessibilityRole="button"
                              onPress={() => controller.setPreflightQuery(suggestion)}
                              style={({ pressed }) => [
                                styles.suggestionChip,
                                { borderColor: theme.line, backgroundColor: theme.panelMuted },
                                pressed && { opacity: 0.7 },
                              ]}
                            >
                              <Text
                                numberOfLines={1}
                                style={[styles.suggestionText, { color: theme.textMuted, fontFamily: theme.fontMono }]}
                              >
                                {suggestion}
                              </Text>
                            </Pressable>
                          ))}
                        </View>
                      ) : null}

                      <Pressable
                        accessibilityRole="button"
                        disabled={state.isSuggestingQueries}
                        onPress={() => void controller.suggestSearchQueries(state.preflightQuery || model.preset.purpose)}
                        style={({ pressed }) => [
                          styles.aiSuggestButton,
                          { borderColor: theme.accent },
                          pressed && { opacity: 0.7 },
                        ]}
                      >
                        <Text style={[styles.aiSuggestText, { color: theme.accent, fontFamily: theme.fontMono }]}>
                          {state.isSuggestingQueries ? "ASKING THE MODEL…" : "BREAK THIS DOWN WITH AI →"}
                        </Text>
                      </Pressable>

                      {state.aiQuerySuggestions.length > 0 ? (
                        <View style={styles.suggestionRow}>
                          {state.aiQuerySuggestions.map((suggestion, i) => (
                            <Pressable
                              key={i}
                              accessibilityRole="button"
                              onPress={() => controller.setPreflightQuery(suggestion)}
                              style={({ pressed }) => [
                                styles.suggestionChip,
                                styles.aiSuggestionChip,
                                { borderColor: theme.accent, backgroundColor: theme.accentSoft },
                                pressed && { opacity: 0.7 },
                              ]}
                            >
                              <Text
                                numberOfLines={1}
                                style={[styles.suggestionText, { color: theme.accent, fontFamily: theme.fontMono }]}
                              >
                                {suggestion}
                              </Text>
                            </Pressable>
                          ))}
                        </View>
                      ) : null}
                    </View>
                  ) : null}

                  {model.warning ? (
                    <View
                      accessibilityRole="alert"
                      style={[styles.warning, { borderColor: theme.warning, backgroundColor: `${theme.warning}14` }]}
                    >
                      <Text style={[styles.warningText, { color: theme.warning }]}>{model.warning}</Text>
                    </View>
                  ) : null}

                  {model.blockedReason ? (
                    <View
                      accessibilityRole="alert"
                      style={[styles.warning, { borderColor: theme.danger, backgroundColor: `${theme.danger}14` }]}
                    >
                      <Text style={[styles.warningText, { color: theme.danger }]}>{model.blockedReason}</Text>
                    </View>
                  ) : null}
                </ScrollView>

                <View style={styles.actions}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => controller.closePreflight()}
                    style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}
                  >
                    <Text style={[styles.cancelText, { color: theme.textMuted, fontFamily: theme.fontMono }]}>
                      CANCEL
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    disabled={Boolean(model.blockedReason)}
                    onPress={() => void controller.confirmPreflight()}
                    style={({ pressed }) => [
                      styles.runButton,
                      {
                        backgroundColor: theme.accent,
                        opacity: model.blockedReason ? 0.4 : 1,
                      },
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={[styles.runText, { color: theme.accentInk, fontFamily: theme.fontMono }]}>
                      {model.runLabel}
                    </Text>
                  </Pressable>
                </View>
              </>
            ) : null}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function contextSummary(model: AgentPreflightModel): string {
  if (model.preset.defaultScope === "web") return "None — this reads no cards";
  const n = model.request.contextCardIds.length;
  if (n === 0) return "None selected yet";
  return `${n} card${n === 1 ? "" : "s"} (${model.preset.defaultScope === "selected-only" ? "selection only" : "selection + related context"})`;
}

function Row({
  theme,
  label,
  value,
  valueColor,
}: {
  theme: GriotTheme;
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: theme.textFaint, fontFamily: theme.fontMono }]}>{label}</Text>
      <Text style={[styles.rowValue, { color: valueColor ?? theme.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.7 },
  backdrop: { flex: 1, backgroundColor: "#00000088", justifyContent: "center", padding: 20 },
  sheetWrap: { width: "100%" },
  sheet: { borderRadius: 16, borderWidth: 1, padding: 20, maxHeight: "82%" },
  eyebrow: { fontSize: 12, fontWeight: "900", letterSpacing: 1.6 },
  title: { fontSize: 20, fontWeight: "700", marginTop: 6 },
  purpose: { fontSize: 13, lineHeight: 18, marginTop: 6, marginBottom: 14 },
  body: { maxHeight: 340 },
  row: { marginBottom: 12 },
  rowLabel: { fontSize: 12, fontWeight: "800", letterSpacing: 1.2, marginBottom: 3 },
  rowValue: { fontSize: 14, lineHeight: 19 },
  previewList: { marginTop: -6, marginBottom: 12, paddingLeft: 4 },
  previewItem: { fontSize: 12, lineHeight: 18 },
  previewTruncated: { fontSize: 12, marginTop: 4, fontStyle: "italic" },
  queryBlock: { marginBottom: 12 },
  queryLabel: { fontSize: 12, fontWeight: "800", letterSpacing: 1.2, marginBottom: 6 },
  queryInput: { minHeight: 48, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, fontSize: 14 },
  suggestionRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  suggestionChip: { minHeight: 44, maxWidth: 220, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, justifyContent: "center" },
  aiSuggestionChip: { borderWidth: 1.5 },
  suggestionText: { fontSize: 12, fontWeight: "700" },
  aiSuggestButton: { minHeight: 44, borderWidth: 1, borderRadius: 8, justifyContent: "center", alignItems: "center", marginTop: 10 },
  aiSuggestText: { fontSize: 12, fontWeight: "800", letterSpacing: 0.4 },
  warning: { borderWidth: 1, borderRadius: 10, padding: 12, marginTop: 4, marginBottom: 4 },
  warningText: { fontSize: 12, lineHeight: 17 },
  actions: { flexDirection: "row", gap: 10, marginTop: 16 },
  cancelButton: { minHeight: 48, paddingHorizontal: 16, justifyContent: "center", alignItems: "center" },
  cancelText: { fontSize: 12, fontWeight: "800", letterSpacing: 0.6 },
  runButton: { flex: 1, minHeight: 48, borderRadius: 10, justifyContent: "center", alignItems: "center", paddingHorizontal: 12 },
  runText: { fontSize: 13, fontWeight: "800", textAlign: "center" },
});
