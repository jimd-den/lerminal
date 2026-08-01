import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { GriotController } from "../../../../adapters/presenters/GriotController";
import { Chip } from "../components";
import { GriotTheme, Structure, TypeScale } from "../theme";
import { CaptureIntent } from "./types";
import { encodeCommandArg } from "./shared";
import { styles as screenStyles } from "./screenStyles";
import { BRAND_NAME } from "../../../../entities/brand";

/**
 * # Capture Screen — the familiar door
 *
 * ## Business Value & Purpose
 * The first minute of the app, and deliberately the least ambitious screen in it. A
 * newcomer opens a notes app because notes are safe; asking them to understand missions,
 * pipelines, and provenance before they can write anything down is how a learning tool
 * loses someone in the first thirty seconds.
 *
 * So this screen asks for one thing: put something here. Everything the app can do with
 * that material is offered *after* it is safely saved.
 *
 * ## The promise in the small print
 * The line under the input — that captured items stay yours and the app suggests rather
 * than takes over — is load-bearing, not filler. It is the first statement of the
 * contract the rest of the app keeps: nothing calls a model or reaches the network
 * without being asked.
 *
 * ## Power is present but quiet
 * Intent chips and the `/` command layer are still here, one tap below the primary path.
 * A novice never has to notice them; someone who knows what they want types `/` and gets
 * the whole pipeline. Neither audience pays for the other.
 */
export function CaptureScreen({
  controller,
  theme,
  initialIntent,
  value,
  working,
  onChangeText,
  onWorkingChange,
  onComplete,
  onInputRequired,
}: {
  controller: GriotController;
  theme: GriotTheme;
  initialIntent: CaptureIntent;
  value: string;
  working: boolean;
  onChangeText: (value: string) => void;
  onWorkingChange: (working: boolean) => void;
  onComplete: () => void;
  onInputRequired: () => void;
}) {
  const [intent, setIntent] = useState<CaptureIntent>(initialIntent);
  const [showOptions, setShowOptions] = useState(false);
  const [title, setTitle] = useState("");

  useEffect(() => setIntent(initialIntent), [initialIntent]);

  const isCommand = value.startsWith("/");

  const submit = async () => {
    const text = value.trim();
    if (!text || working) return;
    onWorkingChange(true);
    try {
      let succeeded = true;
      if (text.startsWith("/")) {
        succeeded = await controller.runPipeline(text.slice(1));
      } else if (intent === "note") {
        await controller.createNote({ content: text, title: title.trim() || undefined });
      } else if (intent === "ask") {
        succeeded = await controller.runPipeline(
          `ask "${encodeCommandArg(text)}"`,
        );
        // A model writes this card's own title; the user's request only overrides it
        // when they actually typed one — never blanks a real title to apply nothing.
        if (succeeded && title.trim()) await renamePrimaryResult(title);
      } else {
        succeeded = await controller.runPipeline(
          `source "${encodeCommandArg(text)}"`,
        );
        if (succeeded && title.trim()) await renamePrimaryResult(title);
      }
      if (!succeeded) {
        if (controller.getState().isInputSheetOpen) onInputRequired();
        return;
      }
      onChangeText("");
      setTitle("");
      onComplete();
    } finally {
      onWorkingChange(false);
    }
  };

  /** Renames the run's first created card — the one the receipt treats as representative. */
  const renamePrimaryResult = async (requestedTitle: string) => {
    const createdId = controller.getState().operationResult?.createdCardIds[0];
    if (createdId) await controller.setCardTitle(createdId, requestedTitle);
  };

  const placeholder =
    intent === "link"
      ? "https://…"
      : intent === "paste"
        ? "Paste a passage or a long document…"
        : intent === "ask"
          ? "What do you want to understand?"
          : "I want to understand how real-time renderers keep a large world responsive on mobile…";

  return (
    <KeyboardAvoidingView
      style={screenStyles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.topBar, { borderBottomColor: theme.line }]}>
          <View style={{ flex: 1 }}>
            <View style={styles.brandRow}>
              <View style={[styles.brandDot, { backgroundColor: theme.accent }]} />
              <Text
                style={[styles.brandName, { color: theme.text, fontFamily: theme.fontSans }]}
              >
                {BRAND_NAME}
              </Text>
            </View>
            <Text style={[styles.brandSub, { color: theme.textMuted }]}>
              Start anywhere. We'll find the next useful move.
            </Text>
          </View>
          <Text style={[styles.topTag, { color: theme.accent, fontFamily: theme.fontMono }]}>
            {isCommand ? "COMMAND" : "CAPTURE"}
          </Text>
        </View>

        <View style={styles.hero}>
          <Text style={[styles.eyebrow, { color: theme.accent, fontFamily: theme.fontMono }]}>
            YOUR FIRST MINUTE
          </Text>
          <Text style={[styles.headline, { color: theme.text, fontFamily: theme.fontSans }]}>
            Put one thing you want to understand or make here.
          </Text>
          <Text style={[styles.lede, { color: theme.textMuted }]}>
            A rough thought, URL, question, copied passage, or project idea is enough.
            No course setup required.
          </Text>

          {!isCommand ? (
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Give it a title (optional)"
              placeholderTextColor={theme.textFaint}
              style={[
                styles.titleInput,
                { color: theme.text, backgroundColor: theme.panelMuted, borderColor: theme.line },
              ]}
            />
          ) : null}

          <TextInput
            autoFocus
            multiline
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor={theme.textFaint}
            keyboardType={intent === "link" ? "url" : "default"}
            autoCapitalize={intent === "link" ? "none" : "sentences"}
            autoCorrect={intent !== "link"}
            style={[
              styles.input,
              {
                color: theme.text,
                backgroundColor: theme.panelMuted,
                // A typed command changes what the button will do, so the field says so
                // before it runs rather than after. It also hides the title field above,
                // so this needs the full top margin that field would otherwise carry.
                borderColor: isCommand ? theme.warning : theme.line,
                fontFamily: isCommand ? theme.fontMono : theme.fontSans,
                marginTop: isCommand ? 20 : 10,
              },
            ]}
          />

          <Text style={[styles.hint, { color: theme.textFaint }]}>
            {isCommand
              ? "This will run as a command pipeline."
              : "Captured items remain yours. The app suggests next steps; it does not take over."}
          </Text>

          <Pressable
            accessibilityRole="button"
            disabled={!value.trim() || working}
            onPress={() => void submit()}
            style={({ pressed }) => [
              styles.primary,
              {
                backgroundColor: isCommand ? theme.warning : theme.accent,
                opacity: !value.trim() || working ? 0.4 : 1,
              },
              pressed && styles.pressed,
            ]}
          >
            {working ? (
              <ActivityIndicator color={theme.accentInk} />
            ) : (
              <Text
                style={[
                  styles.primaryText,
                  { color: theme.accentInk, fontFamily: theme.fontSans },
                ]}
              >
                {isCommand ? "Run this command" : "Save to my workspace"}
              </Text>
            )}
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={() => setShowOptions(open => !open)}
            style={styles.link}
          >
            <Text style={[styles.linkText, { color: theme.textMuted }]}>
              {showOptions ? "Hide options" : "Paste a source instead"}
            </Text>
          </Pressable>

          {showOptions ? (
            <View style={styles.options}>
              <Text
                style={[
                  styles.optionsLabel,
                  { color: theme.textFaint, fontFamily: theme.fontMono },
                ]}
              >
                WHAT IS THIS?
              </Text>
              <View style={styles.intentGrid}>
                {(["note", "paste", "link", "ask"] as CaptureIntent[]).map(option => (
                  <Chip
                    key={option}
                    label={option.toUpperCase()}
                    active={intent === option && !isCommand}
                    theme={theme}
                    onPress={() => setIntent(option)}
                  />
                ))}
              </View>
              <Text style={[styles.optionsHint, { color: theme.textFaint }]}>
                Start with{" "}
                <Text style={{ color: theme.accent, fontFamily: theme.fontMono }}>/</Text>{" "}
                to run a command instead —{" "}
                <Text style={{ fontFamily: theme.fontMono }}>
                  chunk, recall, cloze, group, move
                </Text>
                . Commands operate on the current selection and compose with{" "}
                <Text style={{ color: theme.accent, fontFamily: theme.fontMono }}>|</Text>.
              </Text>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.75 },
  content: { paddingHorizontal: 18, paddingBottom: 104 },
  topBar: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingTop: 14,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  brandDot: { width: 9, height: 9, borderRadius: 3 },
  brandName: { fontSize: 17, fontWeight: "800", letterSpacing: 0.5 },
  // Indented past the dot (9) + gap (9) so the subtext starts on the same vertical
  // as the brand name it sits under, rather than hanging left of its own heading.
  brandSub: { fontSize: TypeScale.meta, marginTop: 3, lineHeight: 18, marginLeft: 18 },
  topTag: { fontSize: TypeScale.label, fontWeight: "800", letterSpacing: 1.3 },
  hero: { paddingTop: 30 },
  eyebrow: { fontSize: TypeScale.label, fontWeight: "800", letterSpacing: 1.4 },
  // Tight tracking on the headline is what gives the mockup its editorial weight.
  headline: {
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: -1,
    lineHeight: 35,
    marginTop: 12,
  },
  lede: { fontSize: 15, lineHeight: 22, marginTop: 12 },
  titleInput: {
    minHeight: Structure.tap,
    borderWidth: 1,
    borderRadius: Structure.radiusControl,
    paddingHorizontal: 14,
    fontSize: TypeScale.bodyStrong,
    fontWeight: "700",
    marginTop: 20,
  },
  input: {
    minHeight: 120,
    borderWidth: 1,
    borderRadius: Structure.radius,
    padding: 14,
    fontSize: TypeScale.body,
    lineHeight: 23,
    marginTop: 10,
    textAlignVertical: "top",
  },
  hint: { fontSize: TypeScale.meta, lineHeight: 18, marginTop: 10, marginBottom: 18 },
  primary: {
    minHeight: Structure.tapLarge,
    borderRadius: Structure.radiusControl + 2,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: { fontSize: TypeScale.bodyStrong, fontWeight: "800" },
  link: { minHeight: Structure.tap, alignItems: "center", justifyContent: "center" },
  linkText: { fontSize: TypeScale.body },
  options: { marginTop: 6, gap: 10 },
  optionsLabel: { fontSize: TypeScale.label, fontWeight: "800", letterSpacing: 1.2 },
  intentGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  optionsHint: { fontSize: TypeScale.meta, lineHeight: 19 },
});
