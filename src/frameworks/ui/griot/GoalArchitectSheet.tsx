import React, { useState } from "react";
import {
  ActivityIndicator,
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
  WorkingMapSection,
} from "../../../adapters/presenters/GoalArchitectPresenter";
import { GriotTheme, Structure, TypeScale } from "./theme";

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

        <ScrollView style={styles.body} contentContainerStyle={styles.content}>
          {view.stage === "intent" ? (
            <IntentStage
              view={view}
              theme={theme}
              draft={draft}
              setDraft={setDraft}
              onSubmit={submit}
              onSkip={skip}
              onAskAgent={() => void controller.requestGoalAgentTurn()}
              onPropose={() => controller.proposeMission()}
            />
          ) : (
            <ProposalStage
              view={view}
              theme={theme}
              onBack={() => controller.backToGoalQuestions()}
              onResearch={() => controller.requestGoalResearch()}
              onAccept={() => void controller.acceptMission()}
            />
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

function IntentStage({
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
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingTop: 56,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  eyebrow: { fontSize: TypeScale.label, fontWeight: "900", letterSpacing: 1.4 },
  title: { fontSize: 22, fontWeight: "800", marginTop: 2 },
  close: { minHeight: Structure.tap, justifyContent: "center", paddingHorizontal: 8 },
  closeText: { fontSize: TypeScale.label, fontWeight: "900", letterSpacing: 1 },
  body: { flex: 1 },
  content: { padding: 16, paddingBottom: 48, gap: 12 },
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
