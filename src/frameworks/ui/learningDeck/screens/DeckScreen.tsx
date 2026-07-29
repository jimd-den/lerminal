import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import {
  AppState,
  LearnimalController,
} from "../../../../adapters/presenters/LearnimalController";
import {
  LearningDeckModel,
  materialLabel,
} from "../../../../adapters/presenters/LearningDeckPresenter";
import { SectionLabel, Slab, SystemHeader } from "../components";
import { CaptureReceipt } from "../CaptureReceipt";
import { MissionControlModule } from "../MissionControl";
import { LearningTheme } from "../theme";
import { CaptureIntent, SharedProps } from "./types";
import { QuickAction, EmptyReadout } from "./shared";
import { styles } from "./screenStyles";

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

