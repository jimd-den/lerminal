import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Text, TextInput } from "./Typography";
import {
  KeyboardAvoidingView,
  useKeyboardState,
} from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  AppState,
  GriotController,
} from "../../../adapters/presenters/GriotController";
import { GriotTheme, Structure, TypeScale } from "./theme";
import { modalAnimation, useReducedMotion } from "../useReducedMotion";
import { RoundtableSheet } from "./RoundtableSheet";

/**
 * # Conversation Sheet ("Ask GRIOT")
 *
 * ## Business Value & Purpose
 * The workspace-scoped conversational surface: header, context chips (which workspace,
 * which group, how many cards selected), the transcript, and a composer. Most turns are
 * plain conversation and render as nothing but bubbles — no scaffolding, no "no actions"
 * placeholder.
 *
 * A reply arrives **progressively**: text and the model's own reasoning fill in as they
 * are generated, with a "WRITING…" cue while tokens are still arriving. Nothing here fakes
 * that — a gateway that doesn't stream simply delivers the reply whole.
 *
 * When the model marks something concrete, it appears as an inline chip
 * (`NOTE · Spaced repetition`) exactly where it was written, with a `+`. Pressing `+` is
 * the only thing in this file that can create anything: it calls `addWorkspaceAgentTag`,
 * which dispatches the parsed intent to the same interactors as before, and the chip then
 * reports the truth — ADDED with the dispatcher's own message, or FAILED with its reason.
 * A chip with nothing addable behind it shows no `+` and says why.
 *
 * When no model is configured, or a stream dies, `state.workspaceAgent.agentError` is
 * shown as-is rather than a fabricated reply — that honesty is enforced upstream in
 * `WorkspaceAgentWorkflow`; this component only renders what it's given.
 *
 * ## Keeping the composer above the keyboard
 * The `KeyboardAvoidingView` here is the one from `react-native-keyboard-controller`, not
 * React Native's. React Native's works from keyboard *events* and needs a per-platform
 * `behavior`, and on Android it did nothing at all: this sheet is a `Modal`, which is its
 * own window, and since Expo SDK 54 made Android edge-to-edge the window no longer
 * resizes for the keyboard. The result was a composer sitting underneath the keyboard.
 *
 * The controller version reads the real IME inset instead, works the same inside a modal,
 * and takes one `behavior` for both platforms — so there is no longer a platform branch
 * here to get wrong. It needs `KeyboardProvider` mounted above it, which `App.tsx` does.
 *
 * `automaticOffset` exists for precisely this case: it measures where the view actually
 * sits rather than assuming it starts at the top of the screen, which is what a sheet
 * inside a modal needs.
 *
 * The bottom safe-area inset is applied **only while the keyboard is down**. Edge-to-edge
 * means the sheet draws under the Android navigation bar, so without it the composer sits
 * beneath the gesture bar at rest; but once the keyboard is up the IME inset already spans
 * that region, and adding both would float the composer a nav-bar's height too high.
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
  /**
   * The panel the next message goes to, or null for the single active persona. Held here
   * rather than in the controller because it is a property of *this* composer, not of the
   * conversation: closing the sheet and coming back should not silently still be aimed at
   * a table the user chose ten minutes ago.
   */
  const [targetRoundtableId, setTargetRoundtableId] = useState<string | null>(null);
  const [roundtableSheetOpen, setRoundtableSheetOpen] = useState(false);
  const reducedMotion = useReducedMotion();
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardState((keyboard) => keyboard.isVisible);

  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    // One send button, three possible audiences. The armed panel wins over the active
    // persona because arming it was the more recent, more specific choice.
    if (targetRoundtableId) {
      controller.askRoundtable(targetRoundtableId, text);
    } else {
      controller.sendWorkspaceAgentMessage(text);
    }
    setDraft("");
  };

  /**
   * Clearing a table removes the grouping only — the personas on it are ordinary profiles
   * and stay in the user's list. The wording says so, because "delete" on a thing
   * containing four voices reads like it takes the voices with it.
   */
  const confirmDeleteRoundtable = (id: string, name: string) => {
    Alert.alert(
      `Clear the "${name}" table?`,
      "The personas seated at it stay in your list and can still be asked on their own.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear table",
          style: "destructive",
          onPress: () => {
            if (id === targetRoundtableId) setTargetRoundtableId(null);
            void controller.deleteRoundtable(id);
          },
        },
      ],
    );
  };

  /** Puts the same question to every persona, so the reply is a discussion, not an answer. */
  const submitToAll = () => {
    const text = draft.trim();
    if (!text) return;
    controller.askAllWorkspaceAgentPersonas(text);
    setDraft("");
  };

  return (
    <Modal
      visible={view.isOpen}
      animationType={modalAnimation(reducedMotion, "slide")}
      transparent
      // A Modal is its own Android window, and by default that window is *not* laid out
      // edge-to-edge like the app behind it. Without these two the window stops short of
      // the system bars, so the IME inset the keyboard controller reads is measured
      // against a different box than the one being drawn — the composer lands in the
      // wrong place by exactly the inset height. Both are no-ops on iOS.
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={() => controller.closeWorkspaceAgent()}
    >
      <View style={styles.overlay}>
        <KeyboardAvoidingView style={styles.sheet} behavior="padding" automaticOffset>
        <View
          style={[
            styles.sheetInner,
            {
              backgroundColor: theme.background,
              borderColor: theme.line,
              paddingBottom: keyboardVisible ? 12 : 12 + insets.bottom,
            },
          ]}
        >
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
              accessibilityLabel={view.isHistoryOpen ? "Hide conversation history" : "Show conversation history"}
              accessibilityState={{ expanded: view.isHistoryOpen }}
              onPress={() =>
                view.isHistoryOpen
                  ? controller.closeWorkspaceAgentHistory()
                  : void controller.openWorkspaceAgentHistory()
              }
              hitSlop={8}
              style={styles.close}
            >
              <Text
                style={[
                  styles.closeText,
                  { color: view.isHistoryOpen ? theme.text : theme.accent, fontFamily: theme.fontMono },
                ]}
              >
                HISTORY
              </Text>
            </Pressable>
            {/* Offered only once there is something to preserve — on an empty transcript
                "new" would do nothing the user could perceive. */}
            {!view.isEmpty ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Start a new conversation"
                onPress={() => void controller.startNewConversation()}
                hitSlop={8}
                style={styles.close}
              >
                <Text style={[styles.closeText, { color: theme.accent, fontFamily: theme.fontMono }]}>
                  NEW
                </Text>
              </Pressable>
            ) : null}
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
            {view.context.focusCardTitle ? (
              <ContextChip theme={theme} label={view.context.focusCardTitle} />
            ) : null}
            {view.context.cardCount > 0 ? (
              <ContextChip
                theme={theme}
                label={`${view.context.cardCount} card${view.context.cardCount === 1 ? "" : "s"}`}
              />
            ) : null}
          </View>

          {/* Hidden entirely until a second voice exists — one persona is not a choice. */}
          {view.hasMultiplePersonas ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.personaRow}
            >
              {view.personas.map((persona) => (
                <Pressable
                  key={persona.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: persona.active }}
                  accessibilityLabel={`Ask as ${persona.name}`}
                  onPress={() => controller.setWorkspaceAgentPersona(persona.id)}
                  style={[
                    styles.persona,
                    {
                      borderColor: persona.active ? theme.accent : theme.line,
                      backgroundColor: persona.active ? theme.accentSoft : theme.panelMuted,
                    },
                  ]}
                >
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.personaName,
                      { color: theme.text, fontFamily: theme.fontMono },
                    ]}
                  >
                    {persona.name}
                  </Text>
                  {/* The model rides with the name: which one a persona speaks through is
                      part of who it is, never something the user has to go and look up. */}
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.personaModel,
                      { color: theme.textMuted, fontFamily: theme.fontMono },
                    ]}
                  >
                    {persona.model ? shortModelName(persona.model) : "—"}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}

          {/* The panels, under the individual voices: choosing one aims the composer at
              exactly its members. Always rendered, because the row is also the only way to
              build the first one. */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.personaRow}
          >
            {view.roundtables.map((roundtable) => {
              const armed = roundtable.id === targetRoundtableId;
              return (
                <Pressable
                  key={roundtable.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: armed, disabled: roundtable.isEmpty }}
                  accessibilityLabel={`Ask the ${roundtable.name} roundtable`}
                  accessibilityHint={
                    roundtable.isEmpty
                      ? "Every voice on this table has been deleted"
                      : roundtable.memberNames.join(", ")
                  }
                  disabled={roundtable.isEmpty}
                  onPress={() => setTargetRoundtableId(armed ? null : roundtable.id)}
                  onLongPress={() => confirmDeleteRoundtable(roundtable.id, roundtable.name)}
                  style={[
                    styles.persona,
                    {
                      borderColor: armed ? theme.accent : theme.line,
                      backgroundColor: armed ? theme.accentSoft : theme.panelMuted,
                      opacity: roundtable.isEmpty ? 0.5 : 1,
                    },
                  ]}
                >
                  <Text
                    numberOfLines={1}
                    style={[styles.personaName, { color: theme.text, fontFamily: theme.fontMono }]}
                  >
                    {roundtable.name.toUpperCase()}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={[styles.personaModel, { color: theme.textMuted, fontFamily: theme.fontMono }]}
                  >
                    {roundtable.isEmpty
                      ? "EMPTY"
                      : roundtable.memberNames.join(" \u00b7 ")}
                  </Text>
                </Pressable>
              );
            })}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="New roundtable"
              onPress={() => setRoundtableSheetOpen(true)}
              style={[styles.persona, { borderColor: theme.line, backgroundColor: theme.panelMuted }]}
            >
              <Text style={[styles.personaName, { color: theme.accent, fontFamily: theme.fontMono }]}>
                + TABLE
              </Text>
              <Text style={[styles.personaModel, { color: theme.textMuted, fontFamily: theme.fontMono }]}>
                DESCRIBE A PANEL
              </Text>
            </Pressable>
          </ScrollView>

          {view.isHistoryOpen ? (
            <ScrollView
              style={styles.messages}
              contentContainerStyle={styles.messagesContent}
              keyboardShouldPersistTaps="handled"
            >
              {view.history.length === 0 ? (
                <Text
                  style={[styles.empty, { color: theme.textMuted, fontFamily: theme.fontSans }]}
                >
                  No saved conversations in this space yet. They are kept automatically once
                  you send a message.
                </Text>
              ) : (
                view.history.map((entry) => (
                  <View
                    key={entry.id}
                    style={[
                      styles.historyRow,
                      {
                        borderColor: entry.current ? theme.accent : theme.line,
                        backgroundColor: entry.current ? theme.accentSoft : theme.panelMuted,
                      },
                    ]}
                  >
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Open conversation: ${entry.title}`}
                      onPress={() => void controller.openSavedConversation(entry.id)}
                      style={{ flex: 1 }}
                    >
                      <Text
                        numberOfLines={2}
                        style={[styles.historyTitle, { color: theme.text, fontFamily: theme.fontSans }]}
                      >
                        {entry.title}
                      </Text>
                      <Text
                        style={[styles.historyMeta, { color: theme.textMuted, fontFamily: theme.fontMono }]}
                      >
                        {`${entry.messageCount} message${entry.messageCount === 1 ? "" : "s"} · ${relativeTime(entry.updatedAt)}`}
                        {entry.current ? " · OPEN" : ""}
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Delete conversation: ${entry.title}`}
                      onPress={() => void controller.deleteSavedConversation(entry.id)}
                      hitSlop={8}
                      style={styles.historyDelete}
                    >
                      <Text
                        style={[styles.closeText, { color: theme.danger, fontFamily: theme.fontMono }]}
                      >
                        DELETE
                      </Text>
                    </Pressable>
                  </View>
                ))
              )}
            </ScrollView>
          ) : (
          <ScrollView
            style={styles.messages}
            contentContainerStyle={styles.messagesContent}
            // The chips' `+` buttons sit inside this list; without this a tap while the
            // composer has focus is swallowed by the keyboard dismiss.
            keyboardShouldPersistTaps="handled"
          >
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
                    // A reply carrying a disclosure or a chip needs the full width to
                    // stay legible; a plain one keeps the narrow bubble.
                    message.sentContext || message.segments.length > 1
                      ? styles.bubbleWide
                      : null,
                  ]}
                >
                  {/* Who is speaking, shown only once several voices are in play so a
                      single-persona transcript reads exactly as it always did. */}
                  {message.personaName && view.hasMultiplePersonas ? (
                    <Text
                      style={[
                        styles.personaByline,
                        { color: theme.accent, fontFamily: theme.fontMono },
                      ]}
                    >
                      {message.model
                        ? `${message.personaName} · ${message.model}`
                        : message.personaName}
                    </Text>
                  ) : null}
                  {message.segments.length > 0 ? (
                    <MessageBody theme={theme} message={message} controller={controller} />
                  ) : (
                    <Text style={[styles.bubbleText, { color: theme.text, fontFamily: theme.fontSans }]}>
                      {message.text}
                    </Text>
                  )}
                  {message.pending ? (
                    <Text
                      style={[styles.pendingText, { color: theme.textMuted, fontFamily: theme.fontMono }]}
                    >
                      AWAITING REPLY
                    </Text>
                  ) : null}
                  <SourceReceipts theme={theme} citations={message.webCitations} />
                  <TurnDisclosure
                    theme={theme}
                    sentContext={message.sentContext}
                    reasoning={message.reasoning}
                  />
                </View>
              ))
            )}

            {view.agentError ? (
              <View style={[styles.errorBanner, { borderColor: theme.line, backgroundColor: theme.panelMuted }]}>
                <Text style={[styles.errorText, { color: theme.text, fontFamily: theme.fontSans }]}>
                  {view.agentError}
                </Text>
              </View>
            ) : null}

          </ScrollView>
          )}

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
            {/* Only offered when there is actually a panel to put the question to. */}
            {view.hasMultiplePersonas ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Ask every persona"
                accessibilityState={{ disabled: !draft.trim() || view.isThinking }}
                onPress={submitToAll}
                disabled={!draft.trim() || view.isThinking}
                style={[
                  styles.askAllButton,
                  {
                    borderColor: draft.trim() && !view.isThinking ? theme.accent : theme.line,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.sendText,
                    {
                      color: draft.trim() && !view.isThinking ? theme.accent : theme.textMuted,
                      fontFamily: theme.fontMono,
                    },
                  ]}
                >
                  ALL
                </Text>
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={view.isThinking ? "Waiting for a reply" : "Send"}
              accessibilityState={{ disabled: !draft.trim() || view.isThinking, busy: view.isThinking }}
              onPress={submit}
              disabled={!draft.trim() || view.isThinking}
              style={[
                styles.sendButton,
                {
                  backgroundColor:
                    draft.trim() && !view.isThinking ? theme.accent : theme.panelMuted,
                },
              ]}
            >
              {/* The thinking state lives here rather than in the message list: it tracks a
                  real in-flight request, and in the list it scrolled out of sight. */}
              {view.isThinking ? (
                reducedMotion ? (
                  <Text
                    style={[styles.sendText, { color: theme.textMuted, fontFamily: theme.fontMono }]}
                  >
                    …
                  </Text>
                ) : (
                  <ActivityIndicator size="small" color={theme.textMuted} />
                )
              ) : (
                <Text
                  style={[
                    styles.sendText,
                    { color: draft.trim() ? theme.accentInk : theme.textMuted, fontFamily: theme.fontMono },
                  ]}
                >
                  {/* The button says who is about to answer, so an armed panel can never
                      be a surprise the user only discovers from the replies. */}
                  {targetRoundtableId ? "TABLE" : "SEND"}
                </Text>
              )}
            </Pressable>
          </View>
        </View>
        </KeyboardAvoidingView>
      </View>
      {/* Inside the conversation's own Modal: on Android a sibling modal would be a second
          window stacked behind this one and would simply not be visible. */}
      <RoundtableSheet
        visible={roundtableSheetOpen}
        controller={controller}
        theme={theme}
        onClose={() => setRoundtableSheetOpen(false)}
      />
    </Modal>
  );
}

/**
 * The readable half of a model id: "google/gemini-2.5-flash" reads as "gemini-2.5-flash".
 *
 * The vendor prefix is identical across most of a user's models, so it costs width on
 * every chip while distinguishing none of them. The full id is still what the view model
 * carries and what the message byline shows — this only shortens the label.
 */
function shortModelName(model: string): string {
  const tail = model.includes("/") ? model.slice(model.lastIndexOf("/") + 1) : model;
  return tail || model;
}

/**
 * A coarse "when" for a history row. Coarse on purpose: the exact minute a conversation
 * was last touched is noise, and what the reader is actually scanning for is whether this
 * is the one from this morning or the one from last week.
 */
function relativeTime(timestamp: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

type MessageViewModel = AppState["workspaceAgent"]["messages"][number];
type TagViewModel = Extract<
  MessageViewModel["segments"][number],
  { kind: "tag" }
>["tag"];
type SentContextViewModel = NonNullable<
  AppState["workspaceAgent"]["messages"][number]["sentContext"]
>;

/**
 * # Turn disclosure — "what was sent", and what the model thought
 *
 * ## Business Value & Purpose
 * The auditable half of the trust model. Anything that leaves the device for a turn is
 * listed here verbatim: the group it was scoped to, every card id and title that
 * travelled, and the exact briefing text. It is projected from
 * `WorkspaceAgentSentContext`, recorded by the workflow at send time from the very values
 * the request was built from, so it cannot flatter the request or drift from it.
 *
 * The second half — the model's own intermediate reasoning — renders **only** when the
 * provider actually returned some. Most models return none, and in that case this shows
 * the "what was sent" half alone: no placeholder, no "(no reasoning available)", nothing
 * that could read as the model having thought. When it is present it is labelled as the
 * model's own working and styled subordinate to the answer, because it is not the answer.
 *
 * Collapsed by default, and expand/collapse is plain local state — the same pattern as
 * `components.tsx`'s `CollapsibleSection`. Nothing about it decides anything.
 */
function TurnDisclosure({
  theme,
  sentContext,
  reasoning,
}: {
  theme: GriotTheme;
  sentContext?: SentContextViewModel;
  reasoning?: string;
}) {
  const [open, setOpen] = useState(false);
  if (!sentContext) return null;

  const cardCount = sentContext.cards.length;

  return (
    <View style={[styles.disclosure, { borderTopColor: theme.line }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          reasoning
            ? "What was sent, and the model's thinking"
            : "What was sent to the model"
        }
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((value) => !value)}
        hitSlop={{ top: 6, bottom: 6 }}
        style={styles.disclosureHead}
      >
        <Text
          style={[styles.disclosureLabel, { color: theme.textMuted, fontFamily: theme.fontMono }]}
        >
          {open ? "▾" : "▸"} {reasoning ? "WHAT WAS SENT · THINKING" : "WHAT WAS SENT"}
        </Text>
      </Pressable>

      {open ? (
        <View style={styles.disclosureBody}>
          <Text
            style={[styles.disclosureMeta, { color: theme.textFaint, fontFamily: theme.fontMono }]}
          >
            {`SCOPE: ${(sentContext.groupLabel ?? "Workspace root").toUpperCase()} · ${cardCount} CARD${cardCount === 1 ? "" : "S"}`}
          </Text>

          {sentContext.cards.map((card) => (
            <Text
              key={card.id}
              style={[styles.disclosureItem, { color: theme.textMuted, fontFamily: theme.fontMono }]}
            >
              {`${card.focus ? "[focus] " : ""}${card.id} — ${card.title}`}
            </Text>
          ))}

          <Text
            style={[styles.disclosureLabel, { color: theme.textMuted, fontFamily: theme.fontMono }]}
          >
            BRIEFING SENT
          </Text>
          <Text
            style={[styles.disclosureBriefing, { color: theme.textFaint, fontFamily: theme.fontMono }]}
          >
            {sentContext.briefing}
          </Text>

          {/* Rendered if and only if real reasoning came back. */}
          {reasoning ? (
            <View style={[styles.reasoning, { borderLeftColor: theme.line }]}>
              <Text
                style={[styles.disclosureLabel, { color: theme.textMuted, fontFamily: theme.fontMono }]}
              >
                THE MODEL'S OWN THINKING — NOT ITS ANSWER
              </Text>
              <Text
                style={[styles.reasoningText, { color: theme.textFaint, fontFamily: theme.fontSans }]}
              >
                {reasoning}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/**
 * # Message body — prose with the chips where the model actually put them
 *
 * ## Business Value & Purpose
 * The model writes a sentence and drops a marker in it; this renders that sentence with a
 * chip sitting exactly where the marker was, rather than a slab of proposal scaffolding
 * underneath the conversation. Text that is still streaming renders as it arrives, so the
 * reply is visibly being written instead of appearing all at once after a spinner.
 *
 * Nothing here can create anything. A chip's `+` calls `addWorkspaceAgentTag`, and that is
 * the only route from this file to a real card.
 */
function MessageBody({
  theme,
  message,
  controller,
}: {
  theme: GriotTheme;
  message: MessageViewModel;
  controller: GriotController;
}) {
  return (
    <View style={styles.body}>
      {message.segments.map((segment, index) =>
        segment.kind === "text" ? (
          <Text
            key={`text-${index}`}
            style={[styles.bubbleText, { color: theme.text, fontFamily: theme.fontSans }]}
          >
            {segment.text}
          </Text>
        ) : (
          <TagChip
            key={segment.tag.id}
            theme={theme}
            tag={segment.tag}
            controller={controller}
          />
        )
      )}
      {/* The honest live-generation cue: shown only while tokens are actually arriving. */}
      {message.streaming ? (
        <Text style={[styles.pendingText, { color: theme.textFaint, fontFamily: theme.fontMono }]}>
          WRITING…
        </Text>
      ) : null}
    </View>
  );
}

/**
 * # Tag chip
 *
 * ## Business Value & Purpose
 * One thing the reply mentioned that could become a real card, shown inline as
 * `NOTE · Spaced repetition` with a `+`. Pressing `+` is the *only* thing in the app that
 * turns a reply into a card — nothing is created by the model saying it, by the parser
 * reading it, or by this chip rendering it.
 *
 * Afterwards the chip tells the truth about what happened: "ADDED" with the dispatcher's
 * own completion message, or "FAILED" with its reason. A chip with nothing addable behind
 * it (an unresolvable card reference, a link that isn't a URL) shows no `+` at all and
 * says why, rather than offering a button that would quietly do nothing.
 */
function TagChip({
  theme,
  tag,
  controller,
}: {
  theme: GriotTheme;
  tag: TagViewModel;
  controller: GriotController;
}) {
  const settled = tag.status === "done" || tag.status === "failed";
  const disabled = !tag.canAdd || tag.status !== "offered";
  const accent = tag.status === "failed" ? theme.danger : theme.accent;

  return (
    <View style={styles.tagChipWrap}>
      <View
        style={[
          styles.tagChip,
          { borderColor: tag.canAdd ? accent : theme.line, backgroundColor: theme.accentSoft },
        ]}
      >
        <Text
          numberOfLines={2}
          style={[styles.tagChipText, { color: tag.canAdd ? accent : theme.textMuted, fontFamily: theme.fontMono }]}
        >
          {`${tag.kindLabel} · ${tag.title}`}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Add ${tag.kindLabel.toLowerCase()}: ${tag.title}`}
          accessibilityHint="Creates this in your workspace. Nothing is created until you press this."
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPress={() => void controller.addWorkspaceAgentTag(tag.messageId, tag.id)}
          hitSlop={8}
          style={styles.tagAdd}
        >
          <Text style={[styles.tagAddText, { color: disabled ? theme.textMuted : accent, fontFamily: theme.fontMono }]}>
            {tag.status === "offered"
              ? "+"
              : tag.status === "pending"
                ? "…"
                : tag.status === "done"
                  ? "ADDED"
                  : "FAILED"}
          </Text>
        </Pressable>
      </View>

      {/* The members a group would really use, named so they can be checked rather than
          trusted. Only multi-card intents have any. */}
      {tag.items.length > 1 && !settled ? (
        <Text
          numberOfLines={3}
          style={[styles.tagItems, { color: theme.textFaint, fontFamily: theme.fontSans }]}
        >
          {tag.items.join(" · ")}
        </Text>
      ) : null}

      {tag.detail ? (
        <Text
          style={[
            styles.tagItems,
            {
              color: tag.status === "failed" ? theme.danger : theme.textMuted,
              fontFamily: theme.fontSans,
            },
          ]}
        >
          {tag.detail}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * The receipts strip: the sources the model's provider actually consulted for this
 * reply, attached to the reply that used them.
 *
 * Renders nothing at all when the list is empty, which is what keeps the claim honest —
 * the strip exists only where real citations came back, never because web search is
 * switched on. The wording is deliberately "consulted", not "found" or "saved": these
 * are the model's own reading, not research candidates the user kept, which still come
 * only from the app's own search path.
 */
function SourceReceipts({
  theme,
  citations,
}: {
  theme: GriotTheme;
  citations: { url: string; title: string }[];
}) {
  if (!citations || citations.length === 0) return null;

  return (
    <View style={[styles.receipts, { borderTopColor: theme.line }]}>
      <Text style={[styles.receiptsLabel, { color: theme.textMuted, fontFamily: theme.fontMono }]}>
        SOURCES THE MODEL CONSULTED
      </Text>
      {citations.map((citation, index) => (
        <Pressable
          key={`${citation.url}-${index}`}
          onPress={() => void Linking.openURL(citation.url).catch(() => {})}
          style={styles.receipt}
        >
          <Text
            numberOfLines={2}
            style={[styles.receiptTitle, { color: theme.accent, fontFamily: theme.fontSans }]}
          >
            {citation.title}
          </Text>
        </Pressable>
      ))}
    </View>
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
    // Without this the sheet refuses to shrink below its content height, so the
    // ScrollView below never gets a bounded height to scroll inside.
    flexShrink: 1,
  },
  sheetInner: {
    borderTopWidth: 1,
    borderTopLeftRadius: Structure.radius,
    borderTopRightRadius: Structure.radius,
    paddingBottom: 12,
    flexShrink: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderBottomWidth: 1,
    padding: Structure.gutter,
    // Tighter than the usual gutter rhythm: the header carries three actions now
    // (HISTORY / NEW / CLOSE) and they must not crowd the workspace name on a narrow phone.
    gap: 8,
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
    // Bounds the scroll viewport against the sheet's maxHeight. Without it the list
    // grows to content height, gets clipped, and pushes the composer out of reach —
    // proposal checkboxes ended up underneath it, untappable and unscrollable.
    flexShrink: 1,
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
  bubbleWide: {
    maxWidth: "100%",
    alignSelf: "stretch",
  },
  bubbleText: {
    fontSize: TypeScale.body,
    lineHeight: 19,
  },
  disclosure: {
    marginTop: 6,
    paddingTop: 4,
    borderTopWidth: 1,
  },
  disclosureHead: {
    minHeight: Structure.tap * 0.75,
    justifyContent: "center",
  },
  disclosureLabel: {
    fontSize: TypeScale.label,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  disclosureBody: {
    gap: 4,
    paddingBottom: 4,
  },
  disclosureMeta: {
    fontSize: TypeScale.label,
    letterSpacing: 0.4,
  },
  disclosureItem: {
    fontSize: TypeScale.label,
    lineHeight: 15,
  },
  disclosureBriefing: {
    fontSize: TypeScale.label,
    lineHeight: 15,
  },
  reasoning: {
    borderLeftWidth: 2,
    paddingLeft: 8,
    marginTop: 6,
    gap: 3,
  },
  reasoningText: {
    fontSize: TypeScale.label,
    lineHeight: 16,
    fontStyle: "italic",
  },
  body: {
    gap: 6,
  },
  tagChipWrap: {
    gap: 3,
  },
  tagChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: Structure.radiusControl,
    minHeight: Structure.tap,
    paddingLeft: 10,
    paddingRight: 4,
    paddingVertical: 4,
  },
  tagChipText: {
    flex: 1,
    fontSize: TypeScale.label,
    fontWeight: "800",
    letterSpacing: 0.5,
    lineHeight: 16,
  },
  tagAdd: {
    minWidth: Structure.tap,
    minHeight: Structure.tap,
    alignItems: "center",
    justifyContent: "center",
  },
  tagAddText: {
    fontSize: TypeScale.body,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  tagItems: {
    fontSize: TypeScale.label,
    lineHeight: 16,
  },
  receipts: {
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    gap: 3,
  },
  receiptsLabel: {
    fontSize: TypeScale.label,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  receipt: {
    paddingVertical: 2,
  },
  receiptTitle: {
    fontSize: TypeScale.label,
    lineHeight: 16,
    textDecorationLine: "underline",
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
  askAllButton: {
    minHeight: Structure.tap,
    paddingHorizontal: 12,
    borderRadius: Structure.radiusControl,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  personaRow: {
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: Structure.gutter,
    paddingBottom: 8,
  },
  persona: {
    borderWidth: 1,
    borderRadius: Structure.radiusControl,
    paddingHorizontal: 12,
    paddingVertical: 7,
    // The strip scrolls horizontally, so a chip should size to its name and then stop.
    // It must never shrink: in a row of flex children the longest name is the one that
    // gets compressed, which is exactly the one worth reading.
    flexShrink: 0,
    minWidth: 92,
  },
  personaName: { fontSize: TypeScale.label, fontWeight: "800", letterSpacing: 0.6 },
  personaModel: { fontSize: 10, marginTop: 3, letterSpacing: 0.3 },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: Structure.radiusControl,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  historyTitle: { fontSize: TypeScale.body, fontWeight: "700" },
  historyMeta: { fontSize: 10, marginTop: 4, letterSpacing: 0.5 },
  historyDelete: { paddingVertical: 6, paddingHorizontal: 4 },
  personaByline: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  sendText: {
    fontSize: TypeScale.label,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
});
