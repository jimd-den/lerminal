import React, { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import {
  DocumentModel,
  MaterialFilter,
  filterMaterials,
} from "../../../../adapters/presenters/GriotDeckPresenter";
import { Card } from "../../../../entities/card";
import { Chip, SectionLabel, Slab, SystemHeader } from "../components";
import { ContextCardRow } from "../ContextCards";
import { CaptureIntent, SharedProps } from "./types";
import { CommandSlab, ContextPanel, EmptyReadout } from "./shared";
import { styles } from "./screenStyles";

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
  const [mode, setMode] = useState<"read" | "study">("read");
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
            title="Ask GRIOT about your notes"
            code="GRIOT"
            theme={theme}
            onPress={() => {
              setActionsOpen(false);
              controller.openWorkspaceAgent();
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
        {(["read", "study"] as const).map((option) => (
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
        filtered.map((card) => (
          <ContextCardRow
            key={card.id}
            card={card}
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

