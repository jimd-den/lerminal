import React, { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import {
  LearningDeckModel,
  MaterialFilter,
  filterMaterials,
} from "../../../../adapters/presenters/LearningDeckPresenter";
import { presentMissionCanvas } from "../../../../adapters/presenters/MissionCanvasPresenter";
import { Card } from "../../../../entities/card";
import { Chip, SectionLabel, SystemHeader } from "../components";
import { MissionCanvasHeader } from "../MissionCanvas";
import { ContextCardRow } from "../ContextCards";
import { CaptureIntent, SharedProps } from "./types";
import { EmptyReadout } from "./shared";
import { styles } from "./screenStyles";

/**
 * # Space Screen — the mission workstation
 *
 * ## Business Value & Purpose
 * The home surface: what you're building, and the cards that constitute the work. The
 * mission readout sits above the stream so "where do I stand" is answered before "what
 * is here", and each card wears its semantic role rather than blending into a list.
 *
 * ## Where the action dock lives
 * Not here. The shell already owns the bottom bar — `SelectionTray` when cards are
 * selected, `BottomNavigation` otherwise — so a dock in this screen would stack a second
 * bar on top of it. Selection actions belong to the tray, which also carries delete and
 * per-action disabled reasons.
 */
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
  const materials = filterMaterials(model.rootMaterials, filter);
  const selectionMode = state.selection.size > 0;

  const mission = presentMissionCanvas(
    state.gapReport,
    model.activeSpace?.name ?? "",
  );

  const openMaterial = (card: Card) => {
    if (selectionMode) controller.toggleSelect(card.id);
    else if (card.type === "group") onOpenDocument(card.id);
    else onOpenCard(card.id);
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <SystemHeader
          eyebrow="MISSION // WORKSTATION"
          title={model.activeSpace?.name ?? "Learning space"}
          theme={theme}
          leftAction={{ label: "< LIBRARY", onPress: onBack }}
          rightAction={{ label: "+ ADD", onPress: () => onCapture("note") }}
        />

        <MissionCanvasHeader
          view={mission}
          theme={theme}
          onOpenReport={() => controller.openGapReport()}
          onDefineMission={() => controller.openGoalArchitect()}
          onRunNextAction={() =>
            void controller.dispatchSuggestedAction(
              mission.nextAction?.presetId
                ? { kind: "preflight", presetId: mission.nextAction.presetId }
                : { kind: "status" },
            )
          }
        />

        <SectionLabel theme={theme}>MATERIAL FILTER</SectionLabel>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          {(["all", "notes", "sources", "practice", "due"] as MaterialFilter[]).map(
            (option) => (
              <Chip
                key={option}
                label={option.toUpperCase()}
                active={filter === option}
                theme={theme}
                onPress={() => setFilter(option)}
              />
            ),
          )}
        </ScrollView>

        <SectionLabel
          theme={theme}
          code={`${materials.length.toString().padStart(2, "0")} CARDS`}
        >
          CONTEXT / CARDS
        </SectionLabel>
        {materials.length === 0 ? (
          <EmptyReadout theme={theme} text="Nothing matches this filter." />
        ) : (
          materials.map((card) => (
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

        {selectionMode ? (
          <Text style={[styles.selectionHint, { color: theme.textFaint }]}>
            Selected cards are the input to whatever you run next.
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}
