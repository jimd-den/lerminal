import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { LearnimalController } from "../../../../adapters/presenters/LearnimalController";
import { Chip, SectionLabel, SystemHeader } from "../components";
import { LearningTheme } from "../theme";
import { CaptureIntent } from "./types";
import { encodeCommandArg } from "./shared";
import { styles } from "./screenStyles";

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
  controller: LearnimalController;
  theme: LearningTheme;
  initialIntent: CaptureIntent;
  value: string;
  working: boolean;
  onChangeText: (value: string) => void;
  onWorkingChange: (working: boolean) => void;
  onComplete: () => void;
  onInputRequired: () => void;
}) {
  const [intent, setIntent] = useState<CaptureIntent>(initialIntent);

  useEffect(() => setIntent(initialIntent), [initialIntent]);

  const submit = async () => {
    const text = value.trim();
    if (!text || working) return;
    onWorkingChange(true);
    try {
      let succeeded = true;
      if (text.startsWith("/")) {
        succeeded = await controller.runPipeline(text.slice(1));
      } else if (intent === "note") {
        await controller.createNote({ content: text });
      } else if (intent === "ask") {
        succeeded = await controller.runPipeline(
          `ask "${encodeCommandArg(text)}"`,
        );
      } else {
        succeeded = await controller.runPipeline(
          `source "${encodeCommandArg(text)}"`,
        );
      }
      if (!succeeded) {
        if (controller.getState().isInputSheetOpen) onInputRequired();
        return;
      }
      onChangeText("");
      onComplete();
    } finally {
      onWorkingChange(false);
    }
  };

  const prompt = value.startsWith("/") ? "COMMAND" : intent.toUpperCase();
  const placeholder =
    intent === "note"
      ? "Write what you noticed..."
      : intent === "paste"
        ? "Paste a passage or long document..."
        : intent === "link"
          ? "https://..."
          : "What are you learning?";

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <SystemHeader
          eyebrow="LEARNIMAL // CAPTURE"
          title="Input terminal"
          theme={theme}
        />
        <Text style={[styles.intro, { color: theme.textMuted }]}>
          Choose an intent, enter only your material, then route it. Start with{" "}
          <Text style={{ color: theme.accent, fontFamily: theme.fontMono }}>
            /
          </Text>{" "}
          for the command layer.
        </Text>

        <SectionLabel theme={theme}>INPUT INTENT</SectionLabel>
        <View style={styles.intentGrid}>
          {(["paste", "link", "note", "ask"] as CaptureIntent[]).map(
            (option) => (
              <Chip
                key={option}
                label={option.toUpperCase()}
                active={intent === option && !value.startsWith("/")}
                theme={theme}
                onPress={() => setIntent(option)}
              />
            ),
          )}
        </View>

        <View
          style={[
            styles.terminal,
            {
              backgroundColor: theme.panelStrong,
              borderColor: value.startsWith("/") ? theme.warning : theme.accent,
            },
          ]}
        >
          <View style={styles.terminalHead}>
            <Text
              style={[
                styles.terminalMode,
                {
                  color: value.startsWith("/") ? theme.warning : theme.accent,
                  fontFamily: theme.fontMono,
                },
              ]}
            >
              {prompt} // READY
            </Text>
            <Text
              style={[
                styles.terminalCursor,
                { color: theme.textFaint, fontFamily: theme.fontMono },
              ]}
            >
              IN:01
            </Text>
          </View>
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
              styles.terminalInput,
              { color: theme.text, fontFamily: theme.fontMono },
            ]}
          />
          <Pressable
            disabled={!value.trim() || working}
            onPress={submit}
            style={({ pressed }) => [
              styles.routeButton,
              {
                backgroundColor: theme.accent,
                opacity: !value.trim() || working ? 0.4 : 1,
              },
              pressed && styles.pressed,
            ]}
          >
            {working ? (
              <ActivityIndicator color={theme.accentInk} />
            ) : (
              <>
                <Text
                  style={[
                    styles.routeGlyph,
                    { color: theme.accentInk, fontFamily: theme.fontMono },
                  ]}
                >
                  |&gt;
                </Text>
                <Text
                  style={[
                    styles.routeText,
                    { color: theme.accentInk, fontFamily: theme.fontMono },
                  ]}
                >
                  RUN / ROUTE
                </Text>
              </>
            )}
          </Pressable>
        </View>

        <SectionLabel theme={theme}>POWER COMMANDS</SectionLabel>
        <Text
          style={[
            styles.commandHelp,
            { color: theme.textMuted, fontFamily: theme.fontMono },
          ]}
        >
          /chunk /recall /cloze /group /move
        </Text>
        <Text style={[styles.commandHint, { color: theme.textFaint }]}>
          Commands operate on the current selection and can still be piped with{" "}
          <Text style={{ fontFamily: theme.fontMono, color: theme.accent }}>
            |
          </Text>
          .
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

