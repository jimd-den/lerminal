import React, { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import {
  LearningDeckModel,
  MaterialFilter,
  filterMaterials,
  materialLabel,
} from "../../../../adapters/presenters/LearningDeckPresenter";
import { Card } from "../../../../entities/card";
import { Chip, SectionLabel, Slab, SystemHeader } from "../components";
import { CaptureIntent, SharedProps } from "./types";
import { CommandSlab, ContextPanel, EmptyReadout } from "./shared";
import { styles } from "./screenStyles";

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

