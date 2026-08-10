import React, { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text, TextInput } from "../Typography";
import {
  AppState,
  GriotController,
} from "../../../../adapters/presenters/GriotController";
import {
  MessageViewModel,
  SourceReceipts,
  TagChip,
} from "../ConversationSheet";
import { GriotTheme, Structure, TypeScale } from "../theme";
import { ArrivalView } from "../../motion/communicative";

/**
 * # Think Tank Board — the table, rendered inline
 *
 * ## Business Value & Purpose
 * `conveneThinkTank` used to hand its result to the Ask GRIOT `Modal`. On some phones a
 * modal stacked over the Bridge is real friction — its own window, its own keyboard
 * inset, one more layer between the captain and what the table just said. This renders
 * the same conversation as a strip of posts on the Bridge itself: no modal, nothing to
 * dismiss before you can see the next thing.
 *
 * It is a **second view of the same data**, not a second conversation mechanism. Every
 * post here is a `WorkspaceAgentMessage` the workflow already produced; sending, tag
 * chips, and receipts all reuse exactly what `ConversationSheet` uses (`TagChip`,
 * `SourceReceipts`) so a card added from a board post and one added from the modal go
 * through the identical dispatch.
 *
 * ## Groups and hashtags — what they actually are here
 * The board does not invent a topic-classification feature. A **group** is the table
 * itself — its name is the board's own header, and convening a different topic starts a
 * new one. A **hashtag** is `#PersonaName`: real, derived from who is actually speaking,
 * not a keyword guess. Both read as a message board without claiming structure the data
 * doesn't have.
 *
 * ## What "retry" and "rethink" are
 * Neither edits a reply in place — a second attempt is a new post, so the first answer
 * stays exactly as it was said:
 * - **RETRY** re-asks the same persona the same question, for an independent second take.
 * - **🤔 RETHINK** asks the persona to look at what it just said again and revise if it
 *   needs to. Both are ordinary sends — see `WorkspaceAgentWorkflow.retryReply`/`rethinkReply`.
 */
export function ThinkTankBoard({
  controller,
  state,
  theme,
}: {
  controller: GriotController;
  state: AppState;
  theme: GriotTheme;
}) {
  const activeId = state.activeThinkTankRoundtableId;
  const [draft, setDraft] = useState("");
  const [selected, setSelected] = useState<Record<string, Map<string, string>>>({});

  // Nothing is shown until a table has actually been convened — an empty board would be
  // one more thing to scroll past on a screen that is already an instrument panel.
  if (!activeId) return null;

  const view = state.workspaceAgent;
  const table = view.roundtables.find(rt => rt.id === activeId);
  const tableName = table?.name ?? "The table";

  const toggleSentence = (messageId: string, key: string, text: string) => {
    setSelected(prev => {
      const current = new Map(prev[messageId] ?? []);
      if (current.has(key)) current.delete(key);
      else current.set(key, text);
      return { ...prev, [messageId]: current };
    });
  };

  const critique = (messageId: string) => {
    const picked = selected[messageId];
    if (!picked || picked.size === 0) return;
    const quoted = [...picked.values()].map(sentence => `"${sentence.trim()}"`).join(" ");
    controller.askRoundtable(activeId, `Push back on this — is it actually right, and why or why not? ${quoted}`);
    setSelected(prev => {
      const next = { ...prev };
      delete next[messageId];
      return next;
    });
  };

  const post = () => {
    const text = draft.trim();
    if (!text) return;
    controller.askRoundtable(activeId, text);
    setDraft("");
  };

  const pushDeeper = () => {
    controller.askRoundtable(
      activeId,
      "Push this further — what specifically is worth researching next to settle it, and why?"
    );
  };

  return (
    <View style={[styles.board, { borderColor: theme.line, backgroundColor: theme.panelStrong }]}>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.eyebrow, { color: theme.accent, fontFamily: theme.fontMono }]}>
            THINK TANK
          </Text>
          <Text style={[styles.tableName, { color: theme.text, fontFamily: theme.fontSans }]}>
            {tableName}
          </Text>
          <Text style={[styles.hashtag, { color: theme.textFaint, fontFamily: theme.fontMono }]}>
            #{hashtag(tableName)}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss the think tank board"
          accessibilityHint="Hides the board. Nothing said is deleted."
          onPress={() => controller.dismissThinkTank()}
          hitSlop={8}
          style={styles.dismiss}
        >
          <Text style={[styles.dismissText, { color: theme.textFaint, fontFamily: theme.fontMono }]}>
            ✕
          </Text>
        </Pressable>
      </View>

      {view.isEmpty ? (
        <Text style={[styles.empty, { color: theme.textMuted, fontFamily: theme.fontSans }]}>
          Convening…
        </Text>
      ) : (
        view.messages.map((message, index) => (
          <Post
            key={message.id}
            message={message}
            theme={theme}
            controller={controller}
            index={index}
            selected={selected[message.id]}
            onToggleSentence={
              message.speaker === "assistant"
                ? (key, text) => toggleSentence(message.id, key, text)
                : undefined
            }
            onCritique={() => critique(message.id)}
          />
        ))
      )}

      {view.agentError ? (
        <Text style={[styles.error, { color: theme.danger, fontFamily: theme.fontSans }]}>
          {view.agentError}
        </Text>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Push the table to research further"
        accessibilityState={{ disabled: view.isThinking }}
        disabled={view.isThinking}
        onPress={pushDeeper}
        style={styles.pushDeeper}
      >
        <Text style={[styles.pushDeeperText, { color: theme.accent, fontFamily: theme.fontMono }]}>
          PUSH DEEPER — WHAT SHOULD WE RESEARCH NEXT? →
        </Text>
      </Pressable>

      <View style={[styles.composer, { borderTopColor: theme.line }]}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Post to the table…"
          placeholderTextColor={theme.textFaint}
          accessibilityLabel="Post to the think tank"
          style={[styles.input, { color: theme.text, borderColor: theme.line, fontFamily: theme.fontSans }]}
          multiline
          onSubmitEditing={post}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={view.isThinking ? "Waiting for a reply" : "Post"}
          accessibilityState={{ disabled: !draft.trim() || view.isThinking, busy: view.isThinking }}
          onPress={post}
          disabled={!draft.trim() || view.isThinking}
          style={[
            styles.postButton,
            { backgroundColor: draft.trim() && !view.isThinking ? theme.accent : theme.panelMuted },
          ]}
        >
          <Text
            style={[
              styles.postButtonText,
              { color: draft.trim() && !view.isThinking ? theme.accentInk : theme.textMuted, fontFamily: theme.fontMono },
            ]}
          >
            {view.isThinking ? "…" : "POST"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * Splits a paragraph into whole sentences, terminator kept. The same shape as
 * `ConversationSheet`'s own splitter — small enough, and different enough in how it is
 * used here (board actions, not a chat composer), that duplicating it beats importing a
 * private helper across an unrelated surface. See `usecases/bridge/stationDuty.ts`'s note
 * on the same tradeoff.
 */
const SENTENCE_PATTERN = /[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g;

function splitIntoSentences(text: string): string[] {
  return (text.match(SENTENCE_PATTERN) ?? []).map(sentence => sentence.trim()).filter(Boolean);
}

/** `"The Skeptics' Table"` → `TheSkepticsTable` — a real hashtag, not a decoration. */
function hashtag(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9 ]/g, "").trim();
  return (
    cleaned
      .split(/\s+/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join("") || "Table"
  );
}

function Post({
  message,
  theme,
  controller,
  index,
  selected,
  onToggleSentence,
  onCritique,
}: {
  message: MessageViewModel;
  theme: GriotTheme;
  controller: GriotController;
  index: number;
  selected?: Map<string, string>;
  onToggleSentence?: (key: string, text: string) => void;
  onCritique: () => void;
}) {
  const isUser = message.speaker === "user";

  return (
    <ArrivalView delay={Math.min(index * 30, 150)}>
      <View style={[styles.post, { borderColor: theme.line, backgroundColor: isUser ? theme.accentSoft : theme.panel }]}>
        <View style={styles.postHead}>
          <Text style={[styles.postAuthor, { color: theme.text, fontFamily: theme.fontMono }]}>
            {isUser ? "YOU" : message.personaName ?? "GRIOT"}
          </Text>
          {!isUser && message.personaName ? (
            <Text style={[styles.postHashtag, { color: theme.accent, fontFamily: theme.fontMono }]}>
              #{hashtag(message.personaName)}
            </Text>
          ) : null}
          {message.model ? (
            <Text style={[styles.postModel, { color: theme.textFaint, fontFamily: theme.fontMono }]}>
              {message.model}
            </Text>
          ) : null}
        </View>

        {message.segments.length > 0 ? (
          <View style={styles.postBody}>
            {message.segments.map((segment, segIndex) =>
              segment.kind === "text" ? (
                onToggleSentence ? (
                  <Text
                    key={`text-${segIndex}`}
                    style={[styles.postText, { color: theme.text, fontFamily: theme.fontSans }]}
                  >
                    {splitIntoSentences(segment.text).map((sentence, sentIndex) => {
                      const key = `${segIndex}-${sentIndex}`;
                      const isSelected = selected?.has(key) ?? false;
                      return (
                        <Text
                          key={key}
                          accessibilityRole="button"
                          accessibilityLabel={sentence}
                          accessibilityHint="Selects this line to push back on."
                          accessibilityState={{ selected: isSelected }}
                          onPress={() => onToggleSentence(key, sentence)}
                          style={isSelected ? { backgroundColor: theme.accentSoft, fontWeight: "700" } : undefined}
                        >
                          {sentIndex > 0 ? " " : ""}
                          {sentence}
                        </Text>
                      );
                    })}
                  </Text>
                ) : (
                  <Text
                    key={`text-${segIndex}`}
                    style={[styles.postText, { color: theme.text, fontFamily: theme.fontSans }]}
                  >
                    {segment.text}
                  </Text>
                )
              ) : (
                <TagChip key={segment.tag.id} theme={theme} tag={segment.tag} controller={controller} />
              )
            )}
            {message.streaming ? (
              <Text style={[styles.pending, { color: theme.textFaint, fontFamily: theme.fontMono }]}>
                WRITING…
              </Text>
            ) : null}
          </View>
        ) : null}

        {message.pending ? (
          <Text style={[styles.pending, { color: theme.textMuted, fontFamily: theme.fontMono }]}>
            AWAITING REPLY
          </Text>
        ) : null}

        <SourceReceipts theme={theme} citations={message.webCitations} />

        {selected && selected.size > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Push back on ${selected.size} selected line${selected.size === 1 ? "" : "s"}`}
            onPress={onCritique}
            style={[styles.critiquePill, { borderColor: theme.danger }]}
          >
            <Text style={[styles.critiquePillText, { color: theme.danger, fontFamily: theme.fontMono }]}>
              CRITIQUE ({selected.size}) →
            </Text>
          </Pressable>
        ) : null}

        {/* Retry and rethink only make sense for a reply that actually came from a
            named voice — a user's own post has neither. */}
        {!isUser && message.personaId && !message.pending && !message.streaming ? (
          <View style={styles.postActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Retry — ask the same question again"
              onPress={() => controller.retryReply(message.id)}
              style={[styles.postAction, { borderColor: theme.line }]}
            >
              <Text style={[styles.postActionText, { color: theme.textMuted, fontFamily: theme.fontMono }]}>
                RETRY
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Ask this voice to reconsider what it just said"
              onPress={() => controller.rethinkReply(message.id)}
              style={[styles.postAction, { borderColor: theme.line }]}
            >
              <Text style={[styles.postActionText, { color: theme.textMuted, fontFamily: theme.fontMono }]}>
                🤔 RETHINK
              </Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </ArrivalView>
  );
}

const styles = StyleSheet.create({
  board: {
    borderWidth: 1,
    borderRadius: Structure.radius,
    marginTop: 12,
    padding: 12,
    gap: 10,
  },
  head: { flexDirection: "row", alignItems: "flex-start" },
  eyebrow: { fontSize: TypeScale.label, fontWeight: "900", letterSpacing: 1.4 },
  tableName: { fontSize: TypeScale.bodyStrong, fontWeight: "800", marginTop: 2 },
  hashtag: { fontSize: TypeScale.label, fontWeight: "700", marginTop: 2, letterSpacing: 0.4 },
  dismiss: { minWidth: Structure.tap, minHeight: Structure.tap, alignItems: "center", justifyContent: "center" },
  dismissText: { fontSize: 16, fontWeight: "900" },
  empty: { fontSize: TypeScale.meta, fontStyle: "italic" },
  error: { fontSize: TypeScale.meta, lineHeight: 19 },

  post: { borderWidth: 1, borderRadius: Structure.radiusControl, padding: 10, gap: 6 },
  postHead: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  postAuthor: { fontSize: TypeScale.label, fontWeight: "900", letterSpacing: 0.6 },
  postHashtag: { fontSize: TypeScale.label, fontWeight: "800" },
  postModel: { fontSize: TypeScale.label, fontWeight: "600", marginLeft: "auto" },
  postBody: { gap: 4 },
  postText: { fontSize: TypeScale.body, lineHeight: 21 },
  pending: { fontSize: TypeScale.label, fontWeight: "800", letterSpacing: 0.6 },

  critiquePill: {
    alignSelf: "flex-start",
    minHeight: 30,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    justifyContent: "center",
  },
  critiquePillText: { fontSize: TypeScale.label, fontWeight: "900", letterSpacing: 0.6 },

  postActions: { flexDirection: "row", gap: 6, marginTop: 2 },
  postAction: {
    minHeight: 32,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    justifyContent: "center",
  },
  postActionText: { fontSize: TypeScale.label, fontWeight: "800", letterSpacing: 0.5 },

  pushDeeper: { minHeight: Structure.tap, justifyContent: "center" },
  pushDeeperText: { fontSize: TypeScale.label, fontWeight: "800", letterSpacing: 0.5 },

  composer: { flexDirection: "row", alignItems: "flex-end", gap: 8, borderTopWidth: 1, paddingTop: 10 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: Structure.radiusControl,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: TypeScale.body,
    maxHeight: 100,
  },
  postButton: {
    minHeight: Structure.tap,
    paddingHorizontal: 14,
    borderRadius: Structure.radiusControl,
    alignItems: "center",
    justifyContent: "center",
  },
  postButtonText: { fontSize: TypeScale.label, fontWeight: "900", letterSpacing: 0.8 },
});
