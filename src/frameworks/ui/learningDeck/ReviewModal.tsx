import React, { useEffect, useState } from "react";
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
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import {
  AppState,
  LearnimalController,
} from "../../../adapters/presenters/LearnimalController";
import {
  answerMatches,
  isClozeCard,
  parseClozeTemplate,
  readClozeCard,
} from "../../../entities/cloze";
import { resolveCardType } from "../../../entities/cardTypeDefinition";
import { ReviewGrade } from "../../../entities/schedule";
import { LearningTheme } from "./theme";

export function ReviewModal({
  controller,
  state,
  theme,
}: {
  controller: LearnimalController;
  state: AppState;
  theme: LearningTheme;
}) {
  const card = state.reviewQueue[state.reviewIndex] ?? null;
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState(false);
  const [explanation, setExplanation] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setAnswers({});
    setChecked(false);
    setExplanation(card?.fields?.explanation ?? "");
    setBusy(false);
  }, [card?.id]);

  if (!card) return null;
  const type = resolveCardType(card.typeId ?? card.type, state.cardTypes);
  const behavior = isClozeCard(card) ? "cloze" : type.learning;
  const cloze = behavior === "cloze" ? readClozeCard(card) : null;
  const previews = controller.getReviewPreviews(card.id);

  const reveal = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (behavior === "elaboration")
        await controller.setCardField(card.id, "explanation", explanation);
      controller.revealReviewAnswer();
    } finally {
      setBusy(false);
    }
  };

  const grade = async (value: ReviewGrade) => {
    if (busy) return;
    setBusy(true);
    try {
      await controller.gradeReview(value);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      visible={state.isReviewOpen}
      animationType="slide"
      onRequestClose={() => controller.closeReview()}
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
              <View>
                <Text
                  style={[
                    styles.status,
                    { color: theme.accent, fontFamily: theme.fontMono },
                  ]}
                >
                  REVIEW // ACTIVE
                </Text>
                <Text
                  style={[
                    styles.progress,
                    { color: theme.text, fontFamily: theme.fontMono },
                  ]}
                >
                  {String(state.reviewIndex + 1).padStart(2, "0")} /{" "}
                  {String(state.reviewQueue.length).padStart(2, "0")}
                </Text>
              </View>
              <Pressable
                disabled={busy}
                onPress={() => controller.closeReview()}
                style={[styles.endButton, busy && styles.disabled]}
              >
                <Text
                  style={[
                    styles.endText,
                    { color: theme.danger, fontFamily: theme.fontMono },
                  ]}
                >
                  END SESSION
                </Text>
              </Pressable>
            </View>

            <ScrollView
              style={styles.body}
              contentContainerStyle={styles.bodyContent}
              keyboardShouldPersistTaps="handled"
            >
              <Text
                style={[
                  styles.mode,
                  { color: type.color, fontFamily: theme.fontMono },
                ]}
              >
                {behavior === "cloze"
                  ? "FILL BLANKS"
                  : behavior === "elaboration"
                    ? "EXPLAIN"
                    : "RECALL"}{" "}
                // {type.name.toUpperCase()}
              </Text>
              {behavior !== "cloze" ? (
                <Text
                  style={[
                    styles.question,
                    { color: theme.text, fontFamily: theme.fontMono },
                  ]}
                >
                  {card.title}
                </Text>
              ) : null}

              {behavior === "cloze" && cloze ? (
                <View
                  style={[
                    styles.exercise,
                    {
                      backgroundColor: theme.panelStrong,
                      borderColor: theme.line,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.exerciseTitle,
                      { color: theme.textMuted, fontFamily: theme.fontMono },
                    ]}
                  >
                    {card.title}
                  </Text>
                  <View style={styles.clozeFlow}>
                    {parseClozeTemplate(cloze.template).map((part, index) =>
                      part.kind === "text" ? (
                        <Text
                          key={index}
                          style={[styles.clozeText, { color: theme.text }]}
                        >
                          {part.value}
                        </Text>
                      ) : (
                        <TextInput
                          key={part.id}
                          value={answers[part.id] ?? ""}
                          editable={!checked && !state.reviewRevealAnswer}
                          onChangeText={(value) =>
                            setAnswers((previous) => ({
                              ...previous,
                              [part.id]: value,
                            }))
                          }
                          placeholder="____"
                          placeholderTextColor={theme.textFaint}
                          style={[
                            styles.clozeInput,
                            {
                              color: theme.text,
                              borderColor: checked
                                ? answerMatches(
                                    answers[part.id] ?? "",
                                    cloze.blanks.find(
                                      (blank) => blank.id === part.id,
                                    ) ?? { id: part.id, answer: "" },
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
                        styles.feedback,
                        { color: theme.warning, fontFamily: theme.fontMono },
                      ]}
                    >
                      {
                        cloze.blanks.filter((blank) =>
                          answerMatches(answers[blank.id] ?? "", blank),
                        ).length
                      }
                      /{cloze.blanks.length} CORRECT
                    </Text>
                  ) : null}
                </View>
              ) : null}

              {behavior === "elaboration" ? (
                <View
                  style={[
                    styles.exercise,
                    {
                      backgroundColor: theme.panelStrong,
                      borderColor: theme.line,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.machineLabel,
                      { color: theme.accent, fontFamily: theme.fontMono },
                    ]}
                  >
                    YOUR EXPLANATION
                  </Text>
                  <TextInput
                    multiline
                    editable={!state.reviewRevealAnswer}
                    value={explanation}
                    onChangeText={setExplanation}
                    placeholder="Explain the idea in your own words..."
                    placeholderTextColor={theme.textFaint}
                    style={[
                      styles.explanationInput,
                      { color: theme.text, borderColor: theme.line },
                    ]}
                  />
                </View>
              ) : null}

              {behavior === "flashcard" && !state.reviewRevealAnswer ? (
                <View
                  style={[styles.memoryPrompt, { borderColor: theme.line }]}
                >
                  <Text
                    style={[
                      styles.memoryGlyph,
                      { color: theme.accent, fontFamily: theme.fontMono },
                    ]}
                  >
                    ?
                  </Text>
                  <Text style={[styles.memoryText, { color: theme.textMuted }]}>
                    Hold the answer in memory before revealing it.
                  </Text>
                </View>
              ) : null}

              {state.reviewRevealAnswer ? (
                <View
                  style={[
                    styles.answerPanel,
                    {
                      borderColor: theme.accent,
                      backgroundColor: theme.accentSoft,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.machineLabel,
                      { color: theme.accent, fontFamily: theme.fontMono },
                    ]}
                  >
                    {behavior === "elaboration" ? "MODEL ANSWER" : "ANSWER"}
                  </Text>
                  <Text style={[styles.answer, { color: theme.text }]}>
                    {card.answer || card.body}
                  </Text>
                  {card.cite ? (
                    <Text
                      style={[
                        styles.cite,
                        { color: theme.textMuted, fontFamily: theme.fontMono },
                      ]}
                    >
                      SRC // {card.cite}
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </ScrollView>

            <View
              style={[
                styles.footer,
                {
                  borderTopColor: theme.line,
                  backgroundColor: theme.panelMuted,
                },
              ]}
            >
              {behavior === "cloze" && !checked ? (
                <ReviewButton
                  label="CHECK ANSWERS"
                  color={theme.accent}
                  ink={theme.accentInk}
                  disabled={busy}
                  onPress={() => setChecked(true)}
                />
              ) : behavior === "cloze" &&
                checked &&
                !state.reviewRevealAnswer ? (
                <View style={styles.footerRow}>
                  <ReviewButton
                    label="TRY AGAIN"
                    color={theme.panelStrong}
                    ink={theme.text}
                    border={theme.line}
                    disabled={busy}
                    onPress={() => {
                      setAnswers({});
                      setChecked(false);
                    }}
                  />
                  <ReviewButton
                    label="REVEAL"
                    color={theme.accent}
                    ink={theme.accentInk}
                    disabled={busy}
                    onPress={() => void reveal()}
                  />
                </View>
              ) : !state.reviewRevealAnswer ? (
                <ReviewButton
                  label="REVEAL ANSWER"
                  color={theme.accent}
                  ink={theme.accentInk}
                  disabled={busy}
                  onPress={() => void reveal()}
                />
              ) : (
                <View style={styles.gradeRow}>
                  {gradeOptions(previews).map((option) => (
                    <Pressable
                      key={option.grade}
                      disabled={busy}
                      onPress={() => void grade(option.grade)}
                      style={[
                        styles.grade,
                        {
                          borderColor: option.color,
                          backgroundColor: `${option.color}18`,
                          opacity: busy ? 0.45 : 1,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.gradeLabel,
                          { color: option.color, fontFamily: theme.fontMono },
                        ]}
                      >
                        {option.label}
                      </Text>
                      <Text
                        style={[
                          styles.gradeTime,
                          {
                            color: theme.textMuted,
                            fontFamily: theme.fontMono,
                          },
                        ]}
                      >
                        {option.time}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

function gradeOptions(
  previews: ReturnType<LearnimalController["getReviewPreviews"]>,
): { grade: ReviewGrade; label: string; time: string; color: string }[] {
  return [
    {
      grade: "again",
      label: "AGAIN",
      time: previews?.again.label ?? "<10m",
      color: "#FF5F69",
    },
    {
      grade: "hard",
      label: "HARD",
      time: previews?.hard.label ?? "3d",
      color: "#FFB45B",
    },
    {
      grade: "good",
      label: "GOOD",
      time: previews?.good.label ?? "9d",
      color: "#63E6D5",
    },
    {
      grade: "easy",
      label: "EASY",
      time: previews?.easy.label ?? "18d",
      color: "#75C8FF",
    },
  ];
}

function ReviewButton({
  label,
  color,
  ink,
  onPress,
  border,
  disabled,
}: {
  label: string;
  color: string;
  ink: string;
  onPress: () => void;
  border?: string;
  disabled?: boolean;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.reviewButton,
        {
          backgroundColor: color,
          borderColor: border ?? color,
          opacity: disabled ? 0.45 : 1,
        },
      ]}
    >
      <Text
        style={[
          styles.reviewButtonText,
          { color: ink, fontFamily: "monospace" },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    minHeight: 90,
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingTop: 12,
  },
  status: { fontSize: 12, fontWeight: "900", letterSpacing: 1.2 },
  progress: { fontSize: 20, fontWeight: "800", marginTop: 4 },
  endButton: { minHeight: 50, justifyContent: "center", paddingHorizontal: 6 },
  endText: { fontSize: 12, fontWeight: "900", letterSpacing: 0.8 },
  body: { flex: 1 },
  bodyContent: { padding: 20, paddingBottom: 40 },
  mode: { fontSize: 12, fontWeight: "900", letterSpacing: 1.3 },
  question: { fontSize: 27, lineHeight: 36, fontWeight: "800", marginTop: 24 },
  exercise: { borderWidth: 1, borderRadius: 8, padding: 16, marginTop: 24 },
  exerciseTitle: { fontSize: 12, lineHeight: 18, marginBottom: 13 },
  machineLabel: { fontSize: 12, fontWeight: "900", letterSpacing: 1.1 },
  clozeFlow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center" },
  clozeText: { fontSize: 17, lineHeight: 42 },
  clozeInput: {
    minWidth: 82,
    height: 39,
    borderBottomWidth: 2,
    marginHorizontal: 4,
    paddingHorizontal: 7,
    textAlign: "center",
  },
  feedback: { fontSize: 12, fontWeight: "900", marginTop: 15 },
  explanationInput: {
    minHeight: 190,
    borderWidth: 1,
    borderRadius: 6,
    padding: 12,
    marginTop: 12,
    textAlignVertical: "top",
    fontSize: 16,
    lineHeight: 24,
  },
  memoryPrompt: {
    minHeight: 190,
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 25,
    padding: 25,
  },
  memoryGlyph: { fontSize: 36, fontWeight: "900" },
  memoryText: { fontSize: 14, textAlign: "center", marginTop: 10 },
  answerPanel: { borderWidth: 1, borderRadius: 8, padding: 17, marginTop: 24 },
  answer: { fontSize: 18, lineHeight: 28, marginTop: 12 },
  cite: { fontSize: 12, lineHeight: 15, marginTop: 14 },
  footer: {
    minHeight: 96,
    borderTopWidth: 1,
    justifyContent: "center",
    padding: 10,
  },
  footerRow: { flexDirection: "row", gap: 9 },
  reviewButton: {
    minHeight: 62,
    flex: 1,
    borderWidth: 1,
    borderRadius: 7,
    justifyContent: "center",
    alignItems: "center",
  },
  reviewButtonText: { fontSize: 12, fontWeight: "900", letterSpacing: 1 },
  gradeRow: { flexDirection: "row", gap: 6 },
  grade: {
    flex: 1,
    minHeight: 65,
    borderWidth: 1,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  gradeLabel: { fontSize: 12, fontWeight: "900" },
  gradeTime: { fontSize: 12, marginTop: 5 },
  disabled: { opacity: 0.45 },
});
