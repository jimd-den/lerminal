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
import {
  AppState,
  LearnimalController,
} from "../../../adapters/presenters/LearnimalController";
import {
  DocumentModel,
  LearningDeckModel,
  MaterialFilter,
  filterMaterials,
  materialLabel,
} from "../../../adapters/presenters/LearningDeckPresenter";
import { Card } from "../../../entities/card";
import { Chip, SectionLabel, Slab, SystemHeader } from "./components";
import { CaptureReceipt } from "./CaptureReceipt";
import { MissionControlModule } from "./MissionControl";
import { LearningTheme } from "./theme";

export type CaptureIntent = "note" | "paste" | "link" | "ask";

interface SharedProps {
  controller: LearnimalController;
  state: AppState;
  theme: LearningTheme;
}

export function DeckScreen({
  controller,
  state,
  theme,
  model,
  onOpenSpace,
  onOpenDocument,
  onCapture,
  onOpenResult,
  onOpenSettings,
}: SharedProps & {
  model: LearningDeckModel;
  onOpenSpace: (spaceId: string) => void;
  onOpenDocument: (groupId: string) => void;
  onCapture: (intent: CaptureIntent) => void;
  onOpenResult: () => void;
  onOpenSettings: () => void;
}) {
  const dueCount = model.dueCards.length;
  const nextTitle =
    dueCount > 0
      ? (model.activeSpace?.name ?? "Today's review")
      : (model.nextDocument?.title ?? "Start a learning space");
  const nextMeta =
    dueCount > 0
      ? `${dueCount} review${dueCount === 1 ? "" : "s"} due // ${model.reviewMinutes} min`
      : model.nextDocument
        ? "Resume document // material saved"
        : "Capture a note, link, or question";

  const continueLearning = () => {
    if (dueCount > 0) controller.startReview();
    else if (model.nextDocument) onOpenDocument(model.nextDocument.id);
    else onCapture("note");
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <SystemHeader
        eyebrow="LEARNIMAL // DECK"
        title="Learning console"
        theme={theme}
        rightAction={{ label: "SYS", onPress: onOpenSettings }}
      />

      <CaptureReceipt
        controller={controller}
        state={state}
        theme={theme}
        onOpenOutput={onOpenResult}
      />


      <MissionControlModule
        controller={controller}
        state={state}
        theme={theme}
        onOpenReport={() => controller.openGapReport()}
      />

      <View
        style={[
          styles.continuePanel,
          { backgroundColor: theme.panelStrong, borderColor: theme.line },
        ]}
      >
        <View
          style={[styles.continueRail, { backgroundColor: theme.accent }]}
        />
        <Text
          style={[
            styles.kicker,
            { color: theme.accent, fontFamily: theme.fontMono },
          ]}
        >
          NEXT // CONTINUE LEARNING
        </Text>
        <Text
          style={[
            styles.heroTitle,
            { color: theme.text, fontFamily: theme.fontMono },
          ]}
        >
          {nextTitle}
        </Text>
        <Text
          style={[
            styles.heroMeta,
            { color: theme.textMuted, fontFamily: theme.fontMono },
          ]}
        >
          {nextMeta}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={continueLearning}
          style={({ pressed }) => [
            styles.beginButton,
            { backgroundColor: theme.accent },
            pressed && styles.pressed,
          ]}
        >
          <Text
            style={[
              styles.beginGlyph,
              { color: theme.accentInk, fontFamily: theme.fontMono },
            ]}
          >
            &gt;
          </Text>
          <Text
            style={[
              styles.beginText,
              { color: theme.accentInk, fontFamily: theme.fontMono },
            ]}
          >
            RUN / BEGIN
          </Text>
        </Pressable>
      </View>

      {state.pendingOperations.length > 0 ? (
        <View
          accessibilityLiveRegion="polite"
          accessibilityLabel={
            state.pendingOperations[0].status === "error"
              ? "Pipeline failed"
              : "Pipeline active"
          }
          style={[
            styles.pendingPanel,
            {
              backgroundColor:
                state.pendingOperations[0].status === "error"
                  ? `${theme.danger}12`
                  : theme.accentSoft,
              borderColor:
                state.pendingOperations[0].status === "error"
                  ? theme.danger
                  : theme.accent,
            },
          ]}
        >
          {state.pendingOperations[0].status === "loading" ? (
            <ActivityIndicator color={theme.accent} />
          ) : null}
          <View style={styles.pendingCopy}>
            <Text
              style={[
                styles.pendingTitle,
                {
                  color:
                    state.pendingOperations[0].status === "error"
                      ? theme.danger
                      : theme.text,
                },
              ]}
            >
              {state.pendingOperations[0].status === "error"
                ? "Pipeline failed"
                : "Pipeline active"}
            </Text>
            <Text
              numberOfLines={1}
              style={[
                styles.pendingMeta,
                { color: theme.textMuted, fontFamily: theme.fontMono },
              ]}
            >
              {state.pendingOperations[0].status === "error"
                ? state.pendingOperations[0].errorMessage
                : state.pendingOperations[0].commandName}
            </Text>
          </View>
          {state.pendingOperations[0].status === "error" && state.pendingOperations[0].pipelineText && !state.pendingOperations[0].pipelineText.includes("|") ? (
            <Pressable
              onPress={() =>
                void controller.retryPipeline(state.pendingOperations[0].id)
              }
              style={styles.pendingAction}
            >
              <Text
                style={[
                  styles.pendingActionText,
                  { color: theme.accent, fontFamily: theme.fontMono },
                ]}
              >
                RETRY
              </Text>
            </Pressable>
          ) : null}
          {state.pendingOperations[0].status === "error" ? (
            <Pressable
              onPress={() =>
                controller.removePendingOperation(state.pendingOperations[0].id)
              }
              style={styles.pendingAction}
            >
              <Text
                style={[
                  styles.pendingActionText,
                  { color: theme.danger, fontFamily: theme.fontMono },
                ]}
              >
                X
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <SectionLabel
        theme={theme}
        code={`${model.spaces.length.toString().padStart(2, "0")} SPACES`}
      >
        IN PROGRESS
      </SectionLabel>
      {model.spaces.slice(0, 3).map((space) => (
        <Slab
          key={space.id}
          title={space.name}
          label={space.active ? "ACTIVE SPACE" : "LEARNING SPACE"}
          meta={
            space.active
              ? `${space.materialCount ?? 0} items // ${space.dueCount ?? 0} due`
              : "Tap to load space"
          }
          theme={theme}
          onPress={() => onOpenSpace(space.id)}
        />
      ))}

      <SectionLabel theme={theme}>CAPTURE PORTS</SectionLabel>
      <View style={styles.quickGrid}>
        <QuickAction
          label="Paste text"
          code="TXT"
          theme={theme}
          onPress={() => onCapture("paste")}
        />
        <QuickAction
          label="Add link"
          code="URL"
          theme={theme}
          onPress={() => onCapture("link")}
        />
        <QuickAction
          label="Write note"
          code="NOTE"
          theme={theme}
          onPress={() => onCapture("note")}
        />
        <QuickAction
          label="Ask AI"
          code="AI"
          theme={theme}
          onPress={() => onCapture("ask")}
        />
        <QuickAction
          label="Search web"
          code="WEB"
          theme={theme}
          onPress={() => controller.openPreflight("research-web")}
        />
      </View>

      <SectionLabel theme={theme} code="LATEST 04">
        RECENT SIGNAL
      </SectionLabel>
      {model.recentCards.length === 0 ? (
        <EmptyReadout
          theme={theme}
          text="No activity yet. The capture port is ready."
        />
      ) : (
        model.recentCards.map((card) => (
          <View
            key={card.id}
            style={[styles.activityRow, { borderColor: theme.line }]}
          >
            <Text
              style={[
                styles.activityCode,
                { color: theme.accent, fontFamily: theme.fontMono },
              ]}
            >
              {materialLabel(card).slice(0, 4)}
            </Text>
            <Text
              numberOfLines={1}
              style={[styles.activityText, { color: theme.text }]}
            >
              {card.title}
            </Text>
          </View>
        ))
      )}
    </ScrollView>
  );
}

export function LibraryScreen({
  theme,
  model,
  onOpenSpace,
}: {
  theme: LearningTheme;
  model: LearningDeckModel;
  onOpenSpace: (spaceId: string) => void;
}) {
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <SystemHeader
        eyebrow="LEARNIMAL // LIBRARY"
        title="Learning spaces"
        theme={theme}
      />
      <Text style={[styles.intro, { color: theme.textMuted }]}>
        Each space is a bounded system for its sources, notes, transformations,
        and practice.
      </Text>
      <SectionLabel
        theme={theme}
        code={`${model.spaces.length.toString().padStart(2, "0")} ONLINE`}
      >
        SPACE INDEX
      </SectionLabel>
      {model.spaces.map((space, index) => (
        <Slab
          key={space.id}
          title={space.name}
          label={`${String(index + 1).padStart(2, "0")} // ${space.active ? "ACTIVE" : "STANDBY"}`}
          meta={
            space.active
              ? `${space.materialCount ?? 0} materials // ${space.dueCount ?? 0} due`
              : "Load learning context"
          }
          theme={theme}
          onPress={() => onOpenSpace(space.id)}
        />
      ))}
    </ScrollView>
  );
}

export function SpaceScreen({
  controller,
  state,
  theme,
  model,
  onBack,
  onOpenDocument,
  onOpenCard,
  onCapture,
}: SharedProps & {
  model: LearningDeckModel;
  onBack: () => void;
  onOpenDocument: (groupId: string) => void;
  onOpenCard: (cardId: string) => void;
  onCapture: (intent: CaptureIntent) => void;
}) {
  const [filter, setFilter] = useState<MaterialFilter>("all");
  const [actionsOpen, setActionsOpen] = useState(false);
  const materials = filterMaterials(model.rootMaterials, filter);
  const selectionMode = state.selection.size > 0;
  const openMaterial = (card: Card) => {
    if (selectionMode) controller.toggleSelect(card.id);
    else if (card.type === "group") onOpenDocument(card.id);
    else onOpenCard(card.id);
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <SystemHeader
        eyebrow="LIBRARY // SPACE"
        title={model.activeSpace?.name ?? "Learning space"}
        theme={theme}
        leftAction={{ label: "< LIBRARY", onPress: onBack }}
        rightAction={{
          label: actionsOpen ? "CLOSE" : "+ ADD",
          onPress: () => setActionsOpen((open) => !open),
        }}
      />
      {actionsOpen ? (
        <ContextPanel theme={theme} title="ADD TO SPACE">
          <CommandSlab
            title="Write a field note"
            code="NOTE"
            theme={theme}
            onPress={() => onCapture("note")}
          />
          <CommandSlab
            title="Paste long text"
            code="TXT"
            theme={theme}
            onPress={() => onCapture("paste")}
          />
          <CommandSlab
            title="Import a link"
            code="URL"
            theme={theme}
            onPress={() => onCapture("link")}
          />
          <CommandSlab
            title="Ask AI to start a topic"
            code="ASK"
            theme={theme}
            onPress={() => onCapture("ask")}
          />
        </ContextPanel>
      ) : null}
      <View
        style={[
          styles.spaceStatus,
          { backgroundColor: theme.panelStrong, borderColor: theme.line },
        ]}
      >
        <View>
          <Text
            style={[
              styles.kicker,
              { color: theme.accent, fontFamily: theme.fontMono },
            ]}
          >
            CONTINUE
          </Text>
          <Text style={[styles.statusTitle, { color: theme.text }]}>
            {model.dueCards.length > 0
              ? `${model.dueCards.length} due reviews`
              : "Reading context ready"}
          </Text>
        </View>
        <Pressable
          onPress={() =>
            model.dueCards.length > 0
              ? controller.startReview()
              : model.nextDocument && onOpenDocument(model.nextDocument.id)
          }
          style={({ pressed }) => [
            styles.compactButton,
            { backgroundColor: theme.accent },
            pressed && styles.pressed,
          ]}
        >
          <Text style={[styles.compactButtonText, { color: theme.accentInk }]}>
            Start
          </Text>
        </Pressable>
      </View>

      <SectionLabel theme={theme}>MATERIAL FILTER</SectionLabel>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
      >
        {(
          ["all", "notes", "sources", "practice", "due"] as MaterialFilter[]
        ).map((option) => (
          <Chip
            key={option}
            label={option.toUpperCase()}
            active={filter === option}
            theme={theme}
            onPress={() => setFilter(option)}
          />
        ))}
      </ScrollView>

      <SectionLabel
        theme={theme}
        code={`${materials.length.toString().padStart(2, "0")} ITEMS`}
      >
        MATERIALS
      </SectionLabel>
      {materials.length === 0 ? (
        <EmptyReadout theme={theme} text="Nothing matches this filter." />
      ) : (
        materials.map((card) => (
          <Slab
            key={card.id}
            title={card.title}
            label={materialLabel(card)}
            meta={
              card.type === "group"
                ? `${state.cards.filter((child) => child.parentId === card.id).length} contained items`
                : card.body
            }
            theme={theme}
            selected={state.selection.has(card.id)}
            onPress={() => openMaterial(card)}
            onLongPress={() => controller.toggleSelect(card.id)}
          />
        ))
      )}

      <SectionLabel theme={theme}>BUILD UNDERSTANDING</SectionLabel>
      <CommandSlab
        title="Ask AI about this space"
        code="ASK"
        theme={theme}
        onPress={() => onCapture("ask")}
      />
      <CommandSlab
        title="Create practice from selection"
        code="RECALL"
        theme={theme}
        onPress={() => controller.runPipeline("recall | space")}
      />
      <CommandSlab
        title="Add a field note"
        code="NOTE"
        theme={theme}
        onPress={() => onCapture("note")}
      />
    </ScrollView>
  );
}

export function DocumentScreen({
  controller,
  state,
  theme,
  document,
  onBack,
  onOpenGroup,
  onOpenCard,
  onCapture,
}: SharedProps & {
  document: DocumentModel;
  onBack: () => void;
  onOpenGroup: (groupId: string) => void;
  onOpenCard: (cardId: string) => void;
  onCapture: (intent: CaptureIntent) => void;
}) {
  const [mode, setMode] = useState<"read" | "study" | "discuss">("read");
  const [filter, setFilter] = useState<MaterialFilter>("all");
  const [actionsOpen, setActionsOpen] = useState(false);
  const selectionMode = state.selection.size > 0;
  const filtered = filterMaterials(document.materials, filter);

  const runForDocument = (
    command: string,
    target: "source" | "learning" = "learning",
  ) => {
    const targetIds =
      target === "source"
        ? [
            document.source?.id ??
              document.materials.find((card) => card.type === "note")?.id,
          ].filter((id): id is string => !!id)
        : (document.learningCards.length > 0
            ? document.learningCards
            : [document.source].filter((card): card is Card => !!card)
          ).map((card) => card.id);
    controller.setSelection(targetIds);
    void controller.runPipeline(command);
  };

  const openMaterial = (card: Card) => {
    if (selectionMode) controller.toggleSelect(card.id);
    else if (card.type === "group") onOpenGroup(card.id);
    else onOpenCard(card.id);
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <SystemHeader
        eyebrow="SPACE // DOCUMENT"
        title={document.group.title}
        theme={theme}
        leftAction={{ label: "< SPACE", onPress: onBack }}
        rightAction={{
          label: actionsOpen ? "CLOSE" : "+ ACTION",
          onPress: () => setActionsOpen((open) => !open),
        }}
      />

      {actionsOpen ? (
        <ContextPanel theme={theme} title="DOCUMENT ACTIONS">
          <CommandSlab
            title="Add a document note"
            code="NOTE"
            theme={theme}
            onPress={() => onCapture("note")}
          />
          <CommandSlab
            title="Discuss with grounded AI"
            code="CHAT"
            theme={theme}
            onPress={() => {
              setActionsOpen(false);
              setMode("discuss");
            }}
          />
          <CommandSlab
            title="Create study chunks"
            code="CHUNK"
            theme={theme}
            onPress={() => runForDocument("chunk", "source")}
          />
          <CommandSlab
            title="Assemble practice"
            code="RECALL"
            theme={theme}
            onPress={() => runForDocument("recall | space")}
          />
        </ContextPanel>
      ) : null}

      <View style={styles.modeRow}>
        {(["read", "study", "discuss"] as const).map((option) => (
          <Pressable
            key={option}
            onPress={() => setMode(option)}
            style={({ pressed }) => [
              styles.modeButton,
              {
                backgroundColor: mode === option ? theme.accent : theme.panel,
                borderColor: mode === option ? theme.accent : theme.line,
              },
              pressed && styles.pressed,
            ]}
          >
            <Text
              style={[
                styles.modeText,
                {
                  color: mode === option ? theme.accentInk : theme.textMuted,
                  fontFamily: theme.fontMono,
                },
              ]}
            >
              {option.toUpperCase()}
            </Text>
          </Pressable>
        ))}
      </View>

      <View
        style={[
          styles.overview,
          { backgroundColor: theme.panelStrong, borderColor: theme.line },
        ]}
      >
        <Text
          style={[
            styles.kicker,
            { color: theme.accent, fontFamily: theme.fontMono },
          ]}
        >
          DOCUMENT MAP
        </Text>
        <Text style={[styles.overviewText, { color: theme.text }]}>
          {document.source
            ? "Original source connected"
            : "Grouped learning material"}
        </Text>
        <Text
          style={[
            styles.overviewMeta,
            { color: theme.textMuted, fontFamily: theme.fontMono },
          ]}
        >
          {document.chunkCount} chunks // {document.practiceCount} practice //{" "}
          {document.materialCount} total
        </Text>
      </View>

      {mode === "discuss" ? (
        <View
          style={[
            styles.discussPanel,
            { backgroundColor: theme.accentSoft, borderColor: theme.accent },
          ]}
        >
          <Text style={[styles.discussTitle, { color: theme.text }]}>
            Open a grounded channel
          </Text>
          <Text style={[styles.discussBody, { color: theme.textMuted }]}>
            The assistant receives this document's material as context, not the
            whole library.
          </Text>
          <Pressable
            onPress={() => {
              controller.clearSelection();
              void controller.runPipeline(
                `chat "${encodeCommandArg(document.group.title)} discussion"`,
              );
            }}
            style={({ pressed }) => [
              styles.beginButton,
              { backgroundColor: theme.accent },
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.beginText, { color: theme.accentInk }]}>
              Discuss document
            </Text>
          </Pressable>
        </View>
      ) : null}

      {mode === "study" ? (
        <View style={styles.studyCommands}>
          <CommandSlab
            title="Assemble recall prompts"
            code="RECALL"
            theme={theme}
            onPress={() => runForDocument("recall | space")}
          />
          <CommandSlab
            title="Generate inline blanks"
            code="CLOZE"
            theme={theme}
            onPress={() => runForDocument("cloze | space")}
          />
        </View>
      ) : null}

      <SectionLabel theme={theme}>VIEW FILTER</SectionLabel>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
      >
        {(
          ["all", "notes", "sources", "practice", "due"] as MaterialFilter[]
        ).map((option) => (
          <Chip
            key={option}
            label={option.toUpperCase()}
            active={filter === option}
            theme={theme}
            onPress={() => setFilter(option)}
          />
        ))}
      </ScrollView>

      <SectionLabel
        theme={theme}
        code={`${filtered.length.toString().padStart(2, "0")} NODES`}
      >
        CONTENTS
      </SectionLabel>
      {filtered.length === 0 ? (
        <EmptyReadout
          theme={theme}
          text="No document items match this filter."
        />
      ) : (
        filtered.map((card, index) => (
          <Slab
            key={card.id}
            title={card.title}
            label={`${String(index + 1).padStart(2, "0")} // ${materialLabel(card)}`}
            meta={card.body}
            theme={theme}
            selected={state.selection.has(card.id)}
            onPress={() => openMaterial(card)}
            onLongPress={() => controller.toggleSelect(card.id)}
          />
        ))
      )}
    </ScrollView>
  );
}

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

function QuickAction({
  label,
  code,
  theme,
  onPress,
}: {
  label: string;
  code: string;
  theme: LearningTheme;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.quickAction,
        { backgroundColor: theme.panelStrong, borderColor: theme.line },
        pressed && styles.pressed,
      ]}
    >
      <Text
        style={[
          styles.quickCode,
          { color: theme.accent, fontFamily: theme.fontMono },
        ]}
      >
        {code}
      </Text>
      <Text
        style={[
          styles.quickLabel,
          { color: theme.text, fontFamily: theme.fontMono },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function CommandSlab({
  title,
  code,
  theme,
  onPress,
}: {
  title: string;
  code: string;
  theme: LearningTheme;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.commandSlab,
        { backgroundColor: theme.panelStrong, borderColor: theme.line },
        pressed && styles.pressed,
      ]}
    >
      <Text
        style={[
          styles.commandCode,
          { color: theme.accent, fontFamily: theme.fontMono },
        ]}
      >
        {code}
      </Text>
      <Text
        style={[
          styles.commandTitle,
          { color: theme.text, fontFamily: theme.fontMono },
        ]}
      >
        {title}
      </Text>
      <Text
        style={[
          styles.commandArrow,
          { color: theme.textFaint, fontFamily: theme.fontMono },
        ]}
      >
        &gt;
      </Text>
    </Pressable>
  );
}

function ContextPanel({
  title,
  theme,
  children,
}: {
  title: string;
  theme: LearningTheme;
  children: React.ReactNode;
}) {
  return (
    <View
      style={[
        styles.contextPanel,
        { backgroundColor: theme.panelMuted, borderColor: theme.accent },
      ]}
    >
      <Text
        style={[
          styles.contextTitle,
          { color: theme.accent, fontFamily: theme.fontMono },
        ]}
      >
        {title} // VALID ROUTES
      </Text>
      {children}
    </View>
  );
}

function EmptyReadout({ text, theme }: { text: string; theme: LearningTheme }) {
  return (
    <View
      style={[
        styles.empty,
        { backgroundColor: theme.panel, borderColor: theme.line },
      ]}
    >
      <Text
        style={[
          styles.emptyCode,
          { color: theme.textFaint, fontFamily: theme.fontMono },
        ]}
      >
        -- NO SIGNAL --
      </Text>
      <Text style={[styles.emptyText, { color: theme.textMuted }]}>{text}</Text>
    </View>
  );
}

function encodeCommandArg(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/"/g, '\\"').trim();
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 42 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },
  intro: { fontSize: 15, lineHeight: 22, marginHorizontal: 3, marginBottom: 4 },
  continuePanel: {
    minHeight: 235,
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    overflow: "hidden",
  },
  continueRail: { position: "absolute", left: 0, top: 0, bottom: 0, width: 9 },
  kicker: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "900",
    letterSpacing: 1.3,
  },
  heroTitle: {
    fontSize: 27,
    lineHeight: 34,
    fontWeight: "800",
    letterSpacing: -0.9,
    marginTop: 17,
    maxWidth: "94%",
  },
  heroMeta: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
    letterSpacing: 0.3,
    marginTop: 7,
  },
  beginButton: {
    minHeight: 62,
    borderTopLeftRadius: 5,
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
    borderBottomLeftRadius: 12,
    paddingHorizontal: 20,
    marginTop: 22,
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 11,
  },
  beginGlyph: { fontSize: 19, fontWeight: "900" },
  beginText: { fontSize: 17, fontWeight: "800" },
  pendingPanel: {
    minHeight: 68,
    borderRadius: 13,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    marginTop: 12,
  },
  pendingCopy: { marginLeft: 13, flex: 1 },
  pendingTitle: { fontSize: 14, fontWeight: "700" },
  pendingMeta: { marginTop: 2, fontSize: 11 },
  pendingAction: {
    minWidth: 48,
    minHeight: 48,
    justifyContent: "center",
    alignItems: "center",
  },
  pendingActionText: { fontSize: 9, fontWeight: "900" },
  quickGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  quickAction: {
    width: "48%",
    minHeight: 87,
    borderRadius: 13,
    borderWidth: 1,
    padding: 14,
    justifyContent: "space-between",
  },
  quickCode: { fontSize: 11, fontWeight: "900", letterSpacing: 1.1 },
  quickLabel: { fontSize: 15, fontWeight: "700" },
  activityRow: {
    minHeight: 52,
    borderBottomWidth: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  activityCode: {
    width: 54,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.7,
  },
  activityText: { flex: 1, fontSize: 14, fontWeight: "600" },
  spaceStatus: {
    minHeight: 88,
    borderRadius: 14,
    borderWidth: 1,
    padding: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  statusTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "700",
    marginTop: 3,
  },
  compactButton: {
    minHeight: 48,
    minWidth: 79,
    borderRadius: 9,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 12,
  },
  compactButtonText: { fontSize: 14, fontWeight: "800" },
  chipRow: { paddingRight: 12 },
  modeRow: { flexDirection: "row", gap: 7 },
  modeButton: {
    flex: 1,
    minHeight: 47,
    borderRadius: 9,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  modeText: { fontSize: 11, fontWeight: "900", letterSpacing: 0.8 },
  overview: { borderRadius: 15, borderWidth: 1, padding: 17, marginTop: 13 },
  overviewText: { fontSize: 19, fontWeight: "700", marginTop: 8 },
  overviewMeta: { fontSize: 11, marginTop: 6 },
  discussPanel: {
    borderWidth: 1,
    borderRadius: 15,
    padding: 17,
    marginTop: 13,
  },
  discussTitle: { fontSize: 20, fontWeight: "800" },
  discussBody: { fontSize: 14, lineHeight: 20, marginTop: 6 },
  studyCommands: { marginTop: 13 },
  commandSlab: {
    minHeight: 62,
    borderRadius: 11,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  commandCode: {
    width: 65,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  commandTitle: { flex: 1, fontSize: 15, fontWeight: "700" },
  commandArrow: { fontSize: 15, fontWeight: "900" },
  contextPanel: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 13,
  },
  contextTitle: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
    marginBottom: 9,
  },
  intentGrid: { flexDirection: "row", flexWrap: "wrap", rowGap: 8 },
  terminal: {
    minHeight: 330,
    borderRadius: 17,
    borderWidth: 1,
    marginTop: 17,
    padding: 16,
  },
  terminalHead: { flexDirection: "row", justifyContent: "space-between" },
  terminalMode: { fontSize: 11, fontWeight: "900", letterSpacing: 1.1 },
  terminalCursor: { fontSize: 10 },
  terminalInput: {
    minHeight: 180,
    textAlignVertical: "top",
    fontSize: 17,
    lineHeight: 26,
    paddingTop: 22,
    paddingHorizontal: 0,
  },
  routeButton: {
    minHeight: 58,
    borderRadius: 11,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  routeGlyph: { fontSize: 18, fontWeight: "900" },
  routeText: { fontSize: 16, fontWeight: "800" },
  commandHelp: { fontSize: 13, lineHeight: 24, letterSpacing: 0.3 },
  commandHint: { fontSize: 13, lineHeight: 19, marginTop: 5 },
  empty: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 13,
    padding: 22,
    alignItems: "center",
  },
  emptyCode: { fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  emptyText: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    marginTop: 7,
  },
});
