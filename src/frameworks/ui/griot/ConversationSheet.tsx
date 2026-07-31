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
import {
  AppState,
  GriotController,
} from "../../../adapters/presenters/GriotController";
import { GriotTheme, Structure, TypeScale } from "./theme";
import { modalAnimation, useReducedMotion } from "../useReducedMotion";

/**
 * # Conversation Sheet ("Ask GRIOT")
 *
 * ## Business Value & Purpose
 * The workspace-scoped conversational surface: header, context chips (which workspace,
 * which group, how many cards selected), the transcript so far, a composer, and any tool
 * actions the model proposed. Proposals render as inspectable cards (label + explanation
 * + a plain-language tool summary); the "Confirm" button calls
 * `confirmWorkspaceAgentAction`, which dispatches the proposal to its real interactor
 * (Phase D) and reflects the outcome — "WORKING…" while in flight, then "DONE"/"FAILED"
 * with a truthful result message. Nothing is ever dispatched merely by being proposed or
 * displayed — only an explicit confirm triggers it. When no model is configured, or its
 * reply fails validation, `state.workspaceAgent.agentError` is shown as-is rather than a
 * fabricated reply — that honesty is enforced upstream in `WorkspaceAgentWorkflow`; this
 * component only renders what it's given.
 */
export function ConversationSheet({
  controller,
  state,
  theme,
}: {
  controller: GriotController;
  state: AppState;
  theme: GriotTheme;
}) {
  const view = state.workspaceAgent;
  const [draft, setDraft] = useState("");
  const reducedMotion = useReducedMotion();

  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    controller.sendWorkspaceAgentMessage(text);
    setDraft("");
  };

  return (
    <Modal
      visible={view.isOpen}
      animationType={modalAnimation(reducedMotion, "slide")}
      transparent
      onRequestClose={() => controller.closeWorkspaceAgent()}
    >
      <View style={styles.overlay}>
        <KeyboardAvoidingView
          style={styles.sheet}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
        <View style={[styles.sheetInner, { backgroundColor: theme.background, borderColor: theme.line }]}>
          <View style={[styles.header, { borderBottomColor: theme.line }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.eyebrow, { color: theme.accent, fontFamily: theme.fontMono }]}>
                ASK GRIOT
              </Text>
              <Text
                numberOfLines={1}
                style={[styles.title, { color: theme.text, fontFamily: theme.fontSans }]}
              >
                {view.context.workspaceName || "Workspace"}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close Ask GRIOT"
              onPress={() => controller.closeWorkspaceAgent()}
              hitSlop={8}
              style={styles.close}
            >
              <Text style={[styles.closeText, { color: theme.accent, fontFamily: theme.fontMono }]}>
                CLOSE
              </Text>
            </Pressable>
          </View>

          <View style={styles.contextRow}>
            <ContextChip
              theme={theme}
              label={view.context.groupLabel ? view.context.groupLabel : "Workspace root"}
            />
            {view.context.selectedCount > 0 ? (
              <ContextChip theme={theme} label={`${view.context.selectedCount} selected`} />
            ) : null}
          </View>

          <ScrollView style={styles.messages} contentContainerStyle={styles.messagesContent}>
            {view.isEmpty ? (
              <Text style={[styles.empty, { color: theme.textMuted, fontFamily: theme.fontSans }]}>
                Ask a question about this workspace. Nothing is sent anywhere until a
                model is configured.
              </Text>
            ) : (
              view.messages.map((message) => (
                <View
                  key={message.id}
                  style={[
                    styles.bubble,
                    message.speaker === "user"
                      ? { alignSelf: "flex-end", backgroundColor: theme.accentSoft }
                      : { alignSelf: "flex-start", backgroundColor: theme.panelMuted },
                  ]}
                >
                  <Text style={[styles.bubbleText, { color: theme.text, fontFamily: theme.fontSans }]}>
                    {message.text}
                  </Text>
                  {message.pending ? (
                    <Text
                      style={[styles.pendingText, { color: theme.textMuted, fontFamily: theme.fontMono }]}
                    >
                      AWAITING REPLY
                    </Text>
                  ) : null}
                </View>
              ))
            )}

            {view.isThinking ? (
              <Text
                style={[styles.pendingText, { color: theme.textMuted, fontFamily: theme.fontMono }]}
              >
                THINKING…
              </Text>
            ) : null}

            {view.agentError ? (
              <View style={[styles.errorBanner, { borderColor: theme.line, backgroundColor: theme.panelMuted }]}>
                <Text style={[styles.errorText, { color: theme.text, fontFamily: theme.fontSans }]}>
                  {view.agentError}
                </Text>
              </View>
            ) : null}

            {view.proposals.map((proposal) => (
              <View
                key={proposal.id}
                style={[styles.proposalCard, { borderColor: theme.line, backgroundColor: theme.panelMuted }]}
              >
                <Text style={[styles.proposalLabel, { color: theme.text, fontFamily: theme.fontSans }]}>
                  {proposal.label}
                </Text>
                <Text style={[styles.proposalExplanation, { color: theme.textMuted, fontFamily: theme.fontSans }]}>
                  {proposal.explanation}
                </Text>
                <Text style={[styles.proposalTool, { color: theme.textFaint, fontFamily: theme.fontMono }]}>
                  {proposal.toolSummary.toUpperCase()}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Confirm: ${proposal.label}`}
                  accessibilityState={{ disabled: proposal.isPendingDispatch }}
                  disabled={proposal.isPendingDispatch}
                  onPress={() => controller.confirmWorkspaceAgentAction(proposal.id)}
                  style={[
                    styles.confirmButton,
                    { backgroundColor: proposal.isPendingDispatch ? theme.panelMuted : theme.accent },
                  ]}
                >
                  <Text
                    style={[
                      styles.confirmText,
                      { color: proposal.isPendingDispatch ? theme.textMuted : theme.accentInk, fontFamily: theme.fontMono },
                    ]}
                  >
                    {proposal.status === "proposed"
                      ? "CONFIRM"
                      : proposal.status === "pending-dispatch"
                        ? "WORKING…"
                        : proposal.status === "done"
                          ? "DONE"
                          : "FAILED"}
                  </Text>
                </Pressable>
                {proposal.resultMessage ? (
                  <Text
                    style={[
                      styles.proposalExplanation,
                      {
                        color: proposal.status === "failed" ? theme.danger : theme.textMuted,
                        fontFamily: theme.fontSans,
                      },
                    ]}
                  >
                    {proposal.resultMessage}
                  </Text>
                ) : null}
              </View>
            ))}
          </ScrollView>

          <View style={[styles.composer, { borderTopColor: theme.line }]}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Ask about this workspace…"
              placeholderTextColor={theme.textFaint}
              accessibilityLabel="Ask GRIOT message"
              style={[styles.input, { color: theme.text, borderColor: theme.line, fontFamily: theme.fontSans }]}
              multiline
              onSubmitEditing={submit}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send"
              accessibilityState={{ disabled: !draft.trim() }}
              onPress={submit}
              disabled={!draft.trim()}
              style={[
                styles.sendButton,
                { backgroundColor: draft.trim() ? theme.accent : theme.panelMuted },
              ]}
            >
              <Text
                style={[
                  styles.sendText,
                  { color: draft.trim() ? theme.accentInk : theme.textMuted, fontFamily: theme.fontMono },
                ]}
              >
                SEND
              </Text>
            </Pressable>
          </View>
        </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function ContextChip({ theme, label }: { theme: GriotTheme; label: string }) {
  return (
    <View style={[chipStyles.chip, { borderColor: theme.line, backgroundColor: theme.panelMuted }]}>
      <Text style={[chipStyles.text, { color: theme.textMuted, fontFamily: theme.fontMono }]}>
        {label.toUpperCase()}
      </Text>
    </View>
  );
}

const chipStyles = StyleSheet.create({
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  text: {
    fontSize: TypeScale.label,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
});

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  sheet: {
    maxHeight: "80%",
  },
  sheetInner: {
    borderTopWidth: 1,
    borderTopLeftRadius: Structure.radius,
    borderTopRightRadius: Structure.radius,
    paddingBottom: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderBottomWidth: 1,
    padding: Structure.gutter,
    gap: 12,
  },
  eyebrow: {
    fontSize: TypeScale.label,
    fontWeight: "800",
    letterSpacing: 1,
  },
  title: {
    fontSize: TypeScale.title,
    fontWeight: "700",
    marginTop: 2,
  },
  close: {
    minHeight: Structure.tap,
    justifyContent: "center",
  },
  closeText: {
    fontSize: TypeScale.label,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  contextRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    paddingHorizontal: Structure.gutter,
    paddingTop: 10,
  },
  messages: {
    paddingHorizontal: Structure.gutter,
    marginTop: 10,
  },
  messagesContent: {
    gap: 8,
    paddingBottom: 12,
  },
  empty: {
    fontSize: TypeScale.body,
    lineHeight: 19,
  },
  bubble: {
    maxWidth: "85%",
    borderRadius: Structure.radiusControl,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 4,
  },
  bubbleText: {
    fontSize: TypeScale.body,
    lineHeight: 19,
  },
  pendingText: {
    fontSize: TypeScale.label,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  errorBanner: {
    borderWidth: 1,
    borderRadius: Structure.radiusControl,
    padding: 10,
  },
  errorText: {
    fontSize: TypeScale.body,
    lineHeight: 18,
  },
  proposalCard: {
    borderWidth: 1,
    borderRadius: Structure.radiusControl,
    padding: 10,
    gap: 4,
  },
  proposalLabel: {
    fontSize: TypeScale.body,
    fontWeight: "700",
  },
  proposalExplanation: {
    fontSize: TypeScale.body,
    lineHeight: 18,
  },
  proposalTool: {
    fontSize: TypeScale.label,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  confirmButton: {
    alignSelf: "flex-start",
    minHeight: Structure.tap,
    paddingHorizontal: 12,
    borderRadius: Structure.radiusControl,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  confirmText: {
    fontSize: TypeScale.label,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    borderTopWidth: 1,
    paddingHorizontal: Structure.gutter,
    paddingTop: 10,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: Structure.radiusControl,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: TypeScale.body,
    maxHeight: 100,
  },
  sendButton: {
    minHeight: Structure.tap,
    paddingHorizontal: 14,
    borderRadius: Structure.radiusControl,
    alignItems: "center",
    justifyContent: "center",
  },
  sendText: {
    fontSize: TypeScale.label,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
});
