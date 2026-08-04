import React from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Text } from "../Typography";
import {
  AppState,
  GriotController,
} from "../../../../adapters/presenters/GriotController";
import { GriotDeckModel } from "../../../../adapters/presenters/GriotDeckPresenter";
import { presentMissionCanvas } from "../../../../adapters/presenters/MissionCanvasPresenter";
import { SectionLabel, Slab } from "../components";
import { CaptureReceipt } from "../CaptureReceipt";
import { MissionCanvasHeader } from "../MissionCanvas";
import { ContextCardRow } from "../ContextCards";
import { GriotTheme, Structure, TypeScale } from "../theme";
import { CaptureIntent, SharedProps } from "./types";
import { EmptyReadout } from "./shared";
import { styles } from "./screenStyles";
import { BRAND_NAME } from "../../../../entities/brand";

/**
 * # Deck Screen — the HUD
 *
 * ## Business Value & Purpose
 * One focused home surface, not a page of competing sections. The mission leads because
 * it's the thing every other screen ultimately reports back to; everything below it earns
 * its place by being something the mission panel and the dedicated tabs (Capture, Library,
 * Review) genuinely don't already cover.
 *
 * ## What was cut, and why
 * A "Continue Learning" hero used to sit right under the mission — nearly the same shape,
 * competing for the same attention, for a purpose (resume a review or a document) that a
 * single compact row covers just as well. A five-button "Capture Ports" grid duplicated
 * the dedicated Capture tab one swipe away. And once a mission exists, its own material
 * and a general "recent cards" list show the same cards twice — so recent cards only
 * appear when there's no mission material to show instead.
 */
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
  const hasContinuation = dueCount > 0 || Boolean(model.nextDocument);
  const continueLabel =
    dueCount > 0
      ? `${dueCount} review${dueCount === 1 ? "" : "s"} due // ${model.reviewMinutes} min`
      : model.nextDocument
        ? `Resume · ${model.nextDocument.title}`
        : "";

  const continueLearning = () => {
    if (dueCount > 0) controller.startReview();
    else if (model.nextDocument) onOpenDocument(model.nextDocument.id);
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
  // Recent cards would just repeat mission material once one exists, so it's either/or.
  const showRecent = missionCards.length === 0;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={[localStyles.topBar, { borderBottomColor: theme.line }]}>
        <View style={{ flex: 1 }}>
          <View style={localStyles.brandRow}>
            <View style={[localStyles.brandDot, { backgroundColor: theme.accent }]} />
            <Text style={[localStyles.brandName, { color: theme.text, fontFamily: theme.fontSans }]}>
              {BRAND_NAME}
            </Text>
          </View>
          <Text style={[localStyles.brandSub, { color: theme.textMuted }]}>
            {activeWorkspace?.name ?? "Untitled workspace"}
          </Text>
        </View>
        <Pressable accessibilityRole="button" onPress={onOpenSettings} hitSlop={8}>
          <Text style={[localStyles.sysTag, { color: theme.accent, fontFamily: theme.fontMono }]}>
            SYS
          </Text>
        </Pressable>
      </View>

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
        onDefineMission={() => controller.openWorkspaceAgent()}
        onRunNextAction={() =>
          void controller.dispatchSuggestedAction(
            mission.nextAction?.presetId
              ? { kind: "preflight", presetId: mission.nextAction.presetId }
              : { kind: "status" },
          )
        }
      />

      {hasContinuation ? (
        <Pressable
          accessibilityRole="button"
          onPress={continueLearning}
          style={({ pressed }) => [
            localStyles.continueRow,
            { borderColor: theme.line, backgroundColor: theme.panel },
            pressed && localStyles.pressed,
          ]}
        >
          <Text style={[localStyles.continueLabel, { color: theme.textMuted, fontFamily: theme.fontMono }]}>
            CONTINUE
          </Text>
          <Text numberOfLines={1} style={[localStyles.continueText, { color: theme.text }]}>
            {continueLabel}
          </Text>
          <Text style={[localStyles.continueArrow, { color: theme.accent }]}>→</Text>
        </Pressable>
      ) : null}

      {missionCards.length > 0 ? (
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

      {model.spaces.length > 0 ? (
        <>
          <SectionLabel
            theme={theme}
            code={`${model.spaces.length.toString().padStart(2, "0")} SPACES`}
          >
            IN PROGRESS
          </SectionLabel>
          {model.spaces.slice(0, 2).map((space) => (
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
        </>
      ) : null}

      {showRecent ? (
        <>
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
        </>
      ) : null}
    </ScrollView>
  );
}

const localStyles = StyleSheet.create({
  pressed: { opacity: 0.75 },
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
  sysTag: { fontSize: TypeScale.label, fontWeight: "900", letterSpacing: 1.3, marginTop: 3 },
  continueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: Structure.tap,
    borderWidth: 1,
    borderRadius: Structure.radiusControl,
    paddingHorizontal: 14,
    marginTop: 10,
  },
  continueLabel: { fontSize: TypeScale.label, fontWeight: "800", letterSpacing: 1 },
  continueText: { flex: 1, fontSize: TypeScale.body, fontWeight: "600" },
  continueArrow: { fontSize: 16, fontWeight: "800" },
});
