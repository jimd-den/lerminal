import React, { useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Text } from "../Typography";
import {
  DocumentModel,
  MaterialFilter,
  filterMaterials,
} from "../../../../adapters/presenters/GriotDeckPresenter";
import { Card } from "../../../../entities/card";
import { Chip, SectionLabel, Slab } from "../components";
import { ContextCardRow } from "../ContextCards";
import { CaptureIntent, SharedProps } from "./types";
import { CommandSlab, ContextPanel, EmptyReadout } from "./shared";
import { styles } from "./screenStyles";
import { TypeScale } from "../theme";
import { BRAND_NAME } from "../../../../entities/brand";

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
      <View style={[localStyles.topBar, { borderBottomColor: theme.line }]}>
        <View style={{ flex: 1 }}>
          <Pressable accessibilityRole="button" onPress={onBack} hitSlop={8}>
            <Text style={[localStyles.backLink, { color: theme.accent, fontFamily: theme.fontMono }]}>
              ‹ SPACE
            </Text>
          </Pressable>
          <View style={localStyles.brandRow}>
            <View style={[localStyles.brandDot, { backgroundColor: theme.accent }]} />
            <Text
              numberOfLines={1}
              style={[localStyles.brandName, { color: theme.text, fontFamily: theme.fontSans }]}
            >
              {document.group.title}
            </Text>
          </View>
          <Text style={[localStyles.brandSub, { color: theme.textMuted }]}>
            {BRAND_NAME} // Document
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => setActionsOpen((open) => !open)}
          hitSlop={8}
        >
          <Text style={[localStyles.tag, { color: theme.accent, fontFamily: theme.fontMono }]}>
            {actionsOpen ? "CLOSE" : "+ ACTION"}
          </Text>
        </Pressable>
      </View>

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

const localStyles = StyleSheet.create({
  topBar: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingTop: 14,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  backLink: { fontSize: TypeScale.label, fontWeight: "800", letterSpacing: 0.6, marginBottom: 6 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  brandDot: { width: 9, height: 9, borderRadius: 3 },
  brandName: { fontSize: 17, fontWeight: "800", letterSpacing: 0.5 },
  brandSub: { fontSize: TypeScale.meta, marginTop: 3, lineHeight: 18, marginLeft: 18 },
  tag: { fontSize: TypeScale.label, fontWeight: "900", letterSpacing: 1.3, marginTop: 3 },
});

