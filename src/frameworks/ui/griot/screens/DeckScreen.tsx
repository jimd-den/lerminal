import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import {
  AppState,
  GriotController,
} from "../../../../adapters/presenters/GriotController";
import {
  GriotDeckModel,
} from "../../../../adapters/presenters/GriotDeckPresenter";
import { presentMissionCanvas } from "../../../../adapters/presenters/MissionCanvasPresenter";
import { SectionLabel, Slab, SystemHeader } from "../components";
import { CaptureReceipt } from "../CaptureReceipt";
import { MissionCanvasHeader } from "../MissionCanvas";
import { ContextCardRow } from "../ContextCards";
import { GriotTheme } from "../theme";
import { CaptureIntent, SharedProps } from "./types";
import { QuickAction, EmptyReadout } from "./shared";
import { styles } from "./screenStyles";
import { systemLabel } from "../../../../entities/brand";

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
  model: GriotDeckModel;
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

  const activeWorkspace = state.workspaces.find((w) => w.id === state.activeWorkspaceId);
  const mission = presentMissionCanvas(
    state.gapReport,
    activeWorkspace?.name ?? "",
    activeWorkspace?.mission?.missionGroupId ?? null,
  );
  // The mission's own cards — "the previous card group" the HUD shows once a mission
  // exists, so the deck reflects the actual mission material rather than counters alone.
  const missionCards = mission.groupId
    ? state.cards.filter((card) => card.parentId === mission.groupId)
    : [];

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <SystemHeader
        eyebrow={systemLabel("DECK")}
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

      {/*
       * The mission is the first thing on the deck, not a small module below the fold —
       * this screen is the guide *from* which a mission gets created conversationally
       * (via the Goal Architect) and *to* which it reports back, so it leads.
       */}
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

      {mission.hasMission && missionCards.length > 0 ? (
        <>
          <SectionLabel
            theme={theme}
            code={`${missionCards.length.toString().padStart(2, "0")} CARDS`}
          >
            MISSION MATERIAL
          </SectionLabel>
          {missionCards.slice(0, 4).map((card) => (
            <ContextCardRow
              key={card.id}
              card={card}
              theme={theme}
              selected={state.selection.has(card.id)}
              onPress={() =>
                card.type === "group"
                  ? onOpenDocument(card.id)
                  : controller.toggleSelect(card.id)
              }
              onLongPress={() => controller.toggleSelect(card.id)}
            />
          ))}
          {missionCards.length > 4 && mission.groupId ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => onOpenDocument(mission.groupId!)}
              style={styles.viewAllRow}
            >
              <Text style={[styles.viewAllLink, { color: theme.accent, fontFamily: theme.fontMono }]}>
                VIEW ALL {missionCards.length} →
              </Text>
            </Pressable>
          ) : null}
        </>
      ) : null}

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

      {/* In-flight work is reported by the shell's ActivityBanner, which is visible
          on every screen — not just this one, which was the original bug. */}

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
          <ContextCardRow
            key={card.id}
            card={card}
            theme={theme}
            selected={state.selection.has(card.id)}
            onPress={() =>
              card.type === "group" ? onOpenDocument(card.id) : controller.toggleSelect(card.id)
            }
            onLongPress={() => controller.toggleSelect(card.id)}
          />
        ))
      )}
    </ScrollView>
  );
}

