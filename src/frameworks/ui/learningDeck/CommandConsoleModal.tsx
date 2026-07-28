import React, { useEffect, useState } from "react";
import {
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
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import {
  AppState,
  LearnimalController,
} from "../../../adapters/presenters/LearnimalController";
import { LearningTheme } from "./theme";

const BUILTIN_COMMANDS: {
  name: string;
  description: string;
  category: string;
}[] = [
  {
    name: "ask",
    description: "Generate study material with AI",
    category: "LEARN",
  },
  { name: "source", description: "Import text or a URL", category: "CAPTURE" },
  {
    name: "search",
    description: "Search configured web sources",
    category: "CAPTURE",
  },
  {
    name: "chunk",
    description: "Restructure source into study chunks",
    category: "TRANSFORM",
  },
  {
    name: "split",
    description: "Faithful structural document split",
    category: "TRANSFORM",
  },
  {
    name: "recall",
    description: "Create active-recall questions",
    category: "PRACTICE",
  },
  {
    name: "cloze",
    description: "Create fill-in-the-blank practice",
    category: "PRACTICE",
  },
  {
    name: "elaborate",
    description: "Create explain-in-your-own-words practice",
    category: "PRACTICE",
  },
  {
    name: "chat",
    description: "Create a grounded conversation channel",
    category: "LEARN",
  },
  {
    name: "space",
    description: "Schedule compatible cards",
    category: "PRACTICE",
  },
  { name: "review", description: "Begin due reviews", category: "PRACTICE" },
  {
    name: "group",
    description: "Group selected material",
    category: "ORGANIZE",
  },
  {
    name: "ungroup",
    description: "Dissolve a selected group",
    category: "ORGANIZE",
  },
  {
    name: "move",
    description: "Move selected material to a space",
    category: "ORGANIZE",
  },
];

export function CommandConsoleModal({
  controller,
  state,
  theme,
}: {
  controller: LearnimalController;
  state: AppState;
  theme: LearningTheme;
}) {
  const [input, setInput] = useState("");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<"agent" | "pipeline">("agent");
  const [body, setBody] = useState("");

  const run = (pipeline: string) => {
    if (!pipeline.trim()) return;
    void controller.runPipeline(pipeline.replace(/^\//, ""));
    setInput("");
  };

  const create = () => {
    if (!name.trim() || !body.trim()) return;
    void controller.createCustomCommand({
      name,
      description,
      kind,
      systemPrompt: kind === "agent" ? body : undefined,
      body: kind === "pipeline" ? body : undefined,
    });
    setName("");
    setDescription("");
    setBody("");
    setCreating(false);
  };

  return (
    <Modal
      visible={state.isModalOpen}
      animationType="slide"
      onRequestClose={() => controller.setModalOpen(false)}
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
                  COMMAND BUS //{" "}
                  {state.selection.size
                    ? `${state.selection.size} SELECTED`
                    : "GLOBAL"}
                </Text>
                <Text
                  style={[
                    styles.title,
                    { color: theme.text, fontFamily: theme.fontMono },
                  ]}
                >
                  PIPELINE CONSOLE
                </Text>
              </View>
              <Pressable
                onPress={() => controller.setModalOpen(false)}
                style={styles.close}
              >
                <Text
                  style={[
                    styles.closeText,
                    { color: theme.accent, fontFamily: theme.fontMono },
                  ]}
                >
                  CLOSE
                </Text>
              </Pressable>
            </View>

            <ScrollView
              style={styles.body}
              contentContainerStyle={styles.content}
              keyboardShouldPersistTaps="handled"
            >
              {state.pendingOperations.length ? (
                <View
                  style={[
                    styles.pending,
                    {
                      borderColor: theme.warning,
                      backgroundColor: `${theme.warning}12`,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.sectionLabel,
                      { color: theme.warning, fontFamily: theme.fontMono },
                    ]}
                  >
                    OPERATIONS
                  </Text>
                  {state.pendingOperations.map((operation) => (
                    <View
                      key={operation.id}
                      style={[
                        styles.operationRow,
                        { borderBottomColor: theme.line },
                      ]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text
                          numberOfLines={1}
                          style={[
                            styles.operationName,
                            { color: theme.text, fontFamily: theme.fontMono },
                          ]}
                        >
                          {operation.commandName}
                        </Text>
                        <Text
                          style={[
                            styles.operationState,
                            {
                              color:
                                operation.status === "error"
                                  ? theme.danger
                                  : theme.textMuted,
                            },
                          ]}
                        >
                          {operation.status === "error"
                            ? operation.errorMessage
                            : "RUNNING"}
                        </Text>
                      </View>
                  {operation.status === "error" && operation.pipelineText && !operation.pipelineText.includes("|") ? (
                        <SmallButton
                          label="RETRY"
                          theme={theme}
                          onPress={() =>
                            void controller.retryPipeline(operation.id)
                          }
                        />
                      ) : null}
                      <SmallButton
                        label="X"
                        theme={theme}
                        onPress={() =>
                          controller.removePendingOperation(operation.id)
                        }
                      />
                    </View>
                  ))}
                </View>
              ) : null}

              <Text
                style={[
                  styles.sectionLabel,
                  { color: theme.textMuted, fontFamily: theme.fontMono },
                ]}
              >
                AI ACTIONS
              </Text>
              {state.operationPresets.map((preset) => (
                <Pressable
                  key={preset.id}
                  onPress={() => {
                    controller.setModalOpen(false);
                    controller.openPreflight(preset.id);
                  }}
                  style={({ pressed }) => [
                    styles.customRow,
                    { borderColor: theme.line },
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.commandName,
                        { color: theme.text, fontFamily: theme.fontMono },
                      ]}
                    >
                      {preset.label}
                    </Text>
                    <Text
                      style={[styles.commandDescription, { color: theme.textMuted }]}
                    >
                      {preset.purpose}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.editText,
                      {
                        color:
                          preset.defaultScope === "web"
                            ? theme.warning
                            : theme.textFaint,
                        fontFamily: theme.fontMono,
                      },
                    ]}
                  >
                    {preset.defaultScope === "web" ? "WEB" : "SCOPED"}
                  </Text>
                </Pressable>
              ))}

              <View style={[styles.sectionHead, { marginTop: 25 }]}>
                <Text
                  style={[
                    styles.sectionLabel,
                    { color: theme.textMuted, fontFamily: theme.fontMono },
                  ]}
                >
                  PINNED ROUTES
                </Text>
                <Pressable
                  onPress={() => controller.setPinEditMode(!state.pinEditMode)}
                >
                  <Text
                    style={[
                      styles.editText,
                      { color: theme.accent, fontFamily: theme.fontMono },
                    ]}
                  >
                    {state.pinEditMode ? "DONE" : "EDIT"}
                  </Text>
                </Pressable>
              </View>
              <View style={styles.chips}>
                {state.pinnedCommands.map((command) => (
                  <Pressable
                    key={command}
                    onPress={() =>
                      state.pinEditMode
                        ? controller.togglePinCommand(command)
                        : run(command)
                    }
                    style={[
                      styles.chip,
                      {
                        borderColor: theme.accent,
                        backgroundColor: theme.accentSoft,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        { color: theme.accent, fontFamily: theme.fontMono },
                      ]}
                    >
                      {state.pinEditMode ? "- " : "/"}
                      {command}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text
                style={[
                  styles.sectionLabel,
                  {
                    color: theme.textMuted,
                    fontFamily: theme.fontMono,
                    marginTop: 24,
                  },
                ]}
              >
                BUILT-IN COMMANDS
              </Text>
              {BUILTIN_COMMANDS.map((command) => (
                <CommandRow
                  key={command.name}
                  name={command.name}
                  description={command.description}
                  category={command.category}
                  pinned={state.pinnedCommands.includes(command.name)}
                  theme={theme}
                  onRun={() => run(command.name)}
                  onPin={() => controller.togglePinCommand(command.name)}
                />
              ))}

              <View style={[styles.sectionHead, { marginTop: 25 }]}>
                <Text
                  style={[
                    styles.sectionLabel,
                    { color: theme.textMuted, fontFamily: theme.fontMono },
                  ]}
                >
                  CUSTOM COMMANDS
                </Text>
                <Pressable onPress={() => setCreating((value) => !value)}>
                  <Text
                    style={[
                      styles.editText,
                      { color: theme.accent, fontFamily: theme.fontMono },
                    ]}
                  >
                    {creating ? "CANCEL" : "+ NEW"}
                  </Text>
                </Pressable>
              </View>

              {creating ? (
                <View
                  style={[
                    styles.form,
                    {
                      borderColor: theme.accent,
                      backgroundColor: theme.panelStrong,
                    },
                  ]}
                >
                  <TextInput
                    value={name}
                    onChangeText={setName}
                    autoCapitalize="none"
                    placeholder="command-name"
                    placeholderTextColor={theme.textFaint}
                    style={[
                      styles.input,
                      {
                        color: theme.text,
                        borderColor: theme.line,
                        fontFamily: theme.fontMono,
                      },
                    ]}
                  />
                  <TextInput
                    value={description}
                    onChangeText={setDescription}
                    placeholder="Description"
                    placeholderTextColor={theme.textFaint}
                    style={[
                      styles.input,
                      { color: theme.text, borderColor: theme.line },
                    ]}
                  />
                  <View style={styles.kindRow}>
                    {(["agent", "pipeline"] as const).map((option) => (
                      <Pressable
                        key={option}
                        onPress={() => setKind(option)}
                        style={[
                          styles.kind,
                          {
                            borderColor:
                              kind === option ? theme.accent : theme.line,
                            backgroundColor:
                              kind === option
                                ? theme.accentSoft
                                : theme.panelMuted,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.kindText,
                            {
                              color:
                                kind === option
                                  ? theme.accent
                                  : theme.textMuted,
                              fontFamily: theme.fontMono,
                            },
                          ]}
                        >
                          {option.toUpperCase()}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <TextInput
                    multiline
                    value={body}
                    onChangeText={setBody}
                    placeholder={
                      kind === "agent"
                        ? "System instruction..."
                        : 'ask "$1" | recall | space'
                    }
                    placeholderTextColor={theme.textFaint}
                    style={[
                      styles.bodyInput,
                      {
                        color: theme.text,
                        borderColor: theme.line,
                        fontFamily: theme.fontMono,
                      },
                    ]}
                  />
                  <Pressable
                    disabled={!name.trim() || !body.trim()}
                    onPress={create}
                    style={[
                      styles.createButton,
                      {
                        backgroundColor: theme.accent,
                        opacity: name.trim() && body.trim() ? 1 : 0.4,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.createText,
                        { color: theme.accentInk, fontFamily: theme.fontMono },
                      ]}
                    >
                      INSTALL COMMAND
                    </Text>
                  </Pressable>
                </View>
              ) : null}

              {state.commandDefinitions.length === 0 ? (
                <Text style={[styles.empty, { color: theme.textFaint }]}>
                  No custom commands installed.
                </Text>
              ) : (
                state.commandDefinitions.map((command) => (
                  <View
                    key={command.id}
                    style={[styles.customRow, { borderColor: theme.line }]}
                  >
                    <Pressable
                      onPress={() => run(command.name)}
                      style={{ flex: 1 }}
                    >
                      <Text
                        style={[
                          styles.commandName,
                          { color: theme.text, fontFamily: theme.fontMono },
                        ]}
                      >
                        /{command.name}
                      </Text>
                      <Text
                        style={[
                          styles.commandDescription,
                          { color: theme.textMuted },
                        ]}
                      >
                        {command.description}
                      </Text>
                    </Pressable>
                    <SmallButton
                      label={
                        state.pinnedCommands.includes(command.name)
                          ? "UNPIN"
                          : "PIN"
                      }
                      theme={theme}
                      onPress={() => controller.togglePinCommand(command.name)}
                    />
                    <SmallButton
                      label="DEL"
                      danger
                      theme={theme}
                      onPress={() =>
                        Alert.alert(
                          `Delete /${command.name}?`,
                          "The command definition will be removed.",
                          [
                            { text: "Cancel", style: "cancel" },
                            {
                              text: "Delete",
                              style: "destructive",
                              onPress: () =>
                                void controller.deleteCustomCommand(command.id),
                            },
                          ],
                        )
                      }
                    />
                  </View>
                ))
              )}
            </ScrollView>

            <View
              style={[
                styles.commandLine,
                {
                  backgroundColor: theme.panelMuted,
                  borderTopColor: theme.line,
                },
              ]}
            >
              <Text
                style={[
                  styles.prompt,
                  { color: theme.accent, fontFamily: theme.fontMono },
                ]}
              >
                &gt;
              </Text>
              <TextInput
                value={input}
                onChangeText={setInput}
                autoCapitalize="none"
                autoCorrect={false}
                onSubmitEditing={() => run(input)}
                placeholder="chunk | recall | space"
                placeholderTextColor={theme.textFaint}
                style={[
                  styles.commandInput,
                  { color: theme.text, fontFamily: theme.fontMono },
                ]}
              />
              <Pressable
                onPress={() => run(input)}
                disabled={!input.trim()}
                style={[
                  styles.runButton,
                  {
                    backgroundColor: theme.accent,
                    opacity: input.trim() ? 1 : 0.4,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.runText,
                    { color: theme.accentInk, fontFamily: theme.fontMono },
                  ]}
                >
                  RUN
                </Text>
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

export function PendingInputModal({
  controller,
  state,
  theme,
  onPipelineComplete,
  onCancel,
}: {
  controller: LearnimalController;
  state: AppState;
  theme: LearningTheme;
  onPipelineComplete?: () => void;
  onCancel?: () => void;
}) {
  const [value, setValue] = useState("");
  const [flags, setFlags] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => {
    if (state.isInputSheetOpen) {
      setValue("");
      setFlags([]);
      setSubmitting(false);
    }
  }, [state.isInputSheetOpen, state.pendingCommandName]);
  const command =
    state.pendingCommandName ||
    (state.inputSheetMode === "ask"
      ? "ask"
      : state.inputSheetMode === "note"
        ? "note"
        : "source");
  const submit = async () => {
    if (!value.trim() || submitting) return;
    setSubmitting(true);
    try {
      if (state.inputSheetMode === "note") {
        await controller.createNote({ content: value });
        controller.setInputSheetOpen(false);
        onPipelineComplete?.();
      } else {
        const succeeded = await controller.submitPendingPipelineInput(value, flags);
        if (succeeded) onPipelineComplete?.();
      }
    } finally {
      setSubmitting(false);
    }
  };
  const cancel = () => {
    if (submitting) return;
    controller.setInputSheetOpen(false);
    onCancel?.();
  };
  return (
    <Modal
      visible={state.isInputSheetOpen}
      transparent
      animationType="fade"
      onRequestClose={cancel}
    >
      <KeyboardAvoidingView
        style={styles.scrim}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View
          style={[
            styles.inputSheet,
            { backgroundColor: theme.panelStrong, borderColor: theme.accent },
          ]}
        >
          <Text
            style={[
              styles.status,
              { color: theme.accent, fontFamily: theme.fontMono },
            ]}
          >
            {command.toUpperCase()} // INPUT REQUIRED
          </Text>
          {command === "search" ? (
            <View style={styles.chips}>
              {Object.keys(state.searchSiteFlags).map((flag) => (
                <Pressable
                  key={flag}
                  disabled={submitting}
                  onPress={() =>
                    setFlags((current) =>
                      current.includes(flag)
                        ? current.filter((item) => item !== flag)
                        : [...current, flag],
                    )
                  }
                  style={[
                    styles.chip,
                    {
                      borderColor: flags.includes(flag)
                        ? theme.accent
                        : theme.line,
                      backgroundColor: flags.includes(flag)
                        ? theme.accentSoft
                        : theme.panelMuted,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      {
                        color: flags.includes(flag)
                          ? theme.accent
                          : theme.textMuted,
                        fontFamily: theme.fontMono,
                      },
                    ]}
                  >
                    --{flag}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          <TextInput
            autoFocus
            multiline
            editable={!submitting}
            value={value}
            onChangeText={setValue}
            placeholder="Enter input..."
            placeholderTextColor={theme.textFaint}
            style={[
              styles.pendingInput,
              {
                color: theme.text,
                borderColor: theme.line,
                fontFamily: theme.fontMono,
              },
            ]}
          />
          <View style={styles.footerRow}>
            <Pressable
              disabled={submitting}
              onPress={cancel}
              style={[styles.sheetButton, { borderColor: theme.line }]}
            >
              <Text
                style={[
                  styles.sheetButtonText,
                  { color: theme.text, fontFamily: theme.fontMono },
                ]}
              >
                CANCEL
              </Text>
            </Pressable>
            <Pressable
              disabled={!value.trim() || submitting}
              onPress={() => void submit()}
              style={[
                styles.sheetButton,
                { borderColor: theme.accent, backgroundColor: theme.accent, opacity: !value.trim() || submitting ? 0.45 : 1 },
              ]}
            >
              <Text
                style={[
                  styles.sheetButtonText,
                  { color: theme.accentInk, fontFamily: theme.fontMono },
                ]}
              >
                {submitting ? "RUNNING" : "RUN"}
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function CommandRow({
  name,
  description,
  category,
  pinned,
  theme,
  onRun,
  onPin,
}: {
  name: string;
  description: string;
  category: string;
  pinned: boolean;
  theme: LearningTheme;
  onRun: () => void;
  onPin: () => void;
}) {
  return (
    <View style={[styles.commandRow, { borderBottomColor: theme.line }]}>
      <Pressable onPress={onRun} style={styles.commandMain}>
        <Text
          style={[
            styles.commandName,
            { color: theme.text, fontFamily: theme.fontMono },
          ]}
        >
          /{name}
        </Text>
        <Text style={[styles.commandDescription, { color: theme.textMuted }]}>
          {description}
        </Text>
      </Pressable>
      <Text
        style={[
          styles.category,
          { color: theme.textFaint, fontFamily: theme.fontMono },
        ]}
      >
        {category}
      </Text>
      <Pressable onPress={onPin} style={styles.pin}>
        <Text
          style={[
            styles.pinText,
            {
              color: pinned ? theme.accent : theme.textFaint,
              fontFamily: theme.fontMono,
            },
          ]}
        >
          {pinned ? "*" : "+"}
        </Text>
      </Pressable>
    </View>
  );
}

function SmallButton({
  label,
  theme,
  onPress,
  danger,
}: {
  label: string;
  theme: LearningTheme;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.smallButton,
        { borderColor: danger ? theme.danger : theme.line },
      ]}
    >
      <Text
        style={[
          styles.smallButtonText,
          {
            color: danger ? theme.danger : theme.accent,
            fontFamily: theme.fontMono,
          },
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
    minHeight: 94,
    borderBottomWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 17,
    paddingTop: 12,
  },
  status: { fontSize: 9, fontWeight: "900", letterSpacing: 1.1 },
  title: { fontSize: 22, fontWeight: "800", marginTop: 5 },
  close: { minHeight: 50, justifyContent: "center", paddingHorizontal: 5 },
  closeText: { fontSize: 10, fontWeight: "900" },
  body: { flex: 1 },
  content: { padding: 16, paddingBottom: 35 },
  sectionHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 9,
  },
  sectionLabel: { fontSize: 10, fontWeight: "900", letterSpacing: 1.1 },
  editText: { fontSize: 10, fontWeight: "900" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 9 },
  chip: {
    minHeight: 42,
    borderWidth: 1,
    borderRadius: 5,
    justifyContent: "center",
    paddingHorizontal: 11,
  },
  chipText: { fontSize: 10, fontWeight: "900" },
  commandRow: {
    minHeight: 72,
    borderBottomWidth: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  commandMain: { flex: 1, paddingVertical: 10 },
  commandName: { fontSize: 14, fontWeight: "800" },
  commandDescription: { fontSize: 12, lineHeight: 17, marginTop: 3 },
  category: { fontSize: 8, width: 65, textAlign: "right" },
  pin: {
    width: 44,
    height: 50,
    alignItems: "center",
    justifyContent: "center",
  },
  pinText: { fontSize: 19, fontWeight: "900" },
  pending: { borderWidth: 1, borderRadius: 7, padding: 12, marginBottom: 22 },
  operationRow: {
    minHeight: 62,
    borderBottomWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  operationName: { fontSize: 12, fontWeight: "700" },
  operationState: { fontSize: 10, marginTop: 3 },
  smallButton: {
    minHeight: 40,
    minWidth: 43,
    borderWidth: 1,
    borderRadius: 5,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 7,
  },
  smallButtonText: { fontSize: 8, fontWeight: "900" },
  form: { borderWidth: 1, borderRadius: 7, padding: 12, marginBottom: 12 },
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 11,
    marginBottom: 8,
  },
  bodyInput: {
    minHeight: 150,
    borderWidth: 1,
    borderRadius: 5,
    padding: 11,
    textAlignVertical: "top",
    marginTop: 8,
  },
  kindRow: { flexDirection: "row", gap: 7 },
  kind: {
    flex: 1,
    minHeight: 46,
    borderWidth: 1,
    borderRadius: 5,
    justifyContent: "center",
    alignItems: "center",
  },
  kindText: { fontSize: 9, fontWeight: "900" },
  createButton: {
    minHeight: 54,
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 9,
  },
  createText: { fontSize: 10, fontWeight: "900", letterSpacing: 0.8 },
  customRow: {
    minHeight: 77,
    borderWidth: 1,
    borderRadius: 6,
    padding: 10,
    marginBottom: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  empty: { fontSize: 13, marginVertical: 12 },
  commandLine: {
    minHeight: 74,
    borderTopWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    padding: 9,
  },
  prompt: { fontSize: 19, fontWeight: "900", marginHorizontal: 8 },
  commandInput: { flex: 1, minHeight: 52, fontSize: 14 },
  runButton: {
    minWidth: 70,
    minHeight: 52,
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  runText: { fontSize: 10, fontWeight: "900" },
  scrim: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.72)",
    justifyContent: "center",
    padding: 18,
  },
  inputSheet: { borderWidth: 1, borderRadius: 8, padding: 15 },
  pendingInput: {
    minHeight: 180,
    borderWidth: 1,
    borderRadius: 6,
    padding: 12,
    textAlignVertical: "top",
    marginTop: 15,
    fontSize: 16,
  },
  footerRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  sheetButton: {
    flex: 1,
    minHeight: 54,
    borderWidth: 1,
    borderRadius: 5,
    justifyContent: "center",
    alignItems: "center",
  },
  sheetButtonText: { fontSize: 10, fontWeight: "900" },
});
