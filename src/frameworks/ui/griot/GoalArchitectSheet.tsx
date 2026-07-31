import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  AppState,
  GriotController,
} from "../../../adapters/presenters/GriotController";
import {
  InsightRow,
  LogEntry,
  WorkingMapSection,
} from "../../../adapters/presenters/GoalArchitectPresenter";
import { GriotTheme, Structure, TypeScale } from "./theme";
import { ArrivalView } from "../motion/communicative";
import { useReducedMotion } from "../useReducedMotion";

/**
 * # Goal Architect Sheet
 *
 * ## Business Value & Purpose
 * The conversation that turns an ambition into a mission: one question at a time, a
 * visible working map of what has been understood so far, and a draft that states plainly
 * it has created nothing yet.
 *
 * ## What this component is not allowed to decide
 * Nothing. Every label, every badge, every section is computed by
 * `GoalArchitectPresenter` and arrives ready to render. That is deliberate: whether a line
 * is the user's own words or a model's guess is a product promise, and a component that
 * derived it locally could quietly stop doing so. Here, a row's badge comes attached to
 * the row.
 */
export function GoalArchitectSheet({
  controller,
  state,
  theme,
}: {
  controller: GriotController;
  state: AppState;
  theme: GriotTheme;
}) {
  const view = state.goalArchitect;
  const [draft, setDraft] = useState("");
  // A local display preference, not app state: switching it never touches the
  // conversation itself, so it needs no controller round-trip and nothing to persist.
  const [mode, setMode] = useState<"chat" | "form">("chat");

  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    controller.submitGoalAnswer(text);
    setDraft("");
  };

  const skip = () => {
    controller.skipGoalQuestion();
    setDraft("");
  };

  return (
    <Modal
      visible={view.isOpen}
      animationType="slide"
      onRequestClose={() => controller.closeGoalArchitect()}
    >
      <View style={[styles.root, { backgroundColor: theme.background }]}>
        <View style={[styles.header, { borderBottomColor: theme.line }]}>
          <View style={styles.headerTop}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.eyebrow, { color: theme.accent, fontFamily: theme.fontMono }]}>
                {view.stage === "proposal" ? "DRAFT MISSION" : "MISSION INTENT"}
              </Text>
              <Text style={[styles.title, { color: theme.text, fontFamily: theme.fontSans }]}>
                Goal architect
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => controller.closeGoalArchitect()}
              style={styles.close}
            >
              <Text style={[styles.closeText, { color: theme.accent, fontFamily: theme.fontMono }]}>
                {view.dismissLabel}
              </Text>
            </Pressable>
          </View>

          {view.stage === "intent" ? (
            <View style={styles.headerControls}>
              <View style={styles.headerControlsLeft}>
                <TransmitSquare active={view.isAgentThinking} theme={theme} />
                <Text
                  numberOfLines={1}
                  style={[styles.modelTag, { color: theme.textFaint, fontFamily: theme.fontMono }]}
                >
                  MODEL: {state.selectedModel || "NOT SET"}
                </Text>
              </View>
              <View style={styles.headerControlsRight}>
                <ToggleChip
                  theme={theme}
                  label="WEB"
                  active={view.webSearchEnabled}
                  onPress={() => controller.setGoalWebSearchEnabled(!view.webSearchEnabled)}
                />
                <ModeSwitch theme={theme} mode={mode} onChange={setMode} />
              </View>
            </View>
          ) : null}
        </View>

        {view.stage === "intent" ? (
          mode === "chat" ? (
            <ChatIntentStage
              view={view}
              theme={theme}
              draft={draft}
              setDraft={setDraft}
              onSubmit={submit}
              onSkip={skip}
              onAskAgent={() => void controller.requestGoalAgentTurn()}
              onPropose={() => controller.proposeMission()}
              hasApiKey={Boolean(state.openRouterKey.trim())}
            />
          ) : (
            <ScrollView style={styles.body} contentContainerStyle={styles.content}>
              <FormIntentStage
                view={view}
                theme={theme}
                draft={draft}
                setDraft={setDraft}
                onSubmit={submit}
                onSkip={skip}
                onAskAgent={() => void controller.requestGoalAgentTurn()}
                onPropose={() => controller.proposeMission()}
              />
            </ScrollView>
          )
        ) : (
          <ScrollView style={styles.body} contentContainerStyle={styles.content}>
            <ProposalStage
              view={view}
              theme={theme}
              onBack={() => controller.backToGoalQuestions()}
              onResearch={() => controller.requestGoalResearch()}
              onAccept={() => void controller.acceptMission()}
            />
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

/** A small pulsing square — "transmitting" while a turn is in flight, idle otherwise. */
function TransmitSquare({ active, theme }: { active: boolean; theme: GriotTheme }) {
  const reducedMotion = useReducedMotion();
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!active || reducedMotion) {
      pulse.setValue(active ? 1 : 0.35);
      return;
    }
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.25, duration: 500, easing: Easing.linear, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 500, easing: Easing.linear, useNativeDriver: true }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [active, reducedMotion, pulse]);

  return (
    <Animated.View
      accessibilityLabel={active ? "Transmitting" : "Idle"}
      style={[
        styles.transmitSquare,
        { backgroundColor: theme.accent, opacity: pulse },
      ]}
    />
  );
}

/** Three dots that step through opacity in sequence — the "thinking" indicator. */
/**
 * Reveals `text` a chunk at a time — the "it's typing" feel for the live readout.
 *
 * Reveals whole words, not characters: a character-by-character crawl over a paragraph
 * takes visibly long and adds nothing but delay once the sentence is more than a few
 * words. Skipped entirely under reduced motion, and whenever `text` changes mid-reveal
 * the effect restarts from empty rather than jumping — a readout that half-shows the old
 * message and half the new one would misreport what's actually being said.
 */
function TypewriterText({
  text,
  style,
}: {
  text: string;
  style: any;
}) {
  const reducedMotion = useReducedMotion();
  const [shown, setShown] = useState(text);

  useEffect(() => {
    if (reducedMotion) {
      setShown(text);
      return;
    }
    const all = text.split(" ");
    let count = 0;
    setShown("");
    const interval = setInterval(() => {
      count += 1;
      setShown(all.slice(0, count).join(" "));
      if (count >= all.length) clearInterval(interval);
    }, 45);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, reducedMotion]);

  return <Text style={style}>{shown}</Text>;
}

function ThinkingDots({ theme }: { theme: GriotTheme }) {
  const reducedMotion = useReducedMotion();
  const dots = useRef([0, 1, 2].map(() => new Animated.Value(0.3))).current;

  useEffect(() => {
    if (reducedMotion) return;
    const animations = dots.map((dot, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(index * 180),
          Animated.timing(dot, { toValue: 1, duration: 260, easing: Easing.linear, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0.3, duration: 260, easing: Easing.linear, useNativeDriver: true }),
          Animated.delay((2 - index) * 180),
        ])
      )
    );
    animations.forEach(a => a.start());
    return () => animations.forEach(a => a.stop());
  }, [reducedMotion, dots]);

  if (reducedMotion) {
    return <Text style={[styles.centerText, { color: theme.textMuted, fontFamily: theme.fontMono }]}>…</Text>;
  }

  return (
    <View style={styles.dotsRow} accessibilityLabel="Thinking">
      {dots.map((dot, index) => (
        <Animated.View
          key={index}
          style={[styles.dot, { backgroundColor: theme.accent, opacity: dot }]}
        />
      ))}
    </View>
  );
}

function ModeSwitch({
  theme,
  mode,
  onChange,
}: {
  theme: GriotTheme;
  mode: "chat" | "form";
  onChange: (mode: "chat" | "form") => void;
}) {
  return (
    <View style={[styles.modeSwitch, { borderColor: theme.line }]}>
      {(["chat", "form"] as const).map(option => {
        const active = mode === option;
        return (
          <Pressable
            key={option}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(option)}
            style={[styles.modeOption, active && { backgroundColor: theme.accentSoft }]}
          >
            <Text
              style={[
                styles.modeOptionText,
                { color: active ? theme.accent : theme.textFaint, fontFamily: theme.fontMono },
              ]}
            >
              {option.toUpperCase()}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function ToggleChip({
  theme,
  label,
  active,
  onPress,
}: {
  theme: GriotTheme;
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[
        styles.toggleChip,
        {
          borderColor: active ? theme.evidence : theme.line,
          backgroundColor: active ? `${theme.evidence}22` : "transparent",
        },
      ]}
    >
      <Text
        style={[
          styles.toggleChipText,
          { color: active ? theme.evidence : theme.textFaint, fontFamily: theme.fontMono },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * # Chat Intent Stage — the mainframe readout
 *
 * ## Business Value & Purpose
 * The current exchange dominates the screen, centered and large, the way a terminal
 * shows you only what's happening *now*; everything already said recedes into a compact
 * log beneath it rather than scrolling away entirely. A persistent composer at the
 * bottom means there is always exactly one place to type, whether answering the app's
 * own next question or just talking — either way it becomes the next answer via the
 * same `submitAnswer` path the form uses, so nothing about the underlying, fully
 * deterministic question flow changes: only how it's presented does.
 */
function ChatIntentStage({
  view,
  theme,
  draft,
  setDraft,
  onSubmit,
  onSkip,
  onAskAgent,
  onPropose,
  hasApiKey,
}: {
  view: AppState["goalArchitect"];
  theme: GriotTheme;
  draft: string;
  setDraft: (value: string) => void;
  onSubmit: () => void;
  onSkip: () => void;
  onAskAgent: () => void;
  onPropose: () => void;
  hasApiKey: boolean;
}) {
  // Chat is a live conversation with the model, not the deterministic question bank —
  // that bank is Form mode's job, which is what keeps the flow usable with no key. So
  // chat only ever shows a question the app *asked the model for*: the one required
  // opening question (which needs no model — there's nothing to converse about yet),
  // and after that, only `agentQuestion`. Once the opening question is answered, this
  // requests the next turn automatically — the user already acted by answering, so a
  // follow-up call is a continuation of that action, not an unprompted one.
  const needsAgentTurn =
    hasApiKey &&
    view.answeredCount > 0 &&
    !view.isAgentThinking &&
    !view.isAgentQuestion &&
    !view.agentError;

  useEffect(() => {
    if (needsAgentTurn) onAskAgent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsAgentTurn]);

  const showsBankPrompt = view.answeredCount === 0;
  const liveText = view.agentError
    ? view.agentError
    : showsBankPrompt || view.isAgentQuestion
      ? view.prompt
      : !hasApiKey
        ? "This conversation needs a model to continue. Add an API key in Settings, or switch to Form mode — Form works fully without one."
        : null;
  const canType = (showsBankPrompt || view.isAgentQuestion) && !view.isAgentThinking;

  return (
    <View style={styles.chatWrap}>
      <ScrollView style={styles.body} contentContainerStyle={styles.chatContent}>
        {/* The live readout — what's happening right now, big and centered. */}
        <View style={styles.centerStage}>
          {view.isAgentThinking ? (
            <ThinkingDots theme={theme} />
          ) : (
            <ArrivalView key={liveText ?? "done"}>
              {view.isAgentQuestion ? (
                <Text style={[styles.centerBadge, { color: theme.warning, fontFamily: theme.fontMono }]}>
                  AGENT ASKS
                </Text>
              ) : view.agentError ? (
                <Text style={[styles.centerBadge, { color: theme.danger, fontFamily: theme.fontMono }]}>
                  MODEL UNAVAILABLE
                </Text>
              ) : null}
              <TypewriterText
                text={liveText ?? "That's everything I need to ask."}
                style={[styles.centerText, { color: theme.text, fontFamily: theme.fontSans }]}
              />
              {!view.agentError && (showsBankPrompt || view.isAgentQuestion) && view.rationale ? (
                <Text style={[styles.centerCaption, { color: theme.textMuted }]}>
                  {view.rationale}
                </Text>
              ) : null}
            </ArrivalView>
          )}

          {!view.isAgentThinking && canType && view.choices.length > 0 ? (
            <View style={styles.choiceRow}>
              {view.choices.map(choice => (
                <Pressable
                  key={choice}
                  accessibilityRole="button"
                  onPress={() => setDraft(choice)}
                  style={({ pressed }) => [
                    styles.choice,
                    { borderColor: theme.line, backgroundColor: theme.panelMuted },
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={[styles.choiceText, { color: theme.textMuted }]}>{choice}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          {/* A failed turn doesn't retry itself — that would hammer a bad key silently. */}
          {!view.isAgentThinking && view.agentError && hasApiKey ? (
            <GhostButton theme={theme} label="RETRY" onPress={onAskAgent} />
          ) : null}

          {/* Always reachable once there's enough to draft from — chat has no "bank
              exhausted" moment to gate this on, since it doesn't use the bank. */}
          {!view.isAgentThinking && view.canPropose ? (
            <View style={styles.actionRow}>
              <PrimaryButton theme={theme} label="DRAFT THE MISSION" onPress={onPropose} />
            </View>
          ) : null}
        </View>

        {/* What's already been decided, condensed to one tagged line each — not the
            full form replayed a second time underneath the live exchange. */}
        {view.logEntries.length > 0 ? (
          <View style={styles.log}>
            <Text style={[styles.logHeading, { color: theme.textFaint, fontFamily: theme.fontMono }]}>
              LOG
            </Text>
            {[...view.logEntries].reverse().map((entry, index) => (
              <LogLine key={index} entry={entry} theme={theme} />
            ))}
          </View>
        ) : null}

        <WorkingMap sections={view.mapSections} theme={theme} />
      </ScrollView>

      <View style={[styles.composer, { borderTopColor: theme.line, backgroundColor: theme.panel }]}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={canType ? "Type your answer…" : "Nothing open right now"}
          placeholderTextColor={theme.textFaint}
          editable={canType}
          multiline
          style={[
            styles.composerInput,
            {
              color: theme.text,
              borderColor: theme.line,
              backgroundColor: canType ? theme.panelMuted : theme.background,
              opacity: canType ? 1 : 0.5,
            },
          ]}
        />
        {view.canSkip && canType ? (
          <Pressable accessibilityRole="button" onPress={onSkip} style={styles.composerSkip}>
            <Text style={[styles.composerSkipText, { color: theme.textFaint, fontFamily: theme.fontMono }]}>
              SKIP
            </Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          disabled={!canType || !draft.trim()}
          onPress={onSubmit}
          style={({ pressed }) => [
            styles.sendButton,
            { backgroundColor: theme.accent, opacity: !canType || !draft.trim() ? 0.4 : 1 },
            pressed && styles.pressed,
          ]}
        >
          <Text style={[styles.sendButtonText, { color: theme.accentInk, fontFamily: theme.fontMono }]}>
            SEND
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function LogLine({ entry, theme }: { entry: LogEntry; theme: GriotTheme }) {
  return (
    <View style={styles.logLine}>
      <Text style={[styles.logSpeaker, { color: theme.accent, fontFamily: theme.fontMono }]}>
        {entry.tag}
      </Text>
      <Text
        numberOfLines={2}
        style={[
          styles.logText,
          { color: entry.skipped ? theme.textFaint : theme.textMuted },
          entry.skipped && { fontStyle: "italic" },
        ]}
      >
        {entry.text}
      </Text>
    </View>
  );
}

/** The original one-panel-per-question layout, kept as the FORM mode alternative to chat. */
function FormIntentStage({
  view,
  theme,
  draft,
  setDraft,
  onSubmit,
  onSkip,
  onAskAgent,
  onPropose,
}: {
  view: AppState["goalArchitect"];
  theme: GriotTheme;
  draft: string;
  setDraft: (value: string) => void;
  onSubmit: () => void;
  onSkip: () => void;
  onAskAgent: () => void;
  onPropose: () => void;
}) {
  return (
    <>
      {view.agentMessage ? (
        <Panel theme={theme} tone="agent">
          <Label theme={theme} color={theme.warning}>
            AGENT — SUGGESTIONS TO VERIFY
          </Label>
          <Text style={[styles.bodyText, { color: theme.text }]}>{view.agentMessage}</Text>
        </Panel>
      ) : null}

      {view.agentError ? (
        // An honest failure state: it says what didn't work and that nothing was lost.
        <Panel theme={theme} tone="error">
          <Label theme={theme} color={theme.danger}>
            MODEL UNAVAILABLE
          </Label>
          <Text style={[styles.bodyText, { color: theme.text }]}>{view.agentError}</Text>
        </Panel>
      ) : null}

      {view.prompt ? (
        <Panel theme={theme}>
          {view.isAgentQuestion ? (
            <Label theme={theme} color={theme.warning}>
              AGENT ASKS
            </Label>
          ) : null}
          <Text style={[styles.question, { color: theme.text, fontFamily: theme.fontSans }]}>
            {view.prompt}
          </Text>
          {view.rationale ? (
            <Text style={[styles.rationale, { color: theme.textMuted }]}>{view.rationale}</Text>
          ) : null}

          {view.choices.length > 0 ? (
            <View style={styles.choiceRow}>
              {view.choices.map(choice => (
                <Pressable
                  key={choice}
                  accessibilityRole="button"
                  onPress={() => setDraft(choice)}
                  style={({ pressed }) => [
                    styles.choice,
                    { borderColor: theme.line, backgroundColor: theme.panelMuted },
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={[styles.choiceText, { color: theme.textMuted }]}>{choice}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Your answer…"
            placeholderTextColor={theme.textFaint}
            multiline
            style={[
              styles.input,
              { color: theme.text, borderColor: theme.line, backgroundColor: theme.panelMuted },
            ]}
          />

          <View style={styles.actionRow}>
            <PrimaryButton theme={theme} label="ANSWER" onPress={onSubmit} disabled={!draft.trim()} />
            {view.canSkip ? (
              <GhostButton theme={theme} label="SKIP" onPress={onSkip} />
            ) : null}
          </View>
        </Panel>
      ) : (
        <Panel theme={theme}>
          <Text style={[styles.bodyText, { color: theme.text }]}>
            That's everything I need to ask. Review the working map, then draft the mission.
          </Text>
        </Panel>
      )}

      <View style={styles.actionRow}>
        {view.isAgentThinking ? (
          <View style={styles.thinking}>
            <ActivityIndicator color={theme.accent} />
            <Text style={[styles.rationale, { color: theme.textMuted }]}>Asking the model…</Text>
          </View>
        ) : (
          <GhostButton theme={theme} label="ASK THE MODEL FOR GAPS" onPress={onAskAgent} />
        )}
      </View>

      <WorkingMap sections={view.mapSections} theme={theme} />

      {view.canPropose ? (
        <View style={styles.actionRow}>
          <PrimaryButton theme={theme} label="DRAFT THE MISSION" onPress={onPropose} />
        </View>
      ) : null}
    </>
  );
}

function ProposalStage({
  view,
  theme,
  onBack,
  onResearch,
  onAccept,
}: {
  view: AppState["goalArchitect"];
  theme: GriotTheme;
  onBack: () => void;
  onResearch: () => void;
  onAccept: () => void;
}) {
  const proposal = view.proposal;
  if (!proposal) return null;

  return (
    <>
      {/* The status line is blunt on purpose — the draft must never look like a result. */}
      <View style={[styles.statusBanner, { borderColor: theme.warning, backgroundColor: theme.panelMuted }]}>
        <Text style={[styles.statusText, { color: theme.warning, fontFamily: theme.fontMono }]}>
          {view.proposalStatus}
        </Text>
      </View>

      <Panel theme={theme}>
        <Label theme={theme} color={theme.accent}>
          MISSION
        </Label>
        <Text style={[styles.missionTitle, { color: theme.text, fontFamily: theme.fontSans }]}>
          {proposal.title}
        </Text>
        <Text style={[styles.bodyText, { color: theme.text }]}>{proposal.goalStatement}</Text>
        {proposal.targetDeliverable ? (
          <Text style={[styles.rationale, { color: theme.textMuted }]}>
            Deliverable: {proposal.targetDeliverable}
          </Text>
        ) : null}
      </Panel>

      <ListPanel theme={theme} label="SUCCESS CRITERIA" items={proposal.successCriteria} />
      <ListPanel theme={theme} label="FIRST MILESTONE" items={[proposal.firstMilestone]} />
      <ListPanel theme={theme} label="SMALLEST PROOF" items={[proposal.smallestProof]} />

      <InsightPanel theme={theme} label="CONSTRAINTS" rowsOf={proposal.constraints} />
      <InsightPanel theme={theme} label="ASSUMPTIONS" rowsOf={proposal.assumptions} />
      <InsightPanel theme={theme} label="PREREQUISITES" rowsOf={proposal.prerequisites} />
      <InsightPanel theme={theme} label="RISKS" rowsOf={proposal.risks} />
      <InsightPanel theme={theme} label="KNOWN GAPS" rowsOf={proposal.unknowns} />

      <Panel theme={theme}>
        <Label theme={theme} color={theme.textMuted}>
          WILL CREATE {proposal.suggestedCards.length} CARDS
        </Label>
        {proposal.suggestedCards.map((card, index) => (
          <View key={`${card.title}-${index}`} style={styles.cardRow}>
            <Text style={[styles.roleTag, { color: theme.accent, fontFamily: theme.fontMono }]}>
              {card.role.toUpperCase()}
            </Text>
            <Text numberOfLines={2} style={[styles.bodyText, { color: theme.text, flex: 1 }]}>
              {card.title}
            </Text>
          </View>
        ))}
      </Panel>

      {view.recommendedResearch.length > 0 ? (
        <Panel theme={theme}>
          <Label theme={theme} color={theme.accent}>
            RECOMMENDED RESEARCH
          </Label>
          {view.recommendedResearch.map(item => (
            <Text key={item.query} style={[styles.bodyText, { color: theme.text }]}>
              • {item.query} — {item.rationale}
            </Text>
          ))}
          {/* Opens the normal preflight. Nothing here can start a search on its own. */}
          <GhostButton theme={theme} label="REVIEW AND RUN SEARCH" onPress={onResearch} />
        </Panel>
      ) : null}

      <Panel theme={theme}>
        <Label theme={theme} color={theme.textMuted}>
          PROVENANCE
        </Label>
        <Text style={[styles.rationale, { color: theme.textMuted }]}>
          {view.provenanceSummary}
        </Text>
      </Panel>

      <View style={styles.actionRow}>
        <PrimaryButton theme={theme} label="ACCEPT MISSION" onPress={onAccept} />
        <GhostButton theme={theme} label="ASK MORE" onPress={onBack} />
      </View>
    </>
  );
}

function WorkingMap({
  sections,
  theme,
}: {
  sections: WorkingMapSection[];
  theme: GriotTheme;
}) {
  if (sections.length === 0) return null;

  return (
    <Panel theme={theme}>
      <Label theme={theme} color={theme.accent}>
        WORKING MAP — BASED ON WHAT YOU'VE TOLD ME
      </Label>
      {sections.map(section => (
        <View key={section.heading} style={styles.mapSection}>
          <Text style={[styles.mapHeading, { color: theme.textFaint, fontFamily: theme.fontMono }]}>
            {section.heading}
          </Text>
          {section.rows.map((row, index) => (
            <Row key={`${row.text}-${index}`} row={row} theme={theme} />
          ))}
        </View>
      ))}
    </Panel>
  );
}

/** One map line. The badge arrives with the row — this component never derives it. */
function Row({ row, theme }: { row: InsightRow; theme: GriotTheme }) {
  return (
    <View style={styles.insightRow}>
      <Text style={[styles.bodyText, { color: theme.text }]}>{row.text}</Text>
      {row.label ? (
        <Text
          style={[
            styles.originBadge,
            {
              color: row.needsVerification ? theme.warning : theme.textFaint,
              fontFamily: theme.fontMono,
            },
          ]}
        >
          {row.label}
        </Text>
      ) : null}
    </View>
  );
}

function InsightPanel({
  theme,
  label,
  rowsOf,
}: {
  theme: GriotTheme;
  label: string;
  rowsOf: { text: string; origin: string }[];
}) {
  if (rowsOf.length === 0) return null;
  return (
    <Panel theme={theme}>
      <Label theme={theme} color={theme.textMuted}>
        {label}
      </Label>
      {rowsOf.map((item, index) => (
        <View key={`${item.text}-${index}`} style={styles.insightRow}>
          <Text style={[styles.bodyText, { color: theme.text }]}>{item.text}</Text>
          {item.origin === "agent" ? (
            <Text style={[styles.originBadge, { color: theme.warning, fontFamily: theme.fontMono }]}>
              AGENT HYPOTHESIS — VERIFY OR EDIT
            </Text>
          ) : null}
        </View>
      ))}
    </Panel>
  );
}

function ListPanel({
  theme,
  label,
  items,
}: {
  theme: GriotTheme;
  label: string;
  items: string[];
}) {
  const real = items.filter(item => item.trim().length > 0);
  if (real.length === 0) return null;
  return (
    <Panel theme={theme}>
      <Label theme={theme} color={theme.textMuted}>
        {label}
      </Label>
      {real.map((item, index) => (
        <Text key={`${item}-${index}`} style={[styles.bodyText, { color: theme.text }]}>
          • {item}
        </Text>
      ))}
    </Panel>
  );
}

function Panel({
  children,
  theme,
  tone = "neutral",
}: {
  children: React.ReactNode;
  theme: GriotTheme;
  tone?: "neutral" | "agent" | "error";
}) {
  const borderColor =
    tone === "agent" ? theme.warning : tone === "error" ? theme.danger : theme.line;
  return (
    <View style={[styles.panel, { borderColor, backgroundColor: theme.panel }]}>{children}</View>
  );
}

function Label({
  children,
  theme,
  color,
}: {
  children: React.ReactNode;
  theme: GriotTheme;
  color: string;
}) {
  return (
    <Text style={[styles.label, { color, fontFamily: theme.fontMono }]}>{children}</Text>
  );
}

function PrimaryButton({
  theme,
  label,
  onPress,
  disabled,
}: {
  theme: GriotTheme;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        { backgroundColor: theme.accent, opacity: disabled ? 0.4 : 1 },
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.buttonText, { color: theme.accentInk, fontFamily: theme.fontMono }]}>
        {label}
      </Text>
    </Pressable>
  );
}

function GhostButton({
  theme,
  label,
  onPress,
}: {
  theme: GriotTheme;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.ghostButton,
        { borderColor: theme.line },
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.buttonText, { color: theme.textMuted, fontFamily: theme.fontMono }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  pressed: { opacity: 0.7 },
  header: {
    paddingHorizontal: 18,
    paddingTop: 56,
    paddingBottom: 10,
    borderBottomWidth: 1,
    gap: 10,
  },
  headerTop: { flexDirection: "row", alignItems: "center" },
  headerControls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerControlsLeft: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  headerControlsRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  transmitSquare: { width: 8, height: 8, borderRadius: 2 },
  modelTag: { fontSize: TypeScale.label, fontWeight: "700", letterSpacing: 0.6, flexShrink: 1 },
  toggleChip: {
    borderWidth: 1,
    borderRadius: Structure.radiusElbow,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  toggleChipText: { fontSize: TypeScale.label, fontWeight: "900", letterSpacing: 1 },
  modeSwitch: { flexDirection: "row", borderWidth: 1, borderRadius: Structure.radiusElbow, overflow: "hidden" },
  modeOption: { paddingHorizontal: 10, paddingVertical: 5 },
  modeOptionText: { fontSize: TypeScale.label, fontWeight: "900", letterSpacing: 1 },
  eyebrow: { fontSize: TypeScale.label, fontWeight: "900", letterSpacing: 1.4 },
  title: { fontSize: 22, fontWeight: "800", marginTop: 2 },
  close: { minHeight: Structure.tap, justifyContent: "center", paddingHorizontal: 8 },
  closeText: { fontSize: TypeScale.label, fontWeight: "900", letterSpacing: 1 },
  body: { flex: 1 },
  content: { padding: 16, paddingBottom: 48, gap: 12 },
  chatWrap: { flex: 1 },
  chatContent: { padding: 16, paddingBottom: 24, gap: 16 },
  centerStage: { alignItems: "center", paddingVertical: 28, gap: 12 },
  centerBadge: { fontSize: TypeScale.label, fontWeight: "900", letterSpacing: 1.2 },
  centerText: { fontSize: 24, fontWeight: "700", lineHeight: 31, textAlign: "center" },
  centerCaption: { fontSize: TypeScale.body, lineHeight: 21, textAlign: "center", maxWidth: 340 },
  dotsRow: { flexDirection: "row", gap: 8, paddingVertical: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  log: { gap: 4 },
  logHeading: { fontSize: TypeScale.label, fontWeight: "900", letterSpacing: 1.4, marginBottom: 4 },
  logLine: { flexDirection: "row", gap: 8, paddingVertical: 3 },
  logSpeaker: {
    fontSize: TypeScale.label,
    fontWeight: "800",
    letterSpacing: 0.4,
    width: 92,
  },
  logText: { flex: 1, fontSize: TypeScale.meta, lineHeight: 18 },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    padding: 12,
    borderTopWidth: 1,
  },
  composerInput: {
    flex: 1,
    minHeight: Structure.tap,
    maxHeight: 100,
    borderWidth: 1,
    borderRadius: Structure.radiusControl,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: TypeScale.body,
  },
  composerSkip: { minHeight: Structure.tap, justifyContent: "center", paddingHorizontal: 6 },
  composerSkipText: { fontSize: TypeScale.label, fontWeight: "800", letterSpacing: 1 },
  sendButton: {
    minHeight: Structure.tap,
    borderRadius: Structure.radiusControl,
    paddingHorizontal: 16,
    justifyContent: "center",
  },
  sendButtonText: { fontSize: TypeScale.label, fontWeight: "900", letterSpacing: 1 },
  panel: { borderWidth: 1, borderRadius: Structure.radiusControl, padding: 14, gap: 8 },
  label: { fontSize: TypeScale.label, fontWeight: "900", letterSpacing: 1.2 },
  question: { fontSize: 18, fontWeight: "700", lineHeight: 25 },
  rationale: { fontSize: TypeScale.meta, lineHeight: 19 },
  bodyText: { fontSize: TypeScale.body, lineHeight: 22 },
  missionTitle: { fontSize: 20, fontWeight: "800" },
  input: {
    minHeight: 88,
    borderWidth: 1,
    borderRadius: Structure.radiusControl,
    padding: 12,
    fontSize: TypeScale.body,
    textAlignVertical: "top",
  },
  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" },
  primaryButton: {
    minHeight: Structure.tap,
    borderRadius: Structure.radiusControl,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  ghostButton: {
    minHeight: Structure.tap,
    borderWidth: 1,
    borderRadius: Structure.radiusControl,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: { fontSize: TypeScale.label, fontWeight: "900", letterSpacing: 1 },
  choiceRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  choice: {
    borderWidth: 1,
    borderRadius: Structure.radiusControl,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  choiceText: { fontSize: TypeScale.meta },
  thinking: { flexDirection: "row", alignItems: "center", gap: 10 },
  mapSection: { gap: 4, marginTop: 6 },
  mapHeading: { fontSize: TypeScale.label, fontWeight: "800", letterSpacing: 1.1 },
  insightRow: { gap: 2, marginBottom: 6 },
  originBadge: { fontSize: TypeScale.label, fontWeight: "800", letterSpacing: 0.8 },
  statusBanner: {
    borderWidth: 1,
    borderRadius: Structure.radiusControl,
    padding: 12,
    alignItems: "center",
  },
  statusText: { fontSize: TypeScale.label, fontWeight: "900", letterSpacing: 1.1 },
  cardRow: { flexDirection: "row", gap: 10, alignItems: "flex-start", marginBottom: 4 },
  roleTag: { fontSize: TypeScale.label, fontWeight: "900", minWidth: 82 },
});
