import React, { useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppState, LearnimalController } from "../../adapters/presenters/LearnimalController";
import { useControllerState } from "./useControllerState";

// Accent and card type color definitions conforming to prototype specs
const ACCENTS = {
  teal: { primary: "#4EC7C0", soft: "rgba(78,199,192,0.14)", line: "rgba(78,199,192,0.38)" },
  lilac: { primary: "#B49CE6", soft: "rgba(180,156,230,0.16)", line: "rgba(180,156,230,0.40)" },
  amber: { primary: "#E0A45E", soft: "rgba(224,164,94,0.16)", line: "rgba(224,164,94,0.40)" },
  rose: { primary: "#E8829B", soft: "rgba(232,130,155,0.16)", line: "rgba(232,130,155,0.40)" },
  arctic: { primary: "#7FB2E8", soft: "rgba(127,178,232,0.16)", line: "rgba(127,178,232,0.40)" },
};

const CARD_COLORS = {
  source: "#B49CE6",
  chunk: "#7FB2E8",
  question: "#4EC7C0",
  note: "#E8829B",
  group: "#9AA7B5",
  due: "#F2A65A",
};

const THEMES = {
  dark: {
    bg: "#0A0B0F",
    surface: "#15171E",
    surface2: "#1D2029",
    raised: "#23262F",
    text: "#ECEEF3",
    muted: "#8B909D",
    faint: "#5A5F6B",
    line: "#23262F",
    lineSoft: "#1B1E26",
  },
  light: {
    bg: "#F4F4F2",
    surface: "#FFFFFF",
    surface2: "#FAFAF8",
    raised: "#FFFFFF",
    text: "#16181D",
    muted: "#6C717C",
    faint: "#A2A6AE",
    line: "#E6E6E2",
    lineSoft: "#EDEDE9",
  },
};

const COMMANDS_INFO = {
  ask: { dot: CARD_COLORS.chunk, desc: "Ask the agent · returns chunked cards" },
  source: { dot: CARD_COLORS.source, desc: "Bring in text or a link" },
  chunk: { dot: CARD_COLORS.chunk, desc: "Split into atomic cards" },
  recall: { dot: CARD_COLORS.question, desc: "Make active-recall questions" },
  space: { dot: CARD_COLORS.due, desc: "Schedule with spaced repetition" },
  review: { dot: CARD_COLORS.due, desc: "Run today's due reviews" },
  move: { dot: CARD_COLORS.source, desc: "Send cards to another workspace" },
  group: { dot: CARD_COLORS.group, desc: "Bundle selected cards into a group" },
  ungroup: { dot: CARD_COLORS.group, desc: "Dissolve a group, freeing its cards" },
};

const DEFAULT_SYSTEM_PROMPT = `You generate atomic learning cards. Respond ONLY with a valid JSON array of objects (no prose, no markdown code block formatting). Each object must have:
- "title": string (max 6 words, representing the atomic concept)
- "body": string (1-2 clear, simple sentences explaining the concept)

Each card must be a distinct, recall-ready idea.`;



const ONBOARDING_QUESTIONS = [
  { eyebrow: "API Key", q: "What is your OpenRouter API Key?", ph: "sk-or-... (optional, press Continue to skip)" },
  { eyebrow: "New workspace", q: "What do you want to learn?", ph: "e.g. linear algebra" },
  { eyebrow: "The why", q: "Why?", ph: "what's it for?" },
  { eyebrow: "The goal", q: "What do you want to do with it?", ph: "the thing you're aiming at" },
  { eyebrow: "The gap", q: "What will you need to learn first?", ph: "where to start" },
];

interface MainLayoutProps {
  controller: LearnimalController;
}

export function MainLayout({ controller }: MainLayoutProps) {
  const state: AppState = useControllerState(controller);

  const colors = THEMES[state.theme];
  const accent = ACCENTS[state.accent];

  // Component states
  const [pipelineInput, setPipelineInput] = useState("");
  const [workspaceInput, setWorkspaceInput] = useState("");
  const [sheetInput, setSheetInput] = useState("");
  const [apiKeyInput, setApiKeyInput] = useState(state.openRouterKey);
  const [modelInput, setModelInput] = useState(state.selectedModel);
  const [onboardingInput, setOnboardingInput] = useState("");
  const [cardVeilRevealed, setCardVeilRevealed] = useState<Record<string, boolean>>({});
  const [systemPromptInput, setSystemPromptInput] = useState(state.customSystemPrompt);
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);

  // Custom command creation sheet state
  const [isCreateCmdOpen, setIsCreateCmdOpen] = useState(false);
  const [newCmdName, setNewCmdName] = useState("");
  const [newCmdDesc, setNewCmdDesc] = useState("");
  const [newCmdPrompt, setNewCmdPrompt] = useState("");

  const openCreateCommand = () => {
    setNewCmdName("");
    setNewCmdDesc("");
    setNewCmdPrompt("");
    setIsCreateCmdOpen(true);
  };

  const handleCreateCommand = () => {
    if (!newCmdName.trim() || !newCmdPrompt.trim()) return;
    controller.createCustomCommand({
      name: newCmdName,
      description: newCmdDesc,
      systemPrompt: newCmdPrompt,
    });
    setIsCreateCmdOpen(false);
  };

  const confirmDeleteCard = (cardId: string) => {
    Alert.alert("Delete card?", "This permanently removes the card.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => controller.deleteCard(cardId) },
    ]);
  };

  const confirmDeleteCommand = (id: string, name: string) => {
    Alert.alert(`Delete "${name}"?`, "This removes the custom command.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => controller.deleteCustomCommand(id) },
    ]);
  };

  React.useEffect(() => {
    setApiKeyInput(state.openRouterKey);
  }, [state.openRouterKey]);

  React.useEffect(() => {
    setModelInput(state.selectedModel);
  }, [state.selectedModel]);

  React.useEffect(() => {
    setSystemPromptInput(state.customSystemPrompt);
  }, [state.customSystemPrompt]);

  const activeWs = state.workspaces.find((w) => w.id === state.activeWorkspaceId);
  const dueCount = state.cards.filter(
    (c) => c.type === "question" && c.schedule && c.schedule.dueAt <= Date.now()
  ).length;

  const currentOnboardingQ = ONBOARDING_QUESTIONS[state.onboardingStep];

  const activeModel = state.availableModels.find((m) => m.id === state.selectedModel);
  const selectedModelName = activeModel ? activeModel.name : `Custom: ${state.selectedModel}`;
  const isCustomSelected = !activeModel;
  const freeModels = state.availableModels.filter((m) => m.free);
  const paidModels = state.availableModels.filter((m) => !m.free);

  const handleRunPipeline = (text: string) => {
    if (!text.trim()) return;
    controller.runPipeline(text);
    setPipelineInput("");
  };

  const handleInputSheetSubmit = () => {
    if (!sheetInput.trim()) return;
    // Re-dispatch to the command that asked for input (a built-in like ask/source,
    // or a custom command), falling back to the sheet mode if none is pending.
    const command = state.pendingCommandName || (state.inputSheetMode === "ask" ? "ask" : "source");
    controller.runPipeline(`${command} "${sheetInput.replace(/"/g, "")}"`);
    setSheetInput("");
  };

  const handleOnboardingSubmit = () => {
    if (!onboardingInput.trim() && state.onboardingStep !== 0) return;
    controller.answerOnboardingQuestion(onboardingInput);
    setOnboardingInput("");
  };

  return (
    <View style={[styles.outerContainer, { backgroundColor: colors.bg }]}>
      <SafeAreaView style={styles.safeArea}>
        {/* App Frame centering for desktop/tablet resizing */}
        <View style={[styles.appFrame, { borderColor: colors.lineSoft }]}>
          {/* Top Header Bar */}
          <View style={styles.topbar}>
            <TouchableOpacity
              style={styles.wsSwitch}
              onPress={() => controller.setWorkspaceSheetOpen(true)}
            >
              <View style={[styles.wsDot, { backgroundColor: accent.primary, shadowColor: accent.primary }]} />
              <Text style={[styles.wsText, { color: colors.text }]}>
                {activeWs ? activeWs.name : "Select Workspace"}
              </Text>
              <Text style={[styles.wsChev, { color: colors.faint }]}>▼</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.iconBtn, { backgroundColor: colors.surface }]}
              onPress={() => controller.setSettingsSheetOpen(true)}
            >
              <Text style={{ color: colors.muted, fontSize: 18 }}>⚙</Text>
            </TouchableOpacity>
          </View>

          {/* Breadcrumb trail (drill-in navigation) */}
          {state.breadcrumb.length > 0 && (
            <View style={styles.breadcrumbBar}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.breadcrumbContent}
              >
                <TouchableOpacity onPress={() => controller.navigateToGroup(null)}>
                  <Text style={[styles.crumbText, { color: colors.muted }]}>{activeWs ? activeWs.name : "Root"}</Text>
                </TouchableOpacity>
                {state.breadcrumb.map((g, i) => {
                  const isLast = i === state.breadcrumb.length - 1;
                  return (
                    <View key={g.id} style={styles.crumbItem}>
                      <Text style={[styles.crumbSep, { color: colors.faint }]}>›</Text>
                      <TouchableOpacity onPress={() => controller.navigateToGroup(g.id)}>
                        <Text style={[styles.crumbText, { color: isLast ? colors.text : colors.muted }]}>
                          {g.title}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {/* Canvas Scroll Area */}
          <ScrollView
            style={styles.canvas}
            contentContainerStyle={styles.canvasContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Due Cards Banner Alert */}
            {dueCount > 0 && (
              <View style={[styles.dueBanner, { backgroundColor: "rgba(242,166,90,0.1)", borderColor: "rgba(242,166,90,0.3)" }]}>
                <Text style={styles.dueBannerText}>{dueCount} card{dueCount > 1 ? "s" : ""} ready to review</Text>
                <TouchableOpacity
                  style={[styles.dueBannerBtn, { backgroundColor: CARD_COLORS.due }]}
                  onPress={() => controller.startReview()}
                >
                  <Text style={styles.dueBannerBtnText}>Review</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Empty Canvas Indicator */}
            {state.visibleCards.length === 0 ? (
              <View style={styles.emptyView}>
                <Text style={[styles.emptyTitle, { color: colors.muted }]}>
                  {state.currentGroupId ? "Empty group" : "Empty canvas"}
                </Text>
                <Text style={[styles.emptySub, { color: colors.faint }]}>
                  Open the drawer on the right and run <Text style={styles.monoText}>ask</Text> — or pipe{" "}
                  <Text style={styles.monoText}>ask | chunk | recall | space</Text> to learn something end to end.
                </Text>
              </View>
            ) : (
              // Card Flow Render — only the current group's direct children.
              state.visibleCards
                .slice()
                .reverse()
                .map((card) => {
                  const isSelected = state.selection.has(card.id);
                  const isSpaced = !!card.schedule;

                  // Group cards render as a folder that drills in on tap.
                  if (card.type === "group") {
                    const childCount = state.cards.filter((c) => c.parentId === card.id).length;
                    return (
                      <TouchableOpacity
                        key={card.id}
                        activeOpacity={0.9}
                        style={[
                          styles.card,
                          { backgroundColor: colors.surface },
                          isSelected
                            ? { borderColor: accent.line, shadowColor: accent.soft, shadowOpacity: 1, shadowRadius: 10 }
                            : { borderColor: colors.line },
                        ]}
                        onPress={() => controller.openGroup(card.id)}
                      >
                        <View style={[styles.cardSpine, { backgroundColor: CARD_COLORS.group }]} />
                        <View style={styles.cardHeader}>
                          <Text style={[styles.cardTypeLabel, { color: CARD_COLORS.group }]}>
                            group · {childCount} {childCount === 1 ? "card" : "cards"}
                          </Text>
                          <TouchableOpacity
                            style={[styles.selDot, isSelected && { backgroundColor: accent.primary, borderColor: accent.primary }]}
                            onPress={() => controller.toggleSelect(card.id)}
                          >
                            {isSelected && <Text style={styles.selDotCheck}>✓</Text>}
                          </TouchableOpacity>
                        </View>
                        <Text style={[styles.cardTitle, { color: colors.text }]}>📁 {card.title}</Text>
                        <Text style={[styles.cardBodyPreview, { color: colors.faint }]}>Tap to open ›</Text>
                      </TouchableOpacity>
                    );
                  }
                  const borderStyle = isSelected
                    ? { borderColor: accent.line, shadowColor: accent.soft, shadowOpacity: 1, shadowRadius: 10 }
                    : { borderColor: colors.line };

                  let scheduleMeta = "";
                  if (card.schedule) {
                    const daysRemaining = Math.max(
                      0,
                      Math.round((card.schedule.dueAt - Date.now()) / 86400000)
                    );
                    scheduleMeta = `due ${daysRemaining === 0 ? "now" : `in ${daysRemaining}d`}`;
                  }

                  return (
                    <TouchableOpacity
                      key={card.id}
                      activeOpacity={0.9}
                      style={[styles.card, { backgroundColor: colors.surface }, borderStyle]}
                      onPress={() => controller.openCard(card.id)}
                    >
                      {/* Spine Accent Line */}
                      <View
                        style={[
                          styles.cardSpine,
                          {
                            backgroundColor: isSpaced
                              ? CARD_COLORS.due
                              : CARD_COLORS[card.type] || colors.muted,
                          },
                        ]}
                      />

                      <View style={styles.cardHeader}>
                        <Text style={[styles.cardTypeLabel, { color: CARD_COLORS[card.type] || colors.muted }]}>
                          {card.type} {isSpaced && "· spaced"}
                        </Text>

                        {/* Selection Checkbox */}
                        <TouchableOpacity
                          style={[styles.selDot, isSelected && { backgroundColor: accent.primary, borderColor: accent.primary }]}
                          onPress={() => controller.toggleSelect(card.id)}
                        >
                          {isSelected && <Text style={styles.selDotCheck}>✓</Text>}
                        </TouchableOpacity>
                      </View>

                      <Text style={[styles.cardTitle, { color: colors.text }]}>{card.title}</Text>
                      {card.type !== "question" && (
                        <Text numberOfLines={2} style={[styles.cardBodyPreview, { color: colors.muted }]}>
                          {card.body}
                        </Text>
                      )}

                      {scheduleMeta ? (
                        <Text style={[styles.dueMetaText, { color: CARD_COLORS.due }]}>
                          {scheduleMeta}
                        </Text>
                      ) : null}
                    </TouchableOpacity>
                  );
                })
            )}
          </ScrollView>

          {/* Persistent Commands Handle (Right Edge Reachability Thumb Zone) */}
          <TouchableOpacity
            style={[styles.drawerHandle, { backgroundColor: colors.surface, borderColor: colors.line }]}
            onPress={() => controller.setModalOpen(true)}
          >
            <View style={styles.drawerGrip} />
          </TouchableOpacity>

          {/* Floating Selection Bar */}
          {state.selection.size > 0 && (
            <View style={[styles.selBar, { backgroundColor: colors.surface2, borderColor: colors.line }]}>
              <Text style={{ color: colors.muted, fontSize: 13 }}>
                <Text style={{ color: colors.text, fontWeight: "bold" }}>{state.selection.size}</Text> selected
              </Text>
              <TouchableOpacity
                style={[styles.selBarRunBtn, { backgroundColor: accent.primary }]}
                onPress={() => controller.setModalOpen(true)}
              >
                <Text style={styles.selBarRunBtnText}>Command ↑</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => controller.clearSelection()}>
                <Text style={[styles.selBarClearText, { color: colors.faint }]}>Clear</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </SafeAreaView>

      {/* COMMAND PALETTE MODAL */}
      <Modal
        visible={state.isModalOpen}
        animationType="fade"
        transparent={true}
        onRequestClose={() => controller.setModalOpen(false)}
      >
        <View style={styles.scrim}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => controller.setModalOpen(false)} />
          
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={styles.modalCenteredView}
          >
            <View style={[styles.modalContent, { backgroundColor: colors.surface2, borderColor: colors.line }]}>
              {/* Header info */}
              <View style={styles.modalHead}>
                <Text style={[styles.modalLabel, { color: colors.faint }]}>COMMANDS</Text>
                <Text style={[styles.modalSub, { color: colors.muted }]}>
                  {state.selection.size > 0 ? (
                    <Text>
                      <Text style={{ color: accent.primary }}>{state.selection.size}</Text> cards in stdin
                    </Text>
                  ) : (
                    "No cards selected · runs fresh"
                  )}
                </Text>
              </View>

              {/* Body */}
              <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
                <View style={styles.groupLabelRow}>
                  <Text style={[styles.groupLabelText, { color: colors.faint }]}>EASY ACCESS</Text>
                  <TouchableOpacity onPress={() => controller.setPinEditMode(!state.pinEditMode)}>
                    <Text style={[styles.groupEditBtn, { color: accent.primary }]}>
                      {state.pinEditMode ? "Done" : "Edit"}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Pin chips */}
                <View style={styles.chipContainer}>
                  {state.pinnedCommands.map((name) => {
                    const info = COMMANDS_INFO[name as keyof typeof COMMANDS_INFO];
                    return (
                      <TouchableOpacity
                        key={name}
                        style={[styles.cmdChip, { backgroundColor: colors.surface, borderColor: colors.line }]}
                        onPress={() => {
                          if (state.pinEditMode) {
                            controller.togglePinCommand(name);
                          } else {
                            controller.runPipeline(name);
                          }
                        }}
                      >
                        <View style={[styles.chipDot, { backgroundColor: info?.dot || colors.faint }]} />
                        <Text style={[styles.chipText, { color: colors.text }]}>{name}</Text>
                        {state.pinEditMode && <Text style={{ color: colors.muted, marginLeft: 4 }}>✕</Text>}
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text style={[styles.groupLabelText, { color: colors.faint, marginTop: 14 }]}>ALL COMMANDS</Text>
                {Object.entries(COMMANDS_INFO).map(([name, info]) => {
                  const isPinned = state.pinnedCommands.includes(name);
                  return (
                    <TouchableOpacity
                      key={name}
                      style={styles.cmdRow}
                      onPress={() => controller.runPipeline(name)}
                    >
                      <View style={[styles.rowDot, { backgroundColor: info.dot }]} />
                      <View style={styles.rowInfo}>
                        <Text style={[styles.rowName, { color: colors.text }]}>{name}</Text>
                        <Text style={[styles.rowDesc, { color: colors.muted }]}>{info.desc}</Text>
                      </View>
                      <TouchableOpacity
                        style={styles.pinStarBtn}
                        onPress={() => controller.togglePinCommand(name)}
                      >
                        <Text style={{ fontSize: 18, color: isPinned ? accent.primary : colors.faint }}>
                          {isPinned ? "★" : "☆"}
                        </Text>
                      </TouchableOpacity>
                    </TouchableOpacity>
                  );
                })}

                {/* Custom commands */}
                <View style={[styles.groupLabelRow, { marginTop: 14 }]}>
                  <Text style={[styles.groupLabelText, { color: colors.faint }]}>CUSTOM COMMANDS</Text>
                  <TouchableOpacity onPress={openCreateCommand}>
                    <Text style={[styles.groupEditBtn, { color: accent.primary }]}>+ New</Text>
                  </TouchableOpacity>
                </View>
                {state.commandDefinitions.length === 0 ? (
                  <Text style={[styles.rowDesc, { color: colors.faint, paddingVertical: 8 }]}>
                    Create a command with its own agent prompt — it runs like ask.
                  </Text>
                ) : (
                  state.commandDefinitions.map((def) => {
                    const isPinned = state.pinnedCommands.includes(def.name);
                    return (
                      <TouchableOpacity
                        key={def.id}
                        style={styles.cmdRow}
                        onPress={() => controller.runPipeline(def.name)}
                      >
                        <View style={[styles.rowDot, { backgroundColor: CARD_COLORS.chunk }]} />
                        <View style={styles.rowInfo}>
                          <Text style={[styles.rowName, { color: colors.text }]}>{def.name}</Text>
                          <Text style={[styles.rowDesc, { color: colors.muted }]}>{def.description}</Text>
                        </View>
                        <TouchableOpacity
                          style={styles.pinStarBtn}
                          onPress={() => controller.togglePinCommand(def.name)}
                        >
                          <Text style={{ fontSize: 18, color: isPinned ? accent.primary : colors.faint }}>
                            {isPinned ? "★" : "☆"}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.pinStarBtn}
                          onPress={() => confirmDeleteCommand(def.id, def.name)}
                        >
                          <Text style={{ fontSize: 16, color: "#E8829B" }}>✕</Text>
                        </TouchableOpacity>
                      </TouchableOpacity>
                    );
                  })
                )}
              </ScrollView>

              {/* Monospace Command line input */}
              <View style={[styles.cmdLine, { backgroundColor: colors.surface, borderTopColor: colors.line }]}>
                <Text style={[styles.cmdChevron, { color: colors.faint }]}>›</Text>
                <TextInput
                  style={[styles.cmdTextInput, { color: colors.text }]}
                  placeholder='ask "eigenvectors" | chunk | recall | space'
                  placeholderTextColor={colors.faint}
                  value={pipelineInput}
                  onChangeText={setPipelineInput}
                  autoCapitalize="none"
                  autoCorrect={false}
                  onSubmitEditing={() => handleRunPipeline(pipelineInput)}
                />
                <TouchableOpacity
                  style={[styles.cmdGoBtn, { backgroundColor: accent.primary }]}
                  onPress={() => handleRunPipeline(pipelineInput)}
                >
                  <Text style={styles.cmdGoText}>➔</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* FULL CARD DETAILS OVERLAY */}
      <Modal
        visible={state.openCardId !== null}
        animationType="slide"
        onRequestClose={() => controller.closeCard()}
      >
        {(() => {
          const card = state.cards.find((c) => c.id === state.openCardId);
          if (!card) return null;

          const isQuestion = card.type === "question";
          const revealed = cardVeilRevealed[card.id];

          return (
            <SafeAreaView style={[styles.fullCardContainer, { backgroundColor: colors.bg }]}>
              <View style={styles.fullCardHeader}>
                <Text style={[styles.fullCardType, { color: CARD_COLORS[card.type] }]}>
                  {card.type.toUpperCase()} {card.schedule && "· SPACED"}
                </Text>
                <TouchableOpacity onPress={() => controller.closeCard()}>
                  <Text style={[styles.fullCardCloseText, { color: colors.muted }]}>Close</Text>
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.fullCardBody} showsVerticalScrollIndicator={false}>
                <Text style={[styles.fullCardTitle, { color: colors.text }]}>{card.title}</Text>
                
                {isQuestion ? (
                  !revealed ? (
                    <TouchableOpacity
                      activeOpacity={0.8}
                      style={[styles.veil, { backgroundColor: colors.surface, borderColor: colors.line }]}
                      onPress={() => setCardVeilRevealed((prev) => ({ ...prev, [card.id]: true }))}
                    >
                      <Text style={[styles.veilTitle, { color: colors.muted }]}>Answer hidden</Text>
                      <Text style={[styles.veilSub, { color: colors.faint }]}>Recall it, then tap to reveal</Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.revealBox}>
                      <Text style={[styles.fullCardText, { color: colors.text }]}>
                        {card.answer}
                      </Text>
                      {card.cite && (
                        <View style={[styles.citeBox, { backgroundColor: accent.soft, borderColor: accent.line }]}>
                          <Text style={[styles.citeText, { color: accent.primary }]}>◆ {card.cite}</Text>
                        </View>
                      )}
                    </View>
                  )
                ) : (
                  <View>
                    <Text style={[styles.fullCardText, { color: colors.text }]}>{card.body}</Text>
                    {card.cite && (
                      <View style={[styles.citeBox, { backgroundColor: accent.soft, borderColor: accent.line }]}>
                        <Text style={[styles.citeText, { color: accent.primary }]}>◆ {card.cite}</Text>
                      </View>
                    )}
                  </View>
                )}
              </ScrollView>

              {/* Actions footer */}
              <View style={[styles.fullCardFooter, { borderTopColor: colors.line }]}>
                <TouchableOpacity
                  style={[styles.fullCardBackBtn, { borderColor: colors.line }]}
                  onPress={() => controller.closeCard()}
                >
                  <Text style={{ color: colors.text, fontWeight: "500" }}>Back</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.fullCardDeleteBtn, { borderColor: "rgba(232,130,155,0.5)" }]}
                  onPress={() => confirmDeleteCard(card.id)}
                >
                  <Text style={{ color: "#E8829B", fontWeight: "600" }}>Delete</Text>
                </TouchableOpacity>

                {card.type === "source" && (
                  <TouchableOpacity
                    style={[styles.fullCardPipeBtn, { borderColor: accent.line }]}
                    onPress={() => {
                      controller.closeCard();
                      controller.runPipeline("chunk");
                    }}
                  >
                    <Text style={{ color: accent.primary, fontWeight: "600" }}>Pipe ➔ chunk</Text>
                  </TouchableOpacity>
                )}

                {card.type === "chunk" && (
                  <TouchableOpacity
                    style={[styles.fullCardPipeBtn, { borderColor: accent.line }]}
                    onPress={() => {
                      controller.closeCard();
                      controller.runPipeline("recall");
                    }}
                  >
                    <Text style={{ color: accent.primary, fontWeight: "600" }}>Pipe ➔ recall</Text>
                  </TouchableOpacity>
                )}

                {card.type === "question" && !card.schedule && (
                  <TouchableOpacity
                    style={[styles.fullCardPipeBtn, { borderColor: accent.line }]}
                    onPress={() => {
                      controller.closeCard();
                      controller.runPipeline("space");
                    }}
                  >
                    <Text style={{ color: accent.primary, fontWeight: "600" }}>Pipe ➔ space</Text>
                  </TouchableOpacity>
                )}
              </View>
            </SafeAreaView>
          );
        })()}
      </Modal>

      {/* SPACED REPETITION REVIEW SESSIONS */}
      <Modal
        visible={state.isReviewOpen}
        animationType="slide"
        onRequestClose={() => controller.closeReview()}
      >
        {(() => {
          const currentCard = state.reviewQueue[state.reviewIndex];
          if (!currentCard) return null;

          return (
            <SafeAreaView style={[styles.reviewContainer, { backgroundColor: colors.bg }]}>
              <View style={styles.reviewHeader}>
                <Text style={[styles.reviewProgressText, { color: colors.faint }]}>
                  <Text style={{ color: CARD_COLORS.due, fontWeight: "bold" }}>{state.reviewIndex + 1}</Text> /{" "}
                  {state.reviewQueue.length}
                </Text>
                <TouchableOpacity onPress={() => controller.closeReview()}>
                  <Text style={[styles.reviewEndText, { color: colors.muted }]}>End Session</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.reviewBody}>
                <Text style={[styles.reviewTitleText, { color: CARD_COLORS.question }]}>Recall — don't peek</Text>
                <Text style={[styles.reviewQuestionText, { color: colors.text }]}>{currentCard.title}</Text>

                {state.reviewRevealAnswer ? (
                  <View style={{ marginTop: 24 }}>
                    <Text style={[styles.reviewAnswerText, { color: accent.primary }]}>
                      {currentCard.answer}
                    </Text>
                    {currentCard.cite && (
                      <View style={[styles.citeBox, { backgroundColor: accent.soft, borderColor: accent.line, alignSelf: "flex-start", marginTop: 8 }]}>
                        <Text style={[styles.citeText, { color: accent.primary }]}>◆ {currentCard.cite}</Text>
                      </View>
                    )}
                  </View>
                ) : null}
              </View>

              {/* Buttons footer */}
              <View style={styles.reviewFooter}>
                {!state.reviewRevealAnswer ? (
                  <TouchableOpacity
                    style={[styles.revealBtn, { backgroundColor: accent.primary }]}
                    onPress={() => controller.revealReviewAnswer()}
                  >
                    <Text style={styles.revealBtnText}>Reveal Answer</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.gradingRow}>
                    <TouchableOpacity
                      style={[styles.gradeNoBtn, { backgroundColor: "rgba(232,130,155,0.1)", borderColor: "rgba(232,130,155,0.3)" }]}
                      onPress={() => controller.gradeReview(false)}
                    >
                      <Text style={styles.gradeNoText}>Not yet</Text>
                      <Text style={styles.gradeTimeSub}>~10 min</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.gradeYesBtn, { backgroundColor: accent.soft, borderColor: accent.line }]}
                      onPress={() => controller.gradeReview(true)}
                    >
                      <Text style={styles.gradeYesText}>Got it</Text>
                      <Text style={[styles.gradeTimeSub, { color: colors.muted }]}>
                        +{Math.round((currentCard.schedule?.interval || 1) * 2.4) + 1}d
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </SafeAreaView>
          );
        })()}
      </Modal>

      {/* WORKSPACES SELECT SHEET */}
      <Modal
        visible={state.isWorkspaceSheetOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => controller.setWorkspaceSheetOpen(false)}
      >
        <View style={styles.scrim}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => controller.setWorkspaceSheetOpen(false)} />
          <View style={[styles.bottomSheet, { backgroundColor: colors.surface2, borderTopColor: colors.line }]}>
            <View style={[styles.sheetGrab, { backgroundColor: colors.line }]} />
            <Text style={[styles.sheetTitle, { color: colors.text }]}>Workspaces</Text>
            <Text style={[styles.sheetSub, { color: colors.muted }]}>Each holds the cards for one goal.</Text>

            <ScrollView style={styles.sheetList}>
              {state.workspaces.map((w) => {
                const isActive = w.id === state.activeWorkspaceId;
                return (
                  <TouchableOpacity
                    key={w.id}
                    style={styles.sheetItem}
                    onPress={() => controller.switchWorkspace(w.id)}
                  >
                    <View style={[styles.sheetItemDot, { backgroundColor: accent.primary, opacity: isActive ? 1 : 0.2 }]} />
                    <Text style={[styles.sheetItemName, { color: colors.text }]}>{w.name}</Text>
                  </TouchableOpacity>
                );
              })}

              {/* Add Workspace field */}
              <View style={[styles.addWsRow, { borderTopColor: colors.line }]}>
                <TextInput
                  style={[styles.addWsInput, { color: colors.text, borderColor: colors.line }]}
                  placeholder="New workspace name..."
                  placeholderTextColor={colors.faint}
                  value={workspaceInput}
                  onChangeText={setWorkspaceInput}
                />
                <TouchableOpacity
                  style={[styles.addWsBtn, { backgroundColor: accent.primary }]}
                  onPress={() => {
                    if (!workspaceInput.trim()) return;
                    controller.createNewWorkspace(workspaceInput);
                    setWorkspaceInput("");
                  }}
                >
                  <Text style={styles.addWsBtnText}>+</Text>
                </TouchableOpacity>
              </View>

              {/* Delete active workspace option */}
              {state.workspaces.length > 0 && (
                <TouchableOpacity
                  style={styles.deleteWsBtn}
                  onPress={() => {
                    controller.deleteActiveWorkspace();
                  }}
                >
                  <Text style={styles.deleteWsText}>Delete active workspace</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* SETTINGS OVERLAY SHEET */}
      <Modal
        visible={state.isSettingsSheetOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => controller.setSettingsSheetOpen(false)}
      >
        <View style={styles.scrim}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => controller.setSettingsSheetOpen(false)} />
          <View style={[styles.bottomSheet, { backgroundColor: colors.surface2, borderTopColor: colors.line }]}>
            <View style={[styles.sheetGrab, { backgroundColor: colors.line }]} />
            <Text style={[styles.sheetTitle, { color: colors.text }]}>Make it yours</Text>
            <Text style={[styles.sheetSub, { color: colors.muted }]}>Calm by default. Tune to taste.</Text>

            <ScrollView style={{ paddingHorizontal: 24, paddingBottom: 24 }}>
              {/* Theme selection */}
              <View style={styles.settingsRow}>
                <Text style={[styles.settingsLabel, { color: colors.text }]}>Theme</Text>
                <View style={[styles.segmentedControl, { backgroundColor: colors.surface, borderColor: colors.line }]}>
                  <TouchableOpacity
                    style={[styles.segment, state.theme === "dark" && { backgroundColor: colors.raised }]}
                    onPress={() => controller.setTheme("dark")}
                  >
                    <Text style={{ color: state.theme === "dark" ? colors.text : colors.muted, fontSize: 13 }}>Dark</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.segment, state.theme === "light" && { backgroundColor: colors.raised }]}
                    onPress={() => controller.setTheme("light")}
                  >
                    <Text style={{ color: state.theme === "light" ? colors.text : colors.muted, fontSize: 13 }}>Light</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Accent selection */}
              <View style={styles.settingsRow}>
                <Text style={[styles.settingsLabel, { color: colors.text }]}>Accent</Text>
                <View style={styles.swatchRow}>
                  {Object.entries(ACCENTS).map(([key, info]) => {
                    const isActive = state.accent === key;
                    return (
                      <TouchableOpacity
                        key={key}
                        style={[
                          styles.swatch,
                          { backgroundColor: info.primary },
                          isActive && { borderColor: colors.text, borderWidth: 2.5 },
                        ]}
                        onPress={() => controller.setAccent(key as any)}
                      />
                    );
                  })}
                </View>
              </View>

              {/* Auto-group toggle */}
              <View style={styles.settingsRow}>
                <Text style={[styles.settingsLabel, { color: colors.text }]}>Group by command</Text>
                <View style={[styles.segmentedControl, { backgroundColor: colors.surface, borderColor: colors.line }]}>
                  <TouchableOpacity
                    style={[styles.segment, state.autoGroupByCommand && { backgroundColor: colors.raised }]}
                    onPress={() => controller.setAutoGroupByCommand(true)}
                  >
                    <Text style={{ color: state.autoGroupByCommand ? colors.text : colors.muted, fontSize: 13 }}>On</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.segment, !state.autoGroupByCommand && { backgroundColor: colors.raised }]}
                    onPress={() => controller.setAutoGroupByCommand(false)}
                  >
                    <Text style={{ color: !state.autoGroupByCommand ? colors.text : colors.muted, fontSize: 13 }}>Off</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* OpenRouter API Settings */}
              <View style={styles.formSection}>
                <Text style={[styles.sectionLabel, { color: colors.muted }]}>OpenRouter API Configuration</Text>
                <TextInput
                  style={[styles.formInput, { color: colors.text, borderColor: colors.line, backgroundColor: colors.surface }]}
                  placeholder="Paste OpenRouter Key"
                  placeholderTextColor={colors.faint}
                  secureTextEntry={true}
                  value={apiKeyInput}
                  onChangeText={(val) => {
                    setApiKeyInput(val);
                    controller.setOpenRouterKey(val);
                  }}
                />

                <Text style={[styles.sectionLabel, { color: colors.muted, marginTop: 12 }]}>Model Selection</Text>
                
                {/* Custom Model Selector Dropdown */}
                <TouchableOpacity
                  style={[
                    styles.dropdownTrigger,
                    { backgroundColor: colors.surface, borderColor: colors.line }
                  ]}
                  onPress={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
                >
                  <Text style={[styles.dropdownTriggerText, { color: colors.text }]}>
                    {selectedModelName}
                  </Text>
                  <Text style={[styles.dropdownChevron, { color: colors.muted }]}>
                    {isModelDropdownOpen ? "▲" : "▼"}
                  </Text>
                </TouchableOpacity>

                {isModelDropdownOpen && (
                  <View style={[styles.dropdownMenu, { backgroundColor: colors.surface, borderColor: colors.line }]}>
                    <Text style={[styles.dropdownHeader, { color: colors.muted }]}>Free Models</Text>
                    {freeModels.map((m) => {
                      const isSelected = state.selectedModel === m.id;
                      return (
                        <TouchableOpacity
                          key={m.id}
                          style={[
                            styles.dropdownItem,
                            isSelected && { backgroundColor: colors.raised }
                          ]}
                          onPress={() => {
                            controller.setSelectedModel(m.id);
                            setModelInput(m.id);
                            setIsModelDropdownOpen(false);
                          }}
                        >
                          <Text style={[styles.dropdownItemText, { color: isSelected ? accent.primary : colors.text }]}>
                            {m.name}
                          </Text>
                          <Text style={[styles.dropdownItemSubtext, { color: colors.muted }]}>
                            {m.id}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}

                    <Text style={[styles.dropdownHeader, { color: colors.muted, marginTop: 8 }]}>Paid Models</Text>
                    {paidModels.map((m) => {
                      const isSelected = state.selectedModel === m.id;
                      return (
                        <TouchableOpacity
                          key={m.id}
                          style={[
                            styles.dropdownItem,
                            isSelected && { backgroundColor: colors.raised }
                          ]}
                          onPress={() => {
                            controller.setSelectedModel(m.id);
                            setModelInput(m.id);
                            setIsModelDropdownOpen(false);
                          }}
                        >
                          <Text style={[styles.dropdownItemText, { color: isSelected ? accent.primary : colors.text }]}>
                            {m.name}
                          </Text>
                          <Text style={[styles.dropdownItemSubtext, { color: colors.muted }]}>
                            {m.id}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}

                    <Text style={[styles.dropdownHeader, { color: colors.muted, marginTop: 8 }]}>Other Options</Text>
                    <TouchableOpacity
                      style={[
                        styles.dropdownItem,
                        isCustomSelected && { backgroundColor: colors.raised }
                      ]}
                      onPress={() => {
                        const fallbackCustomVal = isCustomSelected ? state.selectedModel : "google/gemini-2.5-flash";
                        controller.setSelectedModel(fallbackCustomVal);
                        setModelInput(fallbackCustomVal);
                        setIsModelDropdownOpen(false);
                      }}
                    >
                      <Text style={[styles.dropdownItemText, { color: isCustomSelected ? accent.primary : colors.text }]}>
                        Custom Model ID...
                      </Text>
                      <Text style={[styles.dropdownItemSubtext, { color: colors.muted }]}>
                        Manually enter an OpenRouter model string
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Show custom text input only if Custom option is active */}
                {isCustomSelected && (
                  <TextInput
                    style={[styles.formInput, { color: colors.text, borderColor: colors.line, backgroundColor: colors.surface, marginTop: 8 }]}
                    placeholder="Enter custom model ID (e.g. meta-llama/llama-3-70b)"
                    placeholderTextColor={colors.faint}
                    value={modelInput}
                    onChangeText={(val) => {
                      setModelInput(val);
                      controller.setSelectedModel(val);
                    }}
                  />
                )}
              </View>

              {/* System Prompt Customization */}
              <View style={styles.formSection}>
                <Text style={[styles.sectionLabel, { color: colors.muted, marginTop: 12 }]}>Agent System Prompt</Text>
                <View style={[styles.systemPromptBox, { backgroundColor: colors.surface, borderColor: colors.line }]}>
                  <TextInput
                    style={[styles.systemPromptInput, { color: colors.text }]}
                    multiline={true}
                    numberOfLines={5}
                    placeholder="Custom system instructions for card generation..."
                    placeholderTextColor={colors.faint}
                    value={systemPromptInput}
                    onChangeText={(val) => {
                      setSystemPromptInput(val);
                      controller.setCustomSystemPrompt(val);
                    }}
                  />
                </View>
                <TouchableOpacity
                  style={{ marginTop: 6, alignSelf: "flex-end" }}
                  onPress={() => {
                    setSystemPromptInput(DEFAULT_SYSTEM_PROMPT);
                    controller.setCustomSystemPrompt(DEFAULT_SYSTEM_PROMPT);
                  }}
                >
                  <Text style={{ color: accent.primary, fontSize: 12 }}>Reset to default</Text>
                </TouchableOpacity>
              </View>

              {/* Onboarding Restart option */}
              <TouchableOpacity
                style={styles.onbRestartBtn}
                onPress={() => {
                  controller.setSettingsSheetOpen(false);
                  controller.restartOnboarding();
                }}
              >
                <Text style={{ color: accent.primary, fontSize: 14, fontWeight: "600" }}>
                  Restart onboarding questionnaire ➔
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* INPUT SHEETS FOR TEXT / QUERY */}
      <Modal
        visible={state.isInputSheetOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => controller.setInputSheetOpen(false)}
      >
        <View style={styles.scrim}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => controller.setInputSheetOpen(false)} />
          <View style={[styles.bottomSheet, { backgroundColor: colors.surface2, borderTopColor: colors.line }]}>
            <View style={[styles.sheetGrab, { backgroundColor: colors.line }]} />
            
            <Text style={[styles.sheetTitle, { color: colors.text }]}>
              {state.inputSheetMode !== "ask"
                ? "Add a source"
                : state.pendingCommandName && state.pendingCommandName !== "ask"
                ? `Run: ${state.pendingCommandName}`
                : "Ask the agent"}
            </Text>
            <Text style={[styles.sheetSub, { color: colors.muted }]}>
              {state.inputSheetMode === "ask"
                ? "What do you want chunked into cards?"
                : "Paste raw text or a link. It becomes a source card."}
            </Text>

            <View style={[styles.inputBoxField, { backgroundColor: colors.surface, borderColor: colors.line }]}>
              <TextInput
                style={[styles.sheetTextArea, { color: colors.text }]}
                multiline={true}
                numberOfLines={4}
                placeholder={
                  state.inputSheetMode === "ask"
                    ? "e.g. how do eigenvectors work?"
                    : "Paste an article, notes, or a URL..."
                }
                placeholderTextColor={colors.faint}
                value={sheetInput}
                onChangeText={setSheetInput}
              />
            </View>

            <TouchableOpacity
              style={[styles.sheetPrimaryBtn, { backgroundColor: accent.primary }]}
              onPress={() => handleInputSheetSubmit()}
            >
              <Text style={styles.sheetPrimaryBtnText}>Add</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* CREATE CUSTOM COMMAND SHEET */}
      <Modal
        visible={isCreateCmdOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsCreateCmdOpen(false)}
      >
        <View style={styles.scrim}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setIsCreateCmdOpen(false)} />
          {/* 
            Style the KeyboardAvoidingView to occupy full width/height. This prevents the absolutely 
            positioned bottomSheet from collapsing to 0 width because absolutely positioned elements 
            do not stretch unstyled flex parents in React Native.
          */}
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={{ flex: 1, width: "100%" }}
          >
            <View style={[styles.bottomSheet, { backgroundColor: colors.surface2, borderTopColor: colors.line }]}>
              <View style={[styles.sheetGrab, { backgroundColor: colors.line }]} />

              <Text style={[styles.sheetTitle, { color: colors.text }]}>New command</Text>
              <Text style={[styles.sheetSub, { color: colors.muted }]}>
                Runs the agent with your prompt, like <Text style={styles.monoText}>ask</Text>. Use it as{" "}
                <Text style={styles.monoText}>{newCmdName.trim() ? newCmdName.trim().toLowerCase() : "name"} "your query"</Text>.
              </Text>

              <View style={[styles.inputBoxField, { backgroundColor: colors.surface, borderColor: colors.line }]}>
                <TextInput
                  style={[styles.formInput, { color: colors.text, borderColor: "transparent", backgroundColor: "transparent" }]}
                  placeholder="command name (e.g. explain)"
                  placeholderTextColor={colors.faint}
                  autoCapitalize="none"
                  value={newCmdName}
                  onChangeText={setNewCmdName}
                />
              </View>
              <View style={[styles.inputBoxField, { backgroundColor: colors.surface, borderColor: colors.line }]}>
                <TextInput
                  style={[styles.formInput, { color: colors.text, borderColor: "transparent", backgroundColor: "transparent" }]}
                  placeholder="short description (optional)"
                  placeholderTextColor={colors.faint}
                  value={newCmdDesc}
                  onChangeText={setNewCmdDesc}
                />
              </View>
              <View style={[styles.inputBoxField, { backgroundColor: colors.surface, borderColor: colors.line }]}>
                <TextInput
                  style={[styles.sheetTextArea, { color: colors.text }]}
                  multiline={true}
                  numberOfLines={4}
                  placeholder="system prompt — how the agent should generate cards"
                  placeholderTextColor={colors.faint}
                  value={newCmdPrompt}
                  onChangeText={setNewCmdPrompt}
                />
              </View>

              <TouchableOpacity
                style={[
                  styles.sheetPrimaryBtn,
                  { backgroundColor: accent.primary, opacity: newCmdName.trim() && newCmdPrompt.trim() ? 1 : 0.5 },
                ]}
                onPress={handleCreateCommand}
                disabled={!newCmdName.trim() || !newCmdPrompt.trim()}
              >
                <Text style={styles.sheetPrimaryBtnText}>Create command</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* ONBOARDING QUESTIONNAIRE SCREEN */}
      <Modal visible={state.isOnboardingOpen} animationType="slide">
        <SafeAreaView style={[styles.onbContainer, { backgroundColor: colors.bg }]}>
          <View style={styles.onbPipsRow}>
            {ONBOARDING_QUESTIONS.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.onbPip,
                  { backgroundColor: colors.line },
                  i <= state.onboardingStep && { backgroundColor: accent.primary },
                ]}
              />
            ))}
          </View>

          <View style={styles.onbBody}>
            <Text style={[styles.onbEyebrow, { color: accent.primary }]}>{currentOnboardingQ.eyebrow}</Text>
            <Text style={[styles.onbQuestionText, { color: colors.text }]}>{currentOnboardingQ.q}</Text>
            
            <TextInput
              style={[styles.onbInput, { color: colors.text, borderColor: colors.line }]}
              placeholder={currentOnboardingQ.ph}
              placeholderTextColor={colors.faint}
              value={onboardingInput}
              onChangeText={setOnboardingInput}
              onSubmitEditing={() => handleOnboardingSubmit()}
              autoFocus={true}
              secureTextEntry={state.onboardingStep === 0}
            />
          </View>

          <View style={styles.onbFooter}>
            <TouchableOpacity
              style={[styles.onbNextBtn, { backgroundColor: accent.primary }]}
              onPress={() => handleOnboardingSubmit()}
            >
              <Text style={styles.onbNextBtnText}>
                {state.onboardingStep === ONBOARDING_QUESTIONS.length - 1 ? "Build my workspace" : "Continue"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.onbSkipBtn} onPress={() => controller.skipOnboarding()}>
              <Text style={{ color: colors.faint, fontSize: 13 }}>Skip for now</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      {/* TOAST MESSAGE ELEMENT */}
      {state.toastMessage ? (
        <View style={[styles.toastCard, { backgroundColor: colors.surface2, borderColor: colors.line }]}>
          <Text style={[styles.toastText, { color: colors.text }]}>{state.toastMessage}</Text>
        </View>
      ) : null}
    </View>
  );
}

// Styling system supporting reachability and Unix mobile aesthetics
const styles = StyleSheet.create({
  outerContainer: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  appFrame: {
    flex: 1,
    maxWidth: 480,
    width: "100%",
    alignSelf: "center",
    borderLeftWidth: 1,
    borderRightWidth: 1,
    position: "relative",
  },
  topbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 12,
  },
  wsSwitch: {
    flexDirection: "row",
    alignItems: "center",
  },
  wsDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 5,
  },
  wsText: {
    fontSize: 15,
    fontWeight: "600",
    letterSpacing: -0.2,
  },
  wsChev: {
    fontSize: 11,
    marginLeft: 8,
    marginTop: 1,
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  breadcrumbBar: {
    paddingHorizontal: 18,
    paddingBottom: 8,
  },
  breadcrumbContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  crumbItem: {
    flexDirection: "row",
    alignItems: "center",
  },
  crumbSep: {
    fontSize: 13,
    marginHorizontal: 6,
  },
  crumbText: {
    fontSize: 13,
    fontWeight: "600",
  },
  canvas: {
    flex: 1,
    paddingHorizontal: 16,
  },
  canvasContent: {
    paddingBottom: 140,
  },
  dueBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginVertical: 8,
  },
  dueBannerText: {
    fontSize: 13.5,
    color: "#F2A65A",
    fontWeight: "600",
  },
  dueBannerBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 9,
  },
  dueBannerBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0A0B0F",
  },
  emptyView: {
    alignItems: "center",
    paddingVertical: 80,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "500",
    marginBottom: 6,
    letterSpacing: -0.2,
  },
  emptySub: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    maxWidth: 320,
  },
  monoText: {
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  card: {
    position: "relative",
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 15,
    paddingLeft: 18,
    paddingRight: 16,
    marginBottom: 11,
    overflow: "hidden",
  },
  cardSpine: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 7,
  },
  cardTypeLabel: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 1.3,
    textTransform: "uppercase",
  },
  selDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: "#5A5F6B",
    alignItems: "center",
    justifyContent: "center",
  },
  selDotCheck: {
    fontSize: 11,
    fontWeight: "bold",
    color: "#06120f",
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "600",
    letterSpacing: -0.2,
    lineHeight: 21,
  },
  cardBodyPreview: {
    fontSize: 13.5,
    marginTop: 5,
    lineHeight: 18,
  },
  dueMetaText: {
    fontSize: 11,
    marginTop: 9,
    fontWeight: "600",
  },
  drawerHandle: {
    position: "absolute",
    right: 0,
    top: "45%",
    width: 18,
    height: 84,
    borderTopLeftRadius: 14,
    borderBottomLeftRadius: 14,
    borderWidth: 1,
    borderRightWidth: 0,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: -4, height: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
  },
  drawerGrip: {
    width: 3,
    height: 42,
    borderRadius: 1.5,
    backgroundColor: "#4EC7C0",
  },
  selBar: {
    position: "absolute",
    left: "5%",
    right: "5%",
    bottom: 24,
    borderRadius: 999,
    borderWidth: 1,
    paddingLeft: 18,
    paddingRight: 8,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  selBarRunBtn: {
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 999,
  },
  selBarRunBtnText: {
    fontSize: 13.5,
    fontWeight: "700",
    color: "#06120f",
  },
  selBarClearText: {
    fontSize: 12,
    padding: 6,
  },
  scrim: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalCenteredView: {
    width: "90%",
    maxWidth: 420,
    maxHeight: "80%",
  },
  modalContent: {
    borderRadius: 24,
    borderWidth: 1,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 20,
  },
  modalHead: {
    padding: 18,
    paddingBottom: 6,
  },
  modalLabel: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1.3,
  },
  modalSub: {
    fontSize: 14,
    marginTop: 3,
  },
  modalBody: {
    maxHeight: 300,
    paddingHorizontal: 14,
  },
  groupLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 6,
  },
  groupLabelText: {
    fontSize: 10.5,
    fontWeight: "600",
    letterSpacing: 1.3,
  },
  groupEditBtn: {
    fontSize: 12,
    fontWeight: "600",
  },
  chipContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 4,
    gap: 8,
  },
  cmdChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 13,
    borderWidth: 1,
    marginBottom: 4,
  },
  chipDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  chipText: {
    fontSize: 14,
    fontWeight: "500",
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  cmdRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 13,
    paddingHorizontal: 12,
    borderRadius: 13,
  },
  rowDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    marginRight: 13,
  },
  rowInfo: {
    flex: 1,
  },
  rowName: {
    fontSize: 15,
    fontWeight: "600",
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  rowDesc: {
    fontSize: 12.5,
    marginTop: 1,
  },
  pinStarBtn: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  cmdLine: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  cmdChevron: {
    fontSize: 16,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    marginRight: 8,
  },
  cmdTextInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    padding: 0,
  },
  cmdGoBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  cmdGoText: {
    color: "#06120f",
    fontSize: 16,
    fontWeight: "bold",
  },
  fullCardContainer: {
    flex: 1,
  },
  fullCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  fullCardType: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1.3,
  },
  fullCardCloseText: {
    fontSize: 14,
  },
  fullCardBody: {
    flex: 1,
    paddingHorizontal: 24,
  },
  fullCardTitle: {
    fontSize: 26,
    fontWeight: "bold",
    letterSpacing: -0.5,
    lineHeight: 31,
    marginBottom: 18,
  },
  fullCardText: {
    fontSize: 18,
    lineHeight: 28,
  },
  veil: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    marginTop: 26,
  },
  veilTitle: {
    fontSize: 13,
    fontWeight: "600",
  },
  veilSub: {
    fontSize: 12,
    marginTop: 5,
  },
  revealBox: {
    marginTop: 8,
  },
  citeBox: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: 7,
    paddingVertical: 2,
    paddingHorizontal: 8,
    marginTop: 14,
  },
  citeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  fullCardFooter: {
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    gap: 10,
  },
  fullCardBackBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
  },
  fullCardPipeBtn: {
    flex: 1.2,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
  },
  fullCardDeleteBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
  },
  reviewContainer: {
    flex: 1,
  },
  reviewHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  reviewProgressText: {
    fontSize: 12,
  },
  reviewEndText: {
    fontSize: 14,
  },
  reviewBody: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  reviewTitleText: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1.3,
    textTransform: "uppercase",
    marginBottom: 16,
  },
  reviewQuestionText: {
    fontSize: 24,
    fontWeight: "600",
    letterSpacing: -0.4,
    lineHeight: 31,
  },
  reviewAnswerText: {
    fontSize: 19,
    fontWeight: "600",
    lineHeight: 28,
  },
  reviewFooter: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  revealBtn: {
    padding: 15,
    borderRadius: 16,
    alignItems: "center",
  },
  revealBtnText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#06120f",
  },
  gradingRow: {
    flexDirection: "row",
    gap: 11,
  },
  gradeNoBtn: {
    flex: 1,
    padding: 15,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
  },
  gradeNoText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#E8829B",
  },
  gradeYesBtn: {
    flex: 1,
    padding: 15,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
  },
  gradeYesText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#4EC7C0",
  },
  gradeTimeSub: {
    fontSize: 10,
    marginTop: 2,
  },
  bottomSheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderTopWidth: 1,
    paddingTop: 10,
    paddingBottom: 30,
    maxHeight: "85%",
  },
  sheetGrab: {
    width: 38,
    height: 5,
    borderRadius: 2.5,
    alignSelf: "center",
    marginBottom: 14,
  },
  sheetTitle: {
    fontSize: 19,
    fontWeight: "bold",
    letterSpacing: -0.3,
    paddingHorizontal: 24,
  },
  sheetSub: {
    fontSize: 13.5,
    paddingHorizontal: 24,
    paddingBottom: 14,
  },
  sheetList: {
    paddingHorizontal: 12,
  },
  sheetItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
  },
  sheetItemDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    marginRight: 12,
  },
  sheetItemName: {
    fontSize: 15.5,
    fontWeight: "500",
  },
  addWsRow: {
    flexDirection: "row",
    borderTopWidth: 1,
    paddingTop: 14,
    paddingHorizontal: 14,
    gap: 8,
  },
  addWsInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  addWsBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  addWsBtnText: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#06120f",
  },
  deleteWsBtn: {
    padding: 14,
    marginTop: 8,
    alignItems: "center",
  },
  deleteWsText: {
    color: "#E8829B",
    fontSize: 14,
    fontWeight: "600",
  },
  settingsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
  },
  settingsLabel: {
    fontSize: 15,
  },
  segmentedControl: {
    flexDirection: "row",
    borderRadius: 11,
    borderWidth: 1,
    padding: 3,
  },
  segment: {
    paddingVertical: 7,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  swatchRow: {
    flexDirection: "row",
    gap: 10,
  },
  swatch: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },
  formSection: {
    marginTop: 14,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 6,
  },
  formInput: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    fontSize: 15,
  },
  onbRestartBtn: {
    marginTop: 24,
    paddingVertical: 12,
  },
  inputBoxField: {
    marginHorizontal: 18,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  sheetTextArea: {
    fontSize: 15,
    lineHeight: 22,
    textAlignVertical: "top",
  },
  sheetPrimaryBtn: {
    marginHorizontal: 18,
    padding: 14,
    borderRadius: 14,
    alignItems: "center",
  },
  sheetPrimaryBtnText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#06120f",
  },
  onbContainer: {
    flex: 1,
    paddingHorizontal: 28,
  },
  onbPipsRow: {
    flexDirection: "row",
    paddingTop: 28,
    gap: 6,
  },
  onbPip: {
    flex: 1,
    height: 3,
    borderRadius: 1.5,
  },
  onbBody: {
    flex: 1,
    justifyContent: "center",
  },
  onbEyebrow: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1.6,
    textTransform: "uppercase",
    marginBottom: 18,
  },
  onbQuestionText: {
    fontSize: 30,
    fontWeight: "700",
    letterSpacing: -0.8,
    lineHeight: 36,
    marginBottom: 26,
  },
  onbInput: {
    borderBottomWidth: 1,
    fontSize: 18,
    paddingVertical: 8,
  },
  onbFooter: {
    paddingBottom: 30,
  },
  onbNextBtn: {
    padding: 16,
    borderRadius: 16,
    alignItems: "center",
  },
  onbNextBtnText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#06120f",
  },
  onbSkipBtn: {
    alignItems: "center",
    padding: 14,
    marginTop: 4,
  },
  toastCard: {
    position: "absolute",
    alignSelf: "center",
    bottom: 96,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    maxWidth: "80%",
  },
  toastText: {
    fontSize: 13.5,
    textAlign: "center",
  },
  modelChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginRight: 8,
  },
  modelChipText: {
    fontSize: 13,
    fontWeight: "600",
  },
  systemPromptBox: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 10,
    marginTop: 6,
  },
  systemPromptInput: {
    fontSize: 14,
    lineHeight: 20,
    textAlignVertical: "top",
    minHeight: 100,
  },
  dropdownTrigger: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 6,
  },
  dropdownTriggerText: {
    fontSize: 14.5,
    fontWeight: "500",
  },
  dropdownChevron: {
    fontSize: 12,
  },
  dropdownMenu: {
    borderWidth: 1,
    borderRadius: 14,
    marginTop: 6,
    padding: 6,
    overflow: "hidden",
  },
  dropdownHeader: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 4,
    letterSpacing: 0.8,
  },
  dropdownItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginVertical: 1,
  },
  dropdownItemText: {
    fontSize: 13.5,
    fontWeight: "600",
  },
  dropdownItemSubtext: {
    fontSize: 10.5,
    marginTop: 2,
  },
});
