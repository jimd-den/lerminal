import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import Markdown from "react-native-markdown-display";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import {
  AppState,
  GriotController,
} from "../../../adapters/presenters/GriotController";
import {
  answerMatches,
  isClozeCard,
  parseClozeTemplate,
  readClozeCard,
} from "../../../entities/cloze";
import { resolveCardType } from "../../../entities/cardTypeDefinition";
import { Card } from "../../../entities/card";
import { isFailedRunCard, readFailedRunCard } from "../../../entities/failedRun";
import { TrashIcon } from "./Icons";
import { GriotTheme } from "./theme";

export function CardDetailModal({
  controller,
  state,
  theme,
}: {
  controller: GriotController;
  state: AppState;
  theme: GriotTheme;
}) {
  const card =
    state.cards.find((candidate) => candidate.id === state.openCardId) ?? null;
  const [revealed, setRevealed] = useState(false);
  const [clozeAnswers, setClozeAnswers] = useState<Record<string, string>>({});
  const [clozeChecked, setClozeChecked] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [draftTypeId, setDraftTypeId] = useState("");
  const [fieldDrafts, setFieldDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    setRevealed(false);
    setClozeAnswers({});
    setClozeChecked(false);
    setChatInput("");
    setEditing(false);
    setDraft(card?.body ?? "");
    setDraftTypeId(card?.typeId ?? card?.type ?? "");
    setFieldDrafts(card?.fields ?? {});
  }, [card?.id]);

  if (!card) return null;
  const type = resolveCardType(card.typeId ?? card.type, state.cardTypes);

  const confirmDelete = () => {
    Alert.alert(
      `Delete "${card.title}"?`,
      "This item will be permanently removed.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => void controller.deleteCard(card.id),
        },
      ],
    );
  };

  const runTransform = (command: string) => {
    controller.setSelection([card.id]);
    controller.closeCard();
    void controller.runPipeline(command);
  };

  const saveEdits = async () => {
    await controller.setCardBody(card.id, draft);
    if (draftTypeId !== (card.typeId ?? card.type))
      await controller.setCardType(card.id, draftTypeId);
    for (const field of resolveCardType(draftTypeId, state.cardTypes).fields)
      await controller.setCardField(card.id, field.key, fieldDrafts[field.key] ?? "");
    setEditing(false);
  };

  return (
    <Modal
      visible
      animationType="slide"
      onRequestClose={() => controller.closeCard()}
    >
      <SafeAreaProvider>
        <SafeAreaView
          style={[styles.root, { backgroundColor: theme.background }]}
        >
          <KeyboardAvoidingView
            style={styles.root}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
            <View style={[styles.header, { borderBottomColor: theme.line }]}>
              <View
                style={[styles.typeRail, { backgroundColor: type.color }]}
              />
              <View style={styles.headerCopy}>
                <Text
                  style={[
                    styles.typeLabel,
                    { color: type.color, fontFamily: theme.fontMono },
                  ]}
                >
                  {type.name.toUpperCase()} //{" "}
                  {card.schedule ? "SPACED" : "MATERIAL"}
                </Text>
                <Text
                  numberOfLines={1}
                  style={[
                    styles.headerTitle,
                    { color: theme.text, fontFamily: theme.fontMono },
                  ]}
                >
                  {card.title}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Delete card"
                onPress={confirmDelete}
                style={styles.headerButton}
              >
                <TrashIcon color={theme.danger} size={20} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => controller.closeCard()}
                style={styles.headerButton}
              >
                <Text
                  style={[
                    styles.headerButtonText,
                    { color: theme.accent, fontFamily: theme.fontMono },
                  ]}
                >
                  CLOSE
                </Text>
              </Pressable>
            </View>

            {card.type === "chat" ? (
              <ChatDetail
                controller={controller}
                state={state}
                theme={theme}
                cardId={card.id}
                body={card.body}
                value={chatInput}
                onChange={setChatInput}
              />
            ) : (
              <ScrollView
                style={styles.body}
                contentContainerStyle={styles.bodyContent}
                keyboardShouldPersistTaps="handled"
              >
                <Text
                  style={[
                    styles.title,
                    { color: theme.text, fontFamily: theme.fontMono },
                  ]}
                >
                  {card.title}
                </Text>

                {editing ? (
                  <View
                    style={[
                      styles.editorPanel,
                      {
                        borderColor: theme.accent,
                        backgroundColor: theme.panelStrong,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.machineLabel,
                        { color: theme.accent, fontFamily: theme.fontMono },
                      ]}
                    >
                      BODY EDITOR // WRITE
                    </Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.typePicker}
                    >
                      {state.cardTypes.map((option) => (
                        <Pressable
                          key={option.id}
                          onPress={() => setDraftTypeId(option.id)}
                          style={[
                            styles.typeChoice,
                            {
                              borderColor:
                                draftTypeId === option.id
                                  ? option.color
                                  : theme.line,
                              backgroundColor:
                                draftTypeId === option.id
                                  ? `${option.color}18`
                                  : theme.panelMuted,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.typeChoiceText,
                              {
                                color:
                                  draftTypeId === option.id
                                    ? option.color
                                    : theme.textMuted,
                                fontFamily: theme.fontMono,
                              },
                            ]}
                          >
                            {option.name.toUpperCase()}
                          </Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                    <TextInput
                      multiline
                      value={draft}
                      onChangeText={setDraft}
                      autoCapitalize="sentences"
                      style={[
                        styles.editor,
                        {
                          color: theme.text,
                          borderColor: theme.line,
                          fontFamily:
                            type.render === "html" ? theme.fontMono : undefined,
                        },
                      ]}
                    />
                    {resolveCardType(draftTypeId, state.cardTypes).fields.map(
                      (field) => (
                        <View key={field.key}>
                          <Text
                            style={[
                              styles.machineLabel,
                              {
                                color: theme.textMuted,
                                fontFamily: theme.fontMono,
                              },
                            ]}
                          >
                            {field.label.toUpperCase()}
                          </Text>
                          <TextInput
                            multiline={field.kind === "markdown"}
                            secureTextEntry={field.kind === "hidden"}
                            value={fieldDrafts[field.key] ?? ""}
                            onChangeText={(value) =>
                              setFieldDrafts((previous) => ({
                                ...previous,
                                [field.key]: value,
                              }))
                            }
                            style={[
                              styles.fieldInput,
                              { color: theme.text, borderColor: theme.line },
                            ]}
                          />
                        </View>
                      ),
                    )}
                    <View style={styles.row}>
                      <TerminalButton
                        label="SAVE"
                        primary
                        theme={theme}
                        onPress={() => void saveEdits()}
                      />
                      <TerminalButton
                        label="CANCEL"
                        theme={theme}
                        onPress={() => {
                          setDraft(card.body);
                          setEditing(false);
                        }}
                      />
                    </View>
                  </View>
                ) : isClozeCard(card) ? (
                  <ClozeDetail
                    card={card}
                    theme={theme}
                    answers={clozeAnswers}
                    checked={clozeChecked}
                    revealed={revealed}
                    onAnswers={setClozeAnswers}
                    onCheck={() => setClozeChecked(true)}
                    onReset={() => {
                      setClozeAnswers({});
                      setClozeChecked(false);
                    }}
                    onReveal={() => setRevealed((value) => !value)}
                  />
                ) : card.type === "question" ? (
                  <QuestionDetail
                    answer={card.answer ?? card.body}
                    cite={card.cite}
                    revealed={revealed}
                    theme={theme}
                    onReveal={() => setRevealed(true)}
                  />
                ) : isFailedRunCard(card) ? (
                  <FailureDetail
                    controller={controller}
                    card={card}
                    theme={theme}
                  />
                ) : card.type === "search" ? (
                  <SearchDetail
                    controller={controller}
                    state={state}
                    theme={theme}
                    body={card.body}
                    parentId={card.parentId}
                  />
                ) : type.render === "html" ? (
                  card.body.trim() ? (
                    <View
                      style={[styles.webFrame, { borderColor: theme.line }]}
                    >
                      <WebView
                        originWhitelist={["*"]}
                        source={{
                          html: buildInteractiveHtml(card.body, theme),
                        }}
                        style={{ backgroundColor: theme.panel }}
                        javaScriptEnabled
                      />
                    </View>
                  ) : (
                    <EmptyPanel
                      theme={theme}
                      text="Interactive body is empty. Use EDIT to add HTML."
                    />
                  )
                ) : (
                  <Markdown
                    style={markdownStyles(theme)}
                    rules={{ image: () => null }}
                    onLinkPress={(url) => {
                      let absoluteUrl = url;
                      try {
                        absoluteUrl = new URL(
                          url,
                          card.cite || "https://example.com",
                        ).toString();
                      } catch {}
                      void controller.extractUrlToCard(
                        absoluteUrl,
                        absoluteUrl,
                        card.parentId,
                        card.id,
                      );
                      return false;
                    }}
                  >
                    {card.body || "_No body content._"}
                  </Markdown>
                )}

                {type.fields.map((field) =>
                  card.fields?.[field.key] ? (
                    <Pressable
                      key={field.key}
                      onPress={() =>
                        field.kind === "hidden" &&
                        setRevealed((value) => !value)
                      }
                      style={[
                        styles.fieldPanel,
                        {
                          borderColor: theme.line,
                          backgroundColor: theme.panelStrong,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.machineLabel,
                          {
                            color: theme.textFaint,
                            fontFamily: theme.fontMono,
                          },
                        ]}
                      >
                        {field.label.toUpperCase()}
                      </Text>
                      {field.kind === "markdown" ? (
                        <Markdown style={markdownStyles(theme)}>
                          {card.fields?.[field.key] ?? ""}
                        </Markdown>
                      ) : (
                        <Text
                          style={[styles.fieldValue, { color: theme.text }]}
                        >
                          {field.kind === "hidden" && !revealed
                            ? "[ HIDDEN // TAP TO REVEAL ]"
                            : card.fields?.[field.key]}
                        </Text>
                      )}
                    </Pressable>
                  ) : null,
                )}

                {card.cite ? (
                  <View
                    style={[
                      styles.citation,
                      {
                        borderColor: theme.accent,
                        backgroundColor: theme.accentSoft,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.citationText,
                        { color: theme.accent, fontFamily: theme.fontMono },
                      ]}
                      numberOfLines={3}
                    >
                      SRC // {card.cite}
                    </Text>
                  </View>
                ) : null}

                {state.linkedCardsForOpenCard.length > 0 ? (
                  <LinkedNotes
                    controller={controller}
                    theme={theme}
                    links={state.linkedCardsForOpenCard}
                  />
                ) : null}
              </ScrollView>
            )}

            {card.type !== "chat" ? (
              <View
                style={[
                  styles.footer,
                  {
                    backgroundColor: theme.panelMuted,
                    borderTopColor: theme.line,
                  },
                ]}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Delete card"
                  onPress={confirmDelete}
                  style={styles.iconAction}
                >
                  <TrashIcon color={theme.danger} size={23} />
                  <Text
                    style={[
                      styles.iconActionText,
                      { color: theme.danger, fontFamily: theme.fontMono },
                    ]}
                  >
                    DELETE
                  </Text>
                </Pressable>
                <TerminalButton
                  label="EDIT"
                  theme={theme}
                  onPress={() => {
                    setDraft(card.body);
                    setEditing(true);
                  }}
                  compact
                />
                {type.render === "html" ? null : card.type === "source" ||
                  card.type === "chunk" ||
                  card.type === "note" ? (
                  <TerminalButton
                    label="HTML"
                    theme={theme}
                    onPress={() =>
                      void controller.setCardType(card.id, "interactive")
                    }
                    compact
                  />
                ) : null}
                {card.type === "source" || card.type === "note" ? (
                  <TerminalButton
                    label="CHUNK"
                    primary
                    theme={theme}
                    onPress={() => runTransform("chunk")}
                    compact
                  />
                ) : null}
                {card.type === "chunk" ? (
                  <TerminalButton
                    label="RECALL"
                    primary
                    theme={theme}
                    onPress={() => runTransform("recall")}
                    compact
                  />
                ) : null}
                {card.type === "question" && !card.schedule ? (
                  <TerminalButton
                    label="SPACE"
                    primary
                    theme={theme}
                    onPress={() => runTransform("space")}
                    compact
                  />
                ) : null}
              </View>
            ) : null}
          </KeyboardAvoidingView>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

function ChatDetail({
  controller,
  state,
  theme,
  cardId,
  body,
  value,
  onChange,
}: {
  controller: GriotController;
  state: AppState;
  theme: GriotTheme;
  cardId: string;
  body: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const messages: { role: string; content: string }[] = (() => {
    try {
      const parsed = JSON.parse(body || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  })();
  const streaming = state.chatStreamingCardId === cardId;
  return (
    <View style={styles.chatRoot}>
      <ScrollView
        style={styles.chatFeed}
        contentContainerStyle={styles.chatFeedContent}
      >
        {messages.length === 0 ? (
          <EmptyPanel
            theme={theme}
            text="Channel ready. Ask about the material in this document."
          />
        ) : null}
        {messages.map((message, index) => {
          const user = message.role === "user";
          return (
            <View
              key={`${index}-${message.role}`}
              style={[
                styles.message,
                {
                  alignSelf: user ? "flex-end" : "flex-start",
                  backgroundColor: user ? theme.accent : theme.panelStrong,
                  borderColor: user ? theme.accent : theme.line,
                },
              ]}
            >
              <Text
                style={[
                  styles.messageRole,
                  {
                    color: user ? theme.accentInk : theme.accent,
                    fontFamily: theme.fontMono,
                  },
                ]}
              >
                {user ? "YOU" : "AI"}
              </Text>
              <Text
                style={[
                  styles.messageText,
                  { color: user ? theme.accentInk : theme.text },
                ]}
              >
                {message.content || (streaming ? "_" : "")}
              </Text>
            </View>
          );
        })}
        {streaming ? (
          <ActivityIndicator
            color={theme.accent}
            style={{ alignSelf: "flex-start" }}
          />
        ) : null}
      </ScrollView>
      <View
        style={[
          styles.chatComposer,
          { borderTopColor: theme.line, backgroundColor: theme.panelMuted },
        ]}
      >
        <TextInput
          multiline
          value={value}
          onChangeText={onChange}
          placeholder="MESSAGE CHANNEL..."
          placeholderTextColor={theme.textFaint}
          style={[
            styles.chatInput,
            {
              color: theme.text,
              borderColor: theme.line,
              fontFamily: theme.fontMono,
            },
          ]}
        />
        <Pressable
          disabled={!value.trim() || streaming}
          onPress={() => {
            const submitted = value;
            onChange("");
            void controller.sendChatMessage(cardId, submitted).then((accepted) => {
              if (!accepted) onChange(submitted);
            });
          }}
          style={[
            styles.sendButton,
            {
              backgroundColor: theme.accent,
              opacity: value.trim() && !streaming ? 1 : 0.4,
            },
          ]}
        >
          <Text
            style={[
              styles.sendText,
              { color: theme.accentInk, fontFamily: theme.fontMono },
            ]}
          >
            SEND &gt;
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function ClozeDetail({
  card,
  theme,
  answers,
  checked,
  revealed,
  onAnswers,
  onCheck,
  onReset,
  onReveal,
}: any) {
  const data = readClozeCard(card);
  const correct = data.blanks.filter((blank) =>
    answerMatches(answers[blank.id] ?? "", blank),
  ).length;
  return (
    <View
      style={[
        styles.studyPanel,
        { backgroundColor: theme.panelStrong, borderColor: theme.line },
      ]}
    >
      <Text
        style={[
          styles.machineLabel,
          { color: theme.accent, fontFamily: theme.fontMono },
        ]}
      >
        CLOZE // COMPLETE
      </Text>
      <View style={styles.clozeFlow}>
        {parseClozeTemplate(data.template).map((part, index) =>
          part.kind === "text" ? (
            <Text key={index} style={[styles.clozeText, { color: theme.text }]}>
              {part.value}
            </Text>
          ) : (
            <TextInput
              key={part.id}
              value={answers[part.id] ?? ""}
              onChangeText={(value) =>
                onAnswers((previous: any) => ({
                  ...previous,
                  [part.id]: value,
                }))
              }
              editable={!checked}
              placeholder="____"
              placeholderTextColor={theme.textFaint}
              style={[
                styles.clozeInput,
                {
                  color: theme.text,
                  borderColor: checked
                    ? answerMatches(
                        answers[part.id] ?? "",
                        data.blanks.find((blank) => blank.id === part.id) ?? {
                          id: part.id,
                          answer: "",
                        },
                      )
                      ? theme.accent
                      : theme.danger
                    : theme.line,
                  fontFamily: theme.fontMono,
                },
              ]}
            />
          ),
        )}
      </View>
      {checked ? (
        <Text
          style={[
            styles.score,
            {
              color:
                correct === data.blanks.length ? theme.accent : theme.warning,
              fontFamily: theme.fontMono,
            },
          ]}
        >
          {correct}/{data.blanks.length} CORRECT
        </Text>
      ) : null}
      <View style={styles.row}>
        {!checked ? (
          <TerminalButton
            label="CHECK"
            primary
            theme={theme}
            onPress={onCheck}
          />
        ) : (
          <TerminalButton label="RETRY" theme={theme} onPress={onReset} />
        )}
        <TerminalButton
          label={revealed ? "HIDE" : "ANSWER"}
          theme={theme}
          onPress={onReveal}
        />
      </View>
      {revealed ? (
        <Text style={[styles.answer, { color: theme.accent }]}>
          {card.answer}
        </Text>
      ) : null}
    </View>
  );
}

function QuestionDetail({
  answer,
  cite,
  revealed,
  theme,
  onReveal,
}: {
  answer: string;
  cite?: string;
  revealed: boolean;
  theme: GriotTheme;
  onReveal: () => void;
}) {
  return revealed ? (
    <View
      style={[
        styles.studyPanel,
        { backgroundColor: theme.accentSoft, borderColor: theme.accent },
      ]}
    >
      <Text
        style={[
          styles.machineLabel,
          { color: theme.accent, fontFamily: theme.fontMono },
        ]}
      >
        ANSWER // REVEALED
      </Text>
      <Text style={[styles.answer, { color: theme.text }]}>{answer}</Text>
      {cite ? (
        <Text
          style={[
            styles.citationText,
            { color: theme.textMuted, fontFamily: theme.fontMono },
          ]}
        >
          {cite}
        </Text>
      ) : null}
    </View>
  ) : (
    <Pressable
      onPress={onReveal}
      style={[
        styles.veil,
        { backgroundColor: theme.panelStrong, borderColor: theme.line },
      ]}
    >
      <Text
        style={[
          styles.veilGlyph,
          { color: theme.accent, fontFamily: theme.fontMono },
        ]}
      >
        [ ? ]
      </Text>
      <Text
        style={[
          styles.veilTitle,
          { color: theme.text, fontFamily: theme.fontMono },
        ]}
      >
        ANSWER LOCKED
      </Text>
      <Text style={[styles.veilBody, { color: theme.textMuted }]}>
        Recall first, then tap to reveal.
      </Text>
    </Pressable>
  );
}

/**
 * The body of a failure card: what failed, why, and a button to run it again.
 *
 * The retry uses the inputs recorded on the card, not the current selection — see
 * `readFailedRunCard`. If those details are missing the button is withheld entirely
 * rather than offering a retry that would run something subtly different.
 */
function FailureDetail({
  controller,
  card,
  theme,
}: {
  controller: GriotController;
  card: Card;
  theme: GriotTheme;
}) {
  const details = readFailedRunCard(card);

  return (
    <View>
      <View style={[styles.failurePanel, { borderColor: theme.danger, backgroundColor: `${theme.danger}12` }]}>
        <Text style={[styles.failureLabel, { color: theme.danger, fontFamily: theme.fontMono }]}>
          WHAT WENT WRONG
        </Text>
        <Text style={[styles.failureMessage, { color: theme.text }]}>
          {details?.errorMessage ?? card.body}
        </Text>
      </View>

      {details ? (
        <>
          <Text style={[styles.failureLabel, { color: theme.textFaint, fontFamily: theme.fontMono }]}>
            OPERATION
          </Text>
          <Text selectable style={[styles.failureMono, { color: theme.textMuted, fontFamily: theme.fontMono }]}>
            {details.pipelineText}
          </Text>

          <Text style={[styles.failureLabel, { color: theme.textFaint, fontFamily: theme.fontMono }]}>
            INPUT
          </Text>
          <Text style={[styles.failureMono, { color: theme.textMuted, fontFamily: theme.fontMono }]}>
            {details.inputCardIds.length === 0
              ? "No selected cards"
              : `${details.inputCardIds.length} card${details.inputCardIds.length === 1 ? "" : "s"} — the same ones this run used`}
          </Text>

          <TerminalButton
            label="RUN IT AGAIN"
            primary
            theme={theme}
            onPress={() => void controller.rerunFailedCard(card.id)}
          />
        </>
      ) : (
        <Text style={[styles.failureMono, { color: theme.textMuted }]}>
          This record is missing the details needed to run it again.
        </Text>
      )}
    </View>
  );
}

function SearchDetail({
  controller,
  state,
  theme,
  body,
  parentId,
}: {
  controller: GriotController;
  state: AppState;
  theme: GriotTheme;
  body: string;
  parentId?: string;
}) {
  const results: { title: string; snippet: string; url: string }[] = (() => {
    try {
      const parsed = JSON.parse(body);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  })();
  return (
    <View>
      {results.map((result, index) => {
        const loading = state.pendingOperations.some(
          (operation) =>
            operation.commandName === `Extracting ${result.url}...` &&
            operation.status === "loading",
        );
        return (
          <View
            key={`${result.url}-${index}`}
            style={[
              styles.result,
              { backgroundColor: theme.panelStrong, borderColor: theme.line },
            ]}
          >
            <Text
              style={[
                styles.resultTitle,
                { color: theme.text, fontFamily: theme.fontMono },
              ]}
            >
              {result.title}
            </Text>
            <Text style={[styles.resultSnippet, { color: theme.textMuted }]}>
              {result.snippet}
            </Text>
            <Text
              numberOfLines={1}
              style={[
                styles.resultUrl,
                { color: theme.accent, fontFamily: theme.fontMono },
              ]}
            >
              {result.url}
            </Text>
            <TerminalButton
              label={loading ? "LOADING" : "EXTRACT"}
              primary
              theme={theme}
              disabled={loading}
              onPress={() =>
                void controller.extractUrlToCard(
                  result.url,
                  result.title,
                  parentId,
                )
              }
            />
          </View>
        );
      })}
    </View>
  );
}

/**
 * Compact "Linked notes" list for the currently expanded card — see
 * `GriotController.computeLinkedCardsForOpenCard`. No graph visualization, just a small
 * tappable list; omitted entirely (not rendered as an empty placeholder) when there are
 * no links, which is the caller's job (`state.linkedCardsForOpenCard.length > 0`).
 */
function LinkedNotes({
  controller,
  theme,
  links,
}: {
  controller: GriotController;
  theme: GriotTheme;
  links: Array<{ cardId: string; title: string; relation?: string }>;
}) {
  return (
    <View
      style={[
        styles.linkedPanel,
        { borderColor: theme.line, backgroundColor: theme.panelStrong },
      ]}
    >
      <Text
        style={[
          styles.machineLabel,
          { color: theme.textFaint, fontFamily: theme.fontMono },
        ]}
      >
        LINKED NOTES
      </Text>
      {links.map((link) => (
        <Pressable
          key={link.cardId}
          accessibilityRole="button"
          accessibilityLabel={`Open linked note: ${link.title}`}
          onPress={() => controller.openCard(link.cardId)}
          style={[styles.linkedRow, { borderColor: theme.line }]}
        >
          {link.relation ? (
            <Text
              style={[
                styles.linkedRelation,
                { color: theme.accent, fontFamily: theme.fontMono },
              ]}
            >
              {link.relation.toUpperCase()}
            </Text>
          ) : null}
          <Text
            numberOfLines={1}
            style={[styles.linkedTitle, { color: theme.text }]}
          >
            {link.title}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function EmptyPanel({ theme, text }: { theme: GriotTheme; text: string }) {
  return (
    <View style={[styles.empty, { borderColor: theme.line }]}>
      <Text
        style={[
          styles.machineLabel,
          { color: theme.textFaint, fontFamily: theme.fontMono },
        ]}
      >
        NO DATA
      </Text>
      <Text style={[styles.emptyText, { color: theme.textMuted }]}>{text}</Text>
    </View>
  );
}

function TerminalButton({
  label,
  theme,
  onPress,
  primary,
  compact,
  disabled,
}: {
  label: string;
  theme: GriotTheme;
  onPress: () => void;
  primary?: boolean;
  compact?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        compact && styles.buttonCompact,
        {
          backgroundColor: primary ? theme.accent : theme.panelStrong,
          borderColor: primary ? theme.accent : theme.line,
          opacity: disabled ? 0.4 : pressed ? 0.65 : 1,
        },
      ]}
    >
      <Text
        style={[
          styles.buttonText,
          {
            color: primary ? theme.accentInk : theme.text,
            fontFamily: theme.fontMono,
          },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function buildInteractiveHtml(body: string, theme: GriotTheme): string {
  if (/<html[\s>]/i.test(body)) return body;
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;padding:14px;background:${theme.panel};color:${theme.text};font-family:monospace;font-size:16px;line-height:1.5}a{color:${theme.accent}}button,input,textarea{font:inherit;border:1px solid ${theme.accent};background:${theme.panelStrong};color:${theme.text};padding:10px}</style></head><body>${body}</body></html>`;
}

function markdownStyles(theme: GriotTheme): any {
  return {
    body: { color: theme.text, fontSize: 16, lineHeight: 25 },
    heading1: {
      color: theme.text,
      fontSize: 25,
      lineHeight: 31,
      fontFamily: theme.fontMono,
      fontWeight: "700",
      marginVertical: 12,
    },
    heading2: {
      color: theme.text,
      fontSize: 21,
      lineHeight: 27,
      fontFamily: theme.fontMono,
      fontWeight: "700",
      marginVertical: 10,
    },
    heading3: {
      color: theme.text,
      fontSize: 18,
      lineHeight: 24,
      fontFamily: theme.fontMono,
      fontWeight: "700",
      marginVertical: 8,
    },
    link: { color: theme.accent },
    code_inline: {
      color: theme.accent,
      backgroundColor: theme.panelStrong,
      fontFamily: theme.fontMono,
    },
    code_block: {
      color: theme.text,
      backgroundColor: theme.panelStrong,
      borderColor: theme.line,
      borderWidth: 1,
      padding: 12,
      fontFamily: theme.fontMono,
    },
    fence: {
      color: theme.text,
      backgroundColor: theme.panelStrong,
      borderColor: theme.line,
      borderWidth: 1,
      padding: 12,
      fontFamily: theme.fontMono,
    },
  };
}

const styles = StyleSheet.create({
  failurePanel: { borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 18 },
  failureLabel: { fontSize: 12, fontWeight: "900", letterSpacing: 1.2, marginTop: 14, marginBottom: 5 },
  failureMessage: { fontSize: 16, lineHeight: 22, fontWeight: "600", marginTop: 6 },
  failureMono: { fontSize: 13, lineHeight: 19 },
  root: { flex: 1 },
  header: {
    minHeight: 84,
    borderBottomWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingTop: 10,
  },
  typeRail: {
    width: 7,
    alignSelf: "stretch",
    borderTopLeftRadius: 3,
    borderBottomRightRadius: 12,
  },
  headerCopy: { flex: 1, paddingHorizontal: 12 },
  typeLabel: { fontSize: 12, fontWeight: "900", letterSpacing: 1.2 },
  headerTitle: { fontSize: 16, fontWeight: "700", marginTop: 4 },
  headerButton: {
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  headerButtonText: { fontSize: 12, fontWeight: "900", letterSpacing: 1 },
  body: { flex: 1 },
  bodyContent: { padding: 18, paddingBottom: 40 },
  title: { fontSize: 27, lineHeight: 34, fontWeight: "800", marginBottom: 20 },
  machineLabel: { fontSize: 12, fontWeight: "900", letterSpacing: 1.2 },
  editorPanel: { borderWidth: 1, borderRadius: 8, padding: 13 },
  editor: {
    minHeight: 260,
    borderWidth: 1,
    borderRadius: 5,
    padding: 12,
    textAlignVertical: "top",
    fontSize: 15,
    lineHeight: 23,
    marginVertical: 12,
  },
  typePicker: { gap: 6, paddingVertical: 12 },
  typeChoice: {
    minHeight: 42,
    borderWidth: 1,
    borderRadius: 5,
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  typeChoiceText: { fontSize: 12, fontWeight: "900" },
  fieldInput: {
    minHeight: 52,
    borderWidth: 1,
    borderRadius: 5,
    padding: 10,
    marginTop: 7,
    marginBottom: 12,
    textAlignVertical: "top",
  },
  row: { flexDirection: "row", gap: 8, marginTop: 14 },
  button: {
    minHeight: 52,
    minWidth: 96,
    borderWidth: 1,
    borderRadius: 6,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 15,
  },
  buttonCompact: { minWidth: 65, minHeight: 50, paddingHorizontal: 9 },
  buttonText: { fontSize: 12, fontWeight: "900", letterSpacing: 0.7 },
  footer: {
    minHeight: 72,
    borderTopWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    gap: 6,
  },
  iconAction: {
    minWidth: 64,
    minHeight: 55,
    alignItems: "center",
    justifyContent: "center",
  },
  iconActionText: { fontSize: 12, fontWeight: "900", marginTop: 3 },
  studyPanel: { borderWidth: 1, borderRadius: 8, padding: 16 },
  answer: { fontSize: 18, lineHeight: 28, marginTop: 12 },
  veil: {
    minHeight: 230,
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  veilGlyph: { fontSize: 27, fontWeight: "900" },
  veilTitle: {
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 1,
    marginTop: 13,
  },
  veilBody: { fontSize: 14, marginTop: 7 },
  clozeFlow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    marginTop: 18,
  },
  clozeText: { fontSize: 17, lineHeight: 40 },
  clozeInput: {
    minWidth: 82,
    height: 38,
    borderBottomWidth: 2,
    marginHorizontal: 4,
    paddingHorizontal: 7,
    fontSize: 15,
    textAlign: "center",
  },
  score: { marginTop: 14, fontSize: 12, fontWeight: "900" },
  citation: { borderWidth: 1, borderRadius: 5, padding: 12, marginTop: 20 },
  citationText: { fontSize: 12, lineHeight: 16 },
  linkedPanel: { borderWidth: 1, borderRadius: 7, padding: 12, marginTop: 20 },
  linkedRow: {
    minHeight: 44,
    justifyContent: "center",
    borderTopWidth: 1,
    paddingVertical: 8,
    marginTop: 4,
  },
  linkedRelation: { fontSize: 11, fontWeight: "900", letterSpacing: 0.8, marginBottom: 2 },
  linkedTitle: { fontSize: 15, lineHeight: 20, fontWeight: "600" },
  fieldPanel: { borderWidth: 1, borderRadius: 6, padding: 13, marginTop: 12 },
  fieldValue: { fontSize: 15, lineHeight: 22, marginTop: 7 },
  webFrame: {
    height: 480,
    borderWidth: 1,
    borderRadius: 7,
    overflow: "hidden",
  },
  empty: {
    minHeight: 130,
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    marginTop: 8,
  },
  result: { borderWidth: 1, borderRadius: 7, padding: 14, marginBottom: 11 },
  resultTitle: { fontSize: 16, fontWeight: "800" },
  resultSnippet: { fontSize: 14, lineHeight: 20, marginTop: 7 },
  resultUrl: { fontSize: 12, marginVertical: 10 },
  chatRoot: { flex: 1 },
  chatFeed: { flex: 1 },
  chatFeedContent: { padding: 15, paddingBottom: 30 },
  message: {
    maxWidth: "88%",
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 9,
  },
  messageRole: {
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.1,
    marginBottom: 5,
  },
  messageText: { fontSize: 15, lineHeight: 22 },
  chatComposer: {
    borderTopWidth: 1,
    flexDirection: "row",
    alignItems: "flex-end",
    padding: 9,
    gap: 7,
  },
  chatInput: {
    flex: 1,
    minHeight: 52,
    maxHeight: 130,
    borderWidth: 1,
    borderRadius: 6,
    padding: 11,
    fontSize: 14,
  },
  sendButton: {
    minWidth: 79,
    minHeight: 52,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  sendText: { fontSize: 12, fontWeight: "900" },
});
