import React, { useState } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import { Text, TextInput } from "../Typography";
import {
  AppState,
  GriotController,
} from "../../../../adapters/presenters/GriotController";
import {
  ThinkTankHistoryEntryViewModel,
  ThinkTankMessageViewModel,
} from "../../../../adapters/presenters/ThinkTankPresenter";
import { SourceReceipts, TagChip, TagViewModel } from "../ConversationSheet";
import { GriotTheme, Structure, TypeScale } from "../theme";
import { ArrivalView, CountPulse } from "../../motion/communicative";

/**
 * # Think Tank Board — the table, rendered inline, with its own history
 *
 * ## Business Value & Purpose
 * A strip of posts on the Bridge itself: no modal, nothing to dismiss before you can see
 * the next thing. `conveneThinkTank` never touches the Ask GRIOT modal at all — see
 * `GriotController`'s own note on that.
 *
 * ## The same instrument, not a second one
 * The Bridge's scope already established a visual grammar for "a reading from an agent":
 * a colour-coded rail, a mono all-caps designation, a bearing that gives a reading
 * identity without repeating its title (`ContactPanel`, `instruments.tsx`). A board post
 * *is* a reading — the panel just calls it a post instead of a contact — so it wears the
 * same rail-and-bearing silhouette rather than a second, ad hoc "chat bubble" look. Each
 * voice keeps one stable rail colour for the life of the thread ({@link voiceTone}),
 * cycling the same instrument palette `dutyTone` draws from; a user post gets no colour at
 * all, because a captain's own words are not a reading.
 *
 * ## A separate history, for real
 * Every think tank is its own thread — `ThinkTankWorkflow`'s own store, keyed by the
 * roundtable that produced it, persisted independently of the ambient conversation and of
 * every other thread. That is what makes the history strip below honest: switching to a
 * past table reopens *that* transcript, exactly as it was left, and the one you switched
 * away from is still there, untouched, the next time you switch back.
 *
 * ## Groups and hashtags — what they actually are here
 * A **group** is a thread — the table's own name is the board's header, and switching
 * threads switches groups. A **hashtag** is `#PersonaName`: real, derived from who is
 * actually speaking, not a keyword guess.
 *
 * ## What "retry" and "rethink" are
 * Neither edits a reply in place — a second attempt is a new post:
 * - **RETRY** re-asks the same voice the same question, for an independent second take.
 * - **🤔 RETHINK** asks the voice to look at what it just said again and revise if needed.
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
  const thinkTank = state.thinkTank;
  const [draft, setDraft] = useState("");
  const [selected, setSelected] = useState<Record<string, Map<string, string>>>({});

  const active = thinkTank.active;
  const tones = active ? assignVoiceTones(active.messages, theme) : new Map<string, string>();

  const toggleSentence = (messageId: string, key: string, text: string) => {
    setSelected(prev => {
      const current = new Map(prev[messageId] ?? []);
      if (current.has(key)) current.delete(key);
      else current.set(key, text);
      return { ...prev, [messageId]: current };
    });
  };

  const critique = (messageId: string) => {
    if (!active) return;
    const picked = selected[messageId];
    if (!picked || picked.size === 0) return;
    const quoted = [...picked.values()].map(sentence => `"${sentence.trim()}"`).join(" ");
    controller.postToThinkTank(
      active.roundtableId,
      `Push back on this — is it actually right, and why or why not? ${quoted}`
    );
    setSelected(prev => {
      const next = { ...prev };
      delete next[messageId];
      return next;
    });
  };

  const post = () => {
    const text = draft.trim();
    if (!active || !text) return;
    controller.postToThinkTank(active.roundtableId, text);
    setDraft("");
  };

  const pushDeeper = () => {
    if (!active) return;
    controller.postToThinkTank(
      active.roundtableId,
      "Push this further — what specifically is worth researching next to settle it, and why?"
    );
  };

  const confirmDelete = (entry: ThinkTankHistoryEntryViewModel) => {
    Alert.alert(
      `Delete "${entry.roundtableName}"?`,
      "The transcript goes with it. The personas seated at it stay in your list.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => void controller.deleteThinkTankThread(entry.roundtableId),
        },
      ]
    );
  };

  // Nothing active and nothing in history — the board has genuinely nothing to show, and
  // stays out of the way rather than being one more empty panel to scroll past.
  if (!active && thinkTank.history.length === 0) return null;

  return (
    <View style={[styles.board, { borderColor: theme.line, backgroundColor: theme.panelStrong }]}>
      {/* The board's own rail — an instrument that is live, the same silhouette signal
          `StationRail`'s cards use for "this is on watch". */}
      <View style={[styles.boardRail, { backgroundColor: theme.accent }]} />

      <View style={styles.boardBody}>
        <HistoryStrip
          history={thinkTank.history}
          theme={theme}
          onSelect={id => void controller.setActiveThinkTank(id)}
          onDelete={confirmDelete}
        />

        {active ? (
          <>
            <View style={styles.head}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.eyebrow, { color: theme.accent, fontFamily: theme.fontMono }]}>
                  THINK TANK
                </Text>
                <Text style={[styles.tableName, { color: theme.text, fontFamily: theme.fontSans }]}>
                  {active.roundtableName}
                </Text>
                <Text style={[styles.hashtag, { color: theme.textFaint, fontFamily: theme.fontMono }]}>
                  #{hashtag(active.roundtableName)}
                </Text>
              </View>
              <Pressable
                accessibilityRole="switch"
                accessibilityLabel={active.reasoning ? "Turn off extended reasoning" : "Turn on extended reasoning"}
                accessibilityHint="Faster, cheaper replies with it off; more deliberate with it on. Applies to this table's next post."
                accessibilityState={{ checked: active.reasoning }}
                onPress={() => controller.setThinkTankReasoning(active.roundtableId, !active.reasoning)}
                hitSlop={8}
                style={styles.reasoningToggle}
              >
                <Text style={styles.reasoningGlyph}>{active.reasoning ? "🧠" : "⚡"}</Text>
              </Pressable>
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

            {active.isEmpty ? (
              <Text style={[styles.empty, { color: theme.textMuted, fontFamily: theme.fontSans }]}>
                Convening…
              </Text>
            ) : (
              active.messages.map((message, index) => (
                <Post
                  key={message.id}
                  bearing={bearingFor(index)}
                  roundtableId={active.roundtableId}
                  message={message}
                  theme={theme}
                  controller={controller}
                  index={index}
                  tone={message.personaName ? tones.get(message.personaName) : undefined}
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

            {active.error ? (
              <Text style={[styles.error, { color: theme.danger, fontFamily: theme.fontSans }]}>
                {active.error}
              </Text>
            ) : null}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Push the table to research further"
              accessibilityState={{ disabled: active.isThinking }}
              disabled={active.isThinking}
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
                accessibilityLabel={active.isThinking ? "Waiting for a reply" : "Post"}
                accessibilityState={{ disabled: !draft.trim() || active.isThinking, busy: active.isThinking }}
                onPress={post}
                disabled={!draft.trim() || active.isThinking}
                style={[
                  styles.postButton,
                  { backgroundColor: draft.trim() && !active.isThinking ? theme.accent : theme.panelMuted },
                ]}
              >
                <Text
                  style={[
                    styles.postButtonText,
                    {
                      color: draft.trim() && !active.isThinking ? theme.accentInk : theme.textMuted,
                      fontFamily: theme.fontMono,
                    },
                  ]}
                >
                  {active.isThinking ? "…" : "POST"}
                </Text>
              </Pressable>
            </View>
          </>
        ) : (
          <Text style={[styles.empty, { color: theme.textMuted, fontFamily: theme.fontSans }]}>
            Pick a past think tank above, or convene a new one.
          </Text>
        )}
      </View>
    </View>
  );
}

/**
 * A stable rail colour per voice, for the life of the thread — assigned the instant a
 * voice's first post appears and never reassigned after, so scrolling back through a long
 * thread never sees a voice change colour partway through. Cycles the same four instrument
 * tones `dutyTone` draws the Bridge rail from, so the board and the scope read as one
 * palette rather than two.
 */
function assignVoiceTones(
  messages: ThinkTankMessageViewModel[],
  theme: GriotTheme
): Map<string, string> {
  const palette = [theme.accent, theme.evidence, theme.warning, theme.danger];
  const tones = new Map<string, string>();
  for (const message of messages) {
    if (!message.personaName || tones.has(message.personaName)) continue;
    tones.set(message.personaName, palette[tones.size % palette.length]);
  }
  return tones;
}

/** `PST-01`, `PST-02`, … — the same bearing convention `designation()` gives a contact. */
function bearingFor(index: number): string {
  return `PST-${String(index + 1).padStart(2, "0")}`;
}

/**
 * The separate history, made visible: every table ever convened for this workspace, newest
 * first, each one reopenable without disturbing whichever one is currently active. Always
 * rendered when there is any history at all, even with nothing active — history you can
 * only reach after convening something new isn't really separate from that new thing.
 */
function HistoryStrip({
  history,
  theme,
  onSelect,
  onDelete,
}: {
  history: ThinkTankHistoryEntryViewModel[];
  theme: GriotTheme;
  onSelect: (roundtableId: string) => void;
  onDelete: (entry: ThinkTankHistoryEntryViewModel) => void;
}) {
  if (history.length === 0) return null;

  return (
    <View style={styles.historyBlock}>
      <View style={styles.historyHead}>
        <Text style={[styles.eyebrow, { color: theme.accent, fontFamily: theme.fontMono }]}>
          {history.length === 1 ? "1 THINK TANK" : `${history.length} THINK TANKS`}
        </Text>
        <Text style={[styles.historyHint, { color: theme.textFaint, fontFamily: theme.fontMono }]}>
          HOLD TO DELETE
        </Text>
      </View>
      <View style={styles.historyRow}>
        {history.map(entry => (
          <Pressable
            key={entry.roundtableId}
            accessibilityRole="button"
            accessibilityLabel={`Open "${entry.roundtableName}"`}
            accessibilityState={{ selected: entry.active }}
            onPress={() => onSelect(entry.roundtableId)}
            onLongPress={() => onDelete(entry)}
            delayLongPress={320}
            style={[
              styles.historyChip,
              {
                borderColor: entry.active ? theme.accent : theme.line,
                backgroundColor: entry.active ? theme.accentSoft : theme.panel,
              },
            ]}
          >
            <View
              style={[
                styles.historyDot,
                { backgroundColor: entry.active ? theme.accent : theme.textFaint },
              ]}
            />
            <View style={{ flex: 1 }}>
              <Text
                numberOfLines={1}
                style={[styles.historyChipName, { color: theme.text, fontFamily: theme.fontMono }]}
              >
                {entry.roundtableName}
              </Text>
              <Text
                style={[styles.historyChipMeta, { color: theme.textFaint, fontFamily: theme.fontMono }]}
              >
                {entry.messageCount} {entry.messageCount === 1 ? "post" : "posts"}
              </Text>
            </View>
          </Pressable>
        ))}
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
  bearing,
  roundtableId,
  message,
  theme,
  controller,
  index,
  tone,
  selected,
  onToggleSentence,
  onCritique,
}: {
  bearing: string;
  roundtableId: string;
  message: ThinkTankMessageViewModel;
  theme: GriotTheme;
  controller: GriotController;
  index: number;
  /** This voice's stable rail colour — see {@link assignVoiceTones}. Absent for a user post. */
  tone?: string;
  selected?: Map<string, string>;
  onToggleSentence?: (key: string, text: string) => void;
  onCritique: () => void;
}) {
  const isUser = message.speaker === "user";
  const rail = isUser ? theme.line : tone ?? theme.accent;

  return (
    <ArrivalView delay={Math.min(index * 30, 150)}>
      <View style={[styles.post, { borderColor: theme.line, backgroundColor: isUser ? theme.accentSoft : theme.panel }]}>
        <View style={[styles.postRail, { backgroundColor: rail }]} />

        <View style={styles.postBodyWrap}>
          <View style={styles.postHead}>
            <Text style={[styles.postBearing, { color: rail, fontFamily: theme.fontMono }]}>
              {bearing}
            </Text>
            <Text style={[styles.postAuthor, { color: theme.text, fontFamily: theme.fontMono }]}>
              {isUser ? "YOU" : message.personaName ?? "GRIOT"}
            </Text>
            {!isUser && message.personaName ? (
              <Text style={[styles.postHashtag, { color: rail, fontFamily: theme.fontMono }]}>
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
                  <TagChip
                    key={segment.tag.id}
                    theme={theme}
                    tag={segment.tag as TagViewModel}
                    onAdd={() =>
                      void controller.addThinkTankTag(roundtableId, segment.tag.messageId, segment.tag.id)
                    }
                  />
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
              <CountPulse value={selected.size}>
                <Text style={[styles.critiquePillText, { color: theme.danger, fontFamily: theme.fontMono }]}>
                  CRITIQUE ({selected.size}) →
                </Text>
              </CountPulse>
            </Pressable>
          ) : null}

          {/* Retry and rethink only make sense for a reply that actually came from a
              named voice — a user's own post has neither. */}
          {!isUser && message.personaId && !message.pending && !message.streaming ? (
            <View style={styles.postActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Retry — ask the same question again"
                onPress={() => controller.retryThinkTankReply(roundtableId, message.id)}
                style={[styles.postAction, { borderColor: theme.line }]}
              >
                <Text style={[styles.postActionText, { color: theme.textMuted, fontFamily: theme.fontMono }]}>
                  RETRY
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Ask this voice to reconsider what it just said"
                onPress={() => controller.rethinkThinkTankReply(roundtableId, message.id)}
                style={[styles.postAction, { borderColor: theme.line }]}
              >
                <Text style={[styles.postActionText, { color: theme.textMuted, fontFamily: theme.fontMono }]}>
                  🤔 RETHINK
                </Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </View>
    </ArrivalView>
  );
}

const styles = StyleSheet.create({
  board: {
    borderWidth: 1,
    borderRadius: Structure.radius,
    marginTop: 12,
    flexDirection: "row",
    overflow: "hidden",
  },
  boardRail: { width: Structure.railBold, alignSelf: "stretch" },
  boardBody: { flex: 1, padding: 12, gap: 10 },

  historyBlock: { gap: 8 },
  historyHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  historyHint: { fontSize: TypeScale.label, fontWeight: "700", letterSpacing: 0.5 },
  historyRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  historyChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    minHeight: Structure.tap,
    borderWidth: 1,
    borderRadius: Structure.radiusControl,
    paddingHorizontal: 10,
    maxWidth: 190,
  },
  historyDot: { width: 7, height: 7, borderRadius: 4 },
  historyChipName: { fontSize: TypeScale.meta, fontWeight: "800" },
  historyChipMeta: { fontSize: TypeScale.label, fontWeight: "700", marginTop: 1 },

  head: { flexDirection: "row", alignItems: "flex-start" },
  eyebrow: { fontSize: TypeScale.label, fontWeight: "900", letterSpacing: 1.4 },
  tableName: { fontSize: TypeScale.bodyStrong, fontWeight: "800", marginTop: 2 },
  hashtag: { fontSize: TypeScale.label, fontWeight: "700", marginTop: 2, letterSpacing: 0.4 },
  reasoningToggle: { minWidth: Structure.tap, minHeight: Structure.tap, alignItems: "center", justifyContent: "center" },
  reasoningGlyph: { fontSize: 20 },
  dismiss: { minWidth: Structure.tap, minHeight: Structure.tap, alignItems: "center", justifyContent: "center" },
  dismissText: { fontSize: 16, fontWeight: "900" },
  empty: { fontSize: TypeScale.meta, fontStyle: "italic" },
  error: { fontSize: TypeScale.meta, lineHeight: 19 },

  post: {
    borderWidth: 1,
    borderRadius: Structure.radiusControl,
    flexDirection: "row",
    overflow: "hidden",
  },
  postRail: { width: Structure.rail, alignSelf: "stretch" },
  postBodyWrap: { flex: 1, padding: 10, gap: 6 },
  postHead: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  postBearing: { fontSize: TypeScale.label, fontWeight: "900", letterSpacing: 0.8 },
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
