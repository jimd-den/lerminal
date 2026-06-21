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
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppState, LearnimalController, DEFAULT_SYSTEM_PROMPT, DEFAULT_CHUNK_SYSTEM_PROMPT } from "../../adapters/presenters/LearnimalController";
import { useControllerState } from "./useControllerState";
import { resolveCardType } from "../../entities/cardTypeDefinition";
import Markdown from "react-native-markdown-display";
import { WebView } from "react-native-webview";

// Accent and card type color definitions conforming to prototype specs
const ACCENTS = {
  teal: { primary: "#4EC7C0", soft: "rgba(78,199,192,0.14)", line: "rgba(78,199,192,0.38)" },
  lilac: { primary: "#B49CE6", soft: "rgba(180,156,230,0.16)", line: "rgba(180,156,230,0.40)" },
  amber: { primary: "#E0A45E", soft: "rgba(224,164,94,0.16)", line: "rgba(224,164,94,0.40)" },
  rose: { primary: "#E8829B", soft: "rgba(232,130,155,0.16)", line: "rgba(232,130,155,0.40)" },
  arctic: { primary: "#7FB2E8", soft: "rgba(127,178,232,0.16)", line: "rgba(127,178,232,0.40)" },
};

const CARD_COLORS: Record<string, string> = {
  source: "#B49CE6",
  chunk: "#7FB2E8",
  question: "#4EC7C0",
  note: "#E8829B",
  group: "#9AA7B5",
  search: "#E0A45E",
  cloze: "#5BC8A8",
  elaboration: "#C9A24B",
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
  search: { dot: CARD_COLORS.source, desc: "Search the web for links and text" },
  chunk: { dot: CARD_COLORS.chunk, desc: "Split into faithful source chunks" },
  recall: { dot: CARD_COLORS.question, desc: "Make active-recall questions" },
  cloze: { dot: CARD_COLORS.cloze, desc: "Make fill-in-the-blank cards" },
  elaborate: { dot: CARD_COLORS.elaboration, desc: "Explain it in your own words" },
  space: { dot: CARD_COLORS.due, desc: "Schedule with spaced repetition" },
  review: { dot: CARD_COLORS.due, desc: "Run today's due reviews" },
  move: { dot: CARD_COLORS.source, desc: "Send cards to another workspace" },
  group: { dot: CARD_COLORS.group, desc: "Bundle selected cards into a group" },
  ungroup: { dot: CARD_COLORS.group, desc: "Dissolve a group, freeing its cards" },
};



/**
 * Wraps a card's HTML body in a minimal, theme-aware document for the WebView. If the
 * body is already a full document (has an <html> tag), it's rendered as-is so the
 * AI/user retains full control.
 */
function buildInteractiveHtml(body: string, bg: string, fg: string, accent: string): string {
  if (/<html[\s>]/i.test(body)) return body;
  return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>
    html,body{margin:0;padding:14px;background:${bg};color:${fg};font-family:-apple-system,system-ui,Roboto,sans-serif;font-size:16px;line-height:1.5}
    a{color:${accent}} button,input,select,textarea{font-size:16px;font-family:inherit}
    button{background:${accent};color:#fff;border:none;border-radius:8px;padding:8px 14px}
    input,select,textarea{background:transparent;color:${fg};border:1px solid ${accent};border-radius:8px;padding:6px 8px}
  </style></head><body>${body}</body></html>`;
}

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
  const [cardVeilRevealed, setCardVeilRevealed] = useState<Record<string, boolean>>({});
  const [systemPromptInput, setSystemPromptInput] = useState(state.customSystemPrompt);
  const [chunkSystemPromptInput, setChunkSystemPromptInput] = useState(state.customChunkSystemPrompt);
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const [newPresetName, setNewPresetName] = useState("");
  // Typed answer/explanation during a review (cloze fill-in, elaboration write-in).
  const [reviewInput, setReviewInput] = useState("");
  // HTML editing state for interactive cards in the card detail overlay.
  const [htmlEditMode, setHtmlEditMode] = useState(false);
  const [htmlDraft, setHtmlDraft] = useState("");

  // Custom command creation sheet state
  const [isCreateCmdOpen, setIsCreateCmdOpen] = useState(false);
  const [newCmdName, setNewCmdName] = useState("");
  const [newCmdDesc, setNewCmdDesc] = useState("");
  const [newCmdPrompt, setNewCmdPrompt] = useState("");
  const [newCmdKind, setNewCmdKind] = useState<"agent" | "pipeline">("agent");
  const [newCmdBody, setNewCmdBody] = useState("");
  const [newFlagName, setNewFlagName] = useState("");
  const [newFlagDomain, setNewFlagDomain] = useState("");

  const openCreateCommand = () => {
    setNewCmdName("");
    setNewCmdDesc("");
    setNewCmdPrompt("");
    setNewCmdBody("");
    setNewCmdKind("agent");
    setIsCreateCmdOpen(true);
  };

  const newCmdPayloadValid =
    newCmdKind === "agent" ? !!newCmdPrompt.trim() : !!newCmdBody.trim();

  const handleCreateCommand = () => {
    if (!newCmdName.trim() || !newCmdPayloadValid) return;
    controller.createCustomCommand({
      name: newCmdName,
      description: newCmdDesc,
      kind: newCmdKind,
      systemPrompt: newCmdKind === "agent" ? newCmdPrompt : undefined,
      body: newCmdKind === "pipeline" ? newCmdBody : undefined,
    });
    setIsCreateCmdOpen(false);
  };

  const confirmDeleteCard = (cardId: string) => {
    Alert.alert("Delete card?", "This permanently removes the card.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => controller.deleteCard(cardId) },
    ]);
  };

  const confirmDeleteGroup = (cardId: string, title: string, childCount: number) => {
    Alert.alert(
      `Delete "${title}"?`,
      childCount > 0
        ? `This permanently deletes the group and the ${childCount} card${childCount > 1 ? "s" : ""} inside it.`
        : "This permanently deletes the group.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete group", style: "destructive", onPress: () => controller.deleteCard(cardId, true) },
      ]
    );
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

  React.useEffect(() => {
    setChunkSystemPromptInput(state.customChunkSystemPrompt);
  }, [state.customChunkSystemPrompt]);

  const activeWs = state.workspaces.find((w) => w.id === state.activeWorkspaceId);
  const dueCount = state.cards.filter(
    (c) => c.type === "question" && c.schedule && c.schedule.dueAt <= Date.now()
  ).length;

  // Resolve a card's visual/behavioral type from the modular registry, so custom
  // card types (and restyled built-ins) drive color, icon, and study behavior.
  const typeOf = (card: { typeId?: string; type: string }) =>
    resolveCardType(card.typeId ?? card.type, state.cardTypes);

  // Seed the review input from the card under review (its saved elaboration, if any),
  // resetting whenever the card changes.
  const reviewCard = state.reviewQueue[state.reviewIndex];
  React.useEffect(() => {
    setReviewInput(reviewCard?.fields?.explanation ?? "");
  }, [reviewCard?.id]);



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

          {!state.openRouterKey && (
            <TouchableOpacity 
              style={{ backgroundColor: 'rgba(232, 130, 155, 0.1)', padding: 12, marginHorizontal: 16, borderRadius: 8, borderWidth: 1, borderColor: '#E8829B', flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}
              onPress={() => controller.setSettingsSheetOpen(true)}
            >
              <Text style={{ fontSize: 16, marginRight: 8 }}>⚠️</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: 13, marginBottom: 2 }}>Missing API Key</Text>
                <Text style={{ color: colors.faint, fontSize: 12 }}>Tap here to configure your OpenRouter key to enable AI features.</Text>
              </View>
              <Text style={{ color: '#E8829B', fontWeight: 'bold' }}>→</Text>
            </TouchableOpacity>
          )}

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
            {state.visibleCards.length === 0 && state.pendingOperations.length === 0 ? (
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
              <View>
                {/* Pending Operations Placeholders */}
                {state.pendingOperations.slice().reverse().map((op) => (
                  <View
                    key={op.id}
                    style={[
                      styles.card,
                      { backgroundColor: colors.surface, borderColor: op.status === "error" ? "#E8829B" : colors.line }
                    ]}
                  >
                    <View style={[styles.cardSpine, { backgroundColor: op.status === "error" ? "#E8829B" : CARD_COLORS.chunk }]} />
                    <View style={styles.cardHeader}>
                      <Text style={[styles.cardTypeLabel, { color: op.status === "error" ? "#E8829B" : CARD_COLORS.chunk }]}>
                        {op.commandName} · {op.status === "loading" ? "generating..." : "failed"}
                      </Text>
                    </View>
                    <View style={{ paddingVertical: 12, paddingHorizontal: 16 }}>
                      {op.status === "loading" ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <ActivityIndicator size="small" color={accent.primary} style={{ marginRight: 12 }} />
                          <Text style={{ color: colors.muted }}>Working on it...</Text>
                        </View>
                      ) : (
                        <View>
                          <Text style={{ color: colors.text, fontWeight: 'bold', marginBottom: 4 }}>Error during generation</Text>
                          <Text style={{ color: colors.faint }}>{op.errorMessage}</Text>
                          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                            <TouchableOpacity
                              onPress={() => controller.retryPipeline(op.id)}
                              style={{ minHeight: 44, justifyContent: 'center', paddingVertical: 8, paddingHorizontal: 18, backgroundColor: accent.primary, alignSelf: 'flex-start', borderRadius: 8 }}
                            >
                              <Text style={{ color: colors.surface, fontSize: 13, fontWeight: 'bold' }}>↻ Rerun</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => controller.removePendingOperation(op.id)}
                              style={{ minHeight: 44, justifyContent: 'center', paddingVertical: 8, paddingHorizontal: 16, backgroundColor: colors.lineSoft, alignSelf: 'flex-start', borderRadius: 8 }}
                            >
                              <Text style={{ color: colors.text, fontSize: 13 }}>Dismiss</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      )}
                    </View>
                  </View>
                ))}

              {/* Card Flow Render — only the current group's direct children. */}
              {state.visibleCards
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
                          <View style={{ flexDirection: "row", alignItems: "center" }}>
                            <TouchableOpacity
                              style={styles.cardDeleteBtn}
                              onPress={() => confirmDeleteGroup(card.id, card.title, childCount)}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                              <Text style={{ color: "#E8829B", fontSize: 16, fontWeight: "600" }}>🗑</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.selDot, isSelected && { backgroundColor: accent.primary, borderColor: accent.primary }]}
                              onPress={() => controller.toggleSelect(card.id)}
                            >
                              {isSelected && <Text style={styles.selDotCheck}>✓</Text>}
                            </TouchableOpacity>
                          </View>
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
                              : typeOf(card).color,
                          },
                        ]}
                      />

                      <View style={styles.cardHeader}>
                        <Text style={[styles.cardTypeLabel, { color: typeOf(card).color }]}>
                          {typeOf(card).icon} {typeOf(card).name}{isSpaced && " · spaced"}
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
                      {card.type === "search" ? (
                        <Text numberOfLines={2} style={[styles.cardBodyPreview, { color: colors.muted }]}>
                          {(() => {
                            try {
                              const res = JSON.parse(card.body);
                              return `${res.length} recommended links available`;
                            } catch { return "Search results"; }
                          })()}
                        </Text>
                      ) : card.type !== "question" && (
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
                })}
              </View>
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
                <Text style={{ color: colors.text, fontWeight: "bold" }}>{state.selection.size}</Text> card{state.selection.size > 1 ? "s" : ""} selected
              </Text>
              <TouchableOpacity
                style={[styles.selBarRunBtn, { backgroundColor: accent.primary }]}
                onPress={() => controller.setModalOpen(true)}
              >
                <Text style={styles.selBarRunBtnText}>Pipe →</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => controller.clearSelection()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
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
                      Pipes <Text style={{ color: accent.primary }}>{state.selection.size}</Text> selected card{state.selection.size > 1 ? "s" : ""}
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
                <Text style={[styles.fullCardType, { color: typeOf(card).color }]}>
                  {typeOf(card).icon} {typeOf(card).name.toUpperCase()} {card.schedule && "· SPACED"}
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
                ) : card.type === "search" ? (
                  <View>
                    {(() => {
                      try {
                        const results = JSON.parse(card.body);
                        return results.map((res: any, idx: number) => {
                          const isExtracting = state.pendingOperations.some(op => op.commandName === `Extracting ${res.url}...`);
                          return (
                            <View key={idx} style={{ marginBottom: 20, padding: 12, backgroundColor: colors.surface2, borderRadius: 8 }}>
                              <Text style={{ color: colors.text, fontSize: 16, fontWeight: "bold", marginBottom: 4 }}>{res.title}</Text>
                              <Text style={{ color: colors.muted, fontSize: 14, marginBottom: 12 }}>{res.snippet}</Text>
                              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                                <Text style={{ color: accent.primary, fontSize: 12, flex: 1, marginRight: 8 }} numberOfLines={1}>{res.url}</Text>
                                <TouchableOpacity 
                                  style={{ paddingHorizontal: 12, paddingVertical: 6, backgroundColor: accent.soft, borderRadius: 6, borderColor: accent.line, borderWidth: 1 }}
                                  onPress={() => controller.extractUrlToCard(res.url, res.title, card.parentId ?? undefined)}
                                  disabled={isExtracting}
                                >
                                  {isExtracting ? (
                                    <ActivityIndicator size="small" color={accent.primary} />
                                  ) : (
                                    <Text style={{ color: accent.primary, fontWeight: "bold", fontSize: 13 }}>📥 Extract</Text>
                                  )}
                                </TouchableOpacity>
                              </View>
                            </View>
                          );
                        });
                      } catch {
                        return <Text style={{ color: colors.text }}>Invalid search data</Text>;
                      }
                    })()}
                  </View>
                ) : typeOf(card).render === "html" ? (
                  <View>
                    {htmlEditMode ? (
                      <View>
                        <TextInput
                          style={[styles.htmlEditor, { color: colors.text, backgroundColor: colors.surface2, borderColor: colors.line }]}
                          multiline
                          autoCapitalize="none"
                          autoCorrect={false}
                          value={htmlDraft}
                          onChangeText={setHtmlDraft}
                          placeholder="<html> … paste or write interactive HTML here"
                          placeholderTextColor={colors.faint}
                        />
                        <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                          <TouchableOpacity
                            style={{ backgroundColor: accent.primary, minHeight: 44, justifyContent: "center", paddingHorizontal: 18, borderRadius: 10 }}
                            onPress={() => { controller.setCardBody(card.id, htmlDraft); setHtmlEditMode(false); }}
                          >
                            <Text style={{ color: "#fff", fontWeight: "bold" }}>Save & run</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={{ borderColor: colors.line, borderWidth: 1, minHeight: 44, justifyContent: "center", paddingHorizontal: 18, borderRadius: 10 }}
                            onPress={() => setHtmlEditMode(false)}
                          >
                            <Text style={{ color: colors.text }}>Cancel</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ) : card.body.trim().length === 0 ? (
                      <TouchableOpacity
                        style={[styles.veil, { backgroundColor: colors.surface, borderColor: colors.line }]}
                        onPress={() => { setHtmlDraft(card.body); setHtmlEditMode(true); }}
                      >
                        <Text style={[styles.veilTitle, { color: colors.muted }]}>Empty interactive card</Text>
                        <Text style={[styles.veilSub, { color: colors.faint }]}>Tap to add HTML</Text>
                      </TouchableOpacity>
                    ) : (
                      <View style={{ height: 460, borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: colors.line }}>
                        <WebView
                          originWhitelist={["*"]}
                          source={{ html: buildInteractiveHtml(card.body, colors.surface, colors.text, accent.primary) }}
                          style={{ backgroundColor: colors.surface }}
                          javaScriptEnabled
                        />
                      </View>
                    )}
                  </View>
                ) : (
                  <View>
                    <Markdown
                      style={{
                        body: { color: colors.text, fontSize: 16, lineHeight: 24 },
                        heading1: { fontSize: 24, fontWeight: "bold", color: colors.text, marginVertical: 10 },
                        heading2: { fontSize: 20, fontWeight: "bold", color: colors.text, marginVertical: 8 },
                        heading3: { fontSize: 18, fontWeight: "bold", color: colors.text, marginVertical: 6 },
                        link: { color: accent.primary, textDecorationLine: "none", fontWeight: "bold" },
                        code_inline: { backgroundColor: colors.surface2, color: accent.primary, borderRadius: 4 },
                        code_block: { backgroundColor: colors.surface2, color: colors.text, padding: 12, borderRadius: 8 },
                        list_item: { marginVertical: 4 }
                      }}
                      rules={{
                        // Override the default image rule to completely bypass FitImage
                        // This prevents React 18 "key being spread" warnings and RN layout errors
                        image: () => null
                      }}
                      onLinkPress={(url) => {
                        let absoluteUrl = url;
                        try {
                          // Resolve relative paths against the card's original URL (stored in cite)
                          absoluteUrl = new URL(url, card.cite || "https://en.wikipedia.org").toString();
                        } catch (e) {
                          console.warn("Failed to resolve URL:", url);
                        }

                        controller.extractUrlToCard(absoluteUrl, absoluteUrl, card.parentId ?? undefined, card.id);
                        return false; // prevent default browser open
                      }}
                    >
                      {card.body}
                    </Markdown>
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

                {/* Interactive HTML: edit existing, or convert a content card into one */}
                {typeOf(card).render === "html" ? (
                  <TouchableOpacity
                    style={[styles.fullCardPipeBtn, { borderColor: accent.line }]}
                    onPress={() => { setHtmlDraft(card.body); setHtmlEditMode(true); }}
                  >
                    <Text style={{ color: accent.primary, fontWeight: "600" }}>{"</> Edit HTML"}</Text>
                  </TouchableOpacity>
                ) : (card.type === "source" || card.type === "chunk" || card.type === "note") && (
                  <TouchableOpacity
                    style={[styles.fullCardPipeBtn, { borderColor: accent.line }]}
                    onPress={() => controller.setCardType(card.id, "interactive")}
                  >
                    <Text style={{ color: accent.primary, fontWeight: "600" }}>{"</> Interactive"}</Text>
                  </TouchableOpacity>
                )}

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

              {(() => {
                const behavior = typeOf(currentCard).learning;
                const promptLabel =
                  behavior === "cloze" ? "Fill in the blanks"
                  : behavior === "elaboration" ? "Explain it in your own words"
                  : "Recall — don't peek";
                // For cloze, a loose check: did the typed answer mention the key term(s)?
                const answerText = (currentCard.answer || "").toLowerCase();
                const guess = reviewInput.trim().toLowerCase();
                const clozeCorrect =
                  behavior === "cloze" && guess.length > 0 &&
                  answerText.split(",").some(term => {
                    const t = term.trim();
                    return t.length > 0 && (guess.includes(t) || t.includes(guess));
                  });

                return (
                  <View style={styles.reviewBody}>
                    <Text style={[styles.reviewTitleText, { color: CARD_COLORS.question }]}>{promptLabel}</Text>
                    <Text style={[styles.reviewQuestionText, { color: colors.text }]}>{currentCard.title}</Text>

                    {/* Interactive input for cloze / elaboration cards */}
                    {(behavior === "cloze" || behavior === "elaboration") && (
                      <View style={[styles.reviewInputBox, { backgroundColor: colors.surface, borderColor: colors.line }]}>
                        <TextInput
                          style={[styles.reviewInput, { color: colors.text }]}
                          value={reviewInput}
                          onChangeText={setReviewInput}
                          multiline={behavior === "elaboration"}
                          numberOfLines={behavior === "elaboration" ? 4 : 1}
                          autoCapitalize="none"
                          placeholder={behavior === "cloze" ? "type the missing term(s)…" : "write your explanation…"}
                          placeholderTextColor={colors.faint}
                          onBlur={() => {
                            if (behavior === "elaboration") controller.setCardField(currentCard.id, "explanation", reviewInput);
                          }}
                        />
                      </View>
                    )}

                    {state.reviewRevealAnswer ? (
                      <View style={{ marginTop: 20 }}>
                        {behavior === "cloze" && (
                          <Text style={{ color: clozeCorrect ? "#5BC8A8" : "#E8829B", fontWeight: "700", marginBottom: 8 }}>
                            {clozeCorrect ? "✓ Correct" : "✗ Not quite"}
                          </Text>
                        )}
                        <Text style={{ color: colors.faint, fontSize: 12, marginBottom: 4 }}>
                          {behavior === "elaboration" ? "Model answer" : "Answer"}
                        </Text>
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
                );
              })()}

              {/* Buttons footer */}
              <View style={styles.reviewFooter}>
                {!state.reviewRevealAnswer ? (
                  <TouchableOpacity
                    style={[styles.revealBtn, { backgroundColor: accent.primary }]}
                    onPress={() => {
                      if (typeOf(currentCard).learning === "elaboration") {
                        controller.setCardField(currentCard.id, "explanation", reviewInput);
                      }
                      controller.revealReviewAnswer();
                    }}
                  >
                    <Text style={styles.revealBtnText}>Reveal Answer</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.gradingRow}>
                    {(() => {
                      const iv = currentCard.schedule?.interval || 1;
                      const grades = [
                        { grade: "again" as const, label: "Again", sub: "~10m", color: "#E8829B" },
                        { grade: "hard" as const, label: "Hard", sub: `+${Math.max(1, Math.round(iv * 1.2) + 1)}d`, color: "#E0A45E" },
                        { grade: "good" as const, label: "Good", sub: `+${Math.round(iv * 2.4) + 1}d`, color: "#4EC7C0" },
                        { grade: "easy" as const, label: "Easy", sub: `+${Math.round(iv * 3.2) + 2}d`, color: "#7FB2E8" },
                      ];
                      return grades.map(g => (
                        <TouchableOpacity
                          key={g.grade}
                          style={[styles.gradeBtn, { borderColor: g.color + "55", backgroundColor: g.color + "16" }]}
                          onPress={() => controller.gradeReview(g.grade)}
                        >
                          <Text style={[styles.gradeBtnText, { color: g.color }]}>{g.label}</Text>
                          <Text style={[styles.gradeTimeSub, { color: colors.muted }]}>{g.sub}</Text>
                        </TouchableOpacity>
                      ));
                    })()}
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
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={{ flex: 1, width: "100%" }}
            pointerEvents="box-none"
          >
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
          </KeyboardAvoidingView>
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
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={{ flex: 1, width: "100%" }}
            pointerEvents="box-none"
          >
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

              {/* Interleave reviews toggle */}
              <View style={styles.settingsRow}>
                <Text style={[styles.settingsLabel, { color: colors.text }]}>Interleave reviews</Text>
                <View style={[styles.segmentedControl, { backgroundColor: colors.surface, borderColor: colors.line }]}>
                  <TouchableOpacity
                    style={[styles.segment, state.interleaveReviews && { backgroundColor: colors.raised }]}
                    onPress={() => controller.setInterleaveReviews(true)}
                  >
                    <Text style={{ color: state.interleaveReviews ? colors.text : colors.muted, fontSize: 13 }}>On</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.segment, !state.interleaveReviews && { backgroundColor: colors.raised }]}
                    onPress={() => controller.setInterleaveReviews(false)}
                  >
                    <Text style={{ color: !state.interleaveReviews ? colors.text : colors.muted, fontSize: 13 }}>Off</Text>
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

                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12, marginBottom: 8 }}>
                  <Text style={[styles.sectionLabel, { color: colors.muted, marginTop: 0 }]}>Model Selection</Text>
                  <TouchableOpacity
                    style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 4, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface }}
                    onPress={() => controller.loadAvailableModels()}
                    disabled={state.isLoadingModels}
                  >
                    <Text style={{ color: state.isLoadingModels ? colors.faint : accent.primary, fontSize: 12, fontWeight: "500" }}>
                      {state.isLoadingModels ? "Loading..." : "Fetch Models"}
                    </Text>
                  </TouchableOpacity>
                </View>
                
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
                        const fallbackCustomVal = isCustomSelected ? state.selectedModel : (state.availableModels[0]?.id || "");
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

              {/* Prompt Presets (extendable instructions) */}
              <View style={styles.formSection}>
                <Text style={[styles.sectionLabel, { color: colors.muted, marginTop: 12 }]}>Prompt Presets</Text>
                <Text style={[styles.sheetSub, { color: colors.faint, marginBottom: 8, fontSize: 13 }]}>
                  Pick how cards get written. The strict response format is always enforced for you.
                </Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {state.promptPresets.map((preset) => {
                    const isActive = state.customSystemPrompt === preset.prompt;
                    return (
                      <TouchableOpacity
                        key={preset.id}
                        style={{
                          minHeight: 40, justifyContent: "center", paddingVertical: 8, paddingHorizontal: 14,
                          borderRadius: 20, borderWidth: 1,
                          borderColor: isActive ? accent.primary : colors.line,
                          backgroundColor: isActive ? accent.soft : colors.surface,
                        }}
                        onPress={() => controller.applyPromptPreset(preset.id)}
                        onLongPress={() => {
                          if (!preset.builtin) {
                            Alert.alert(`Delete "${preset.name}"?`, "Removes this custom preset.", [
                              { text: "Cancel", style: "cancel" },
                              { text: "Delete", style: "destructive", onPress: () => controller.deletePromptPreset(preset.id) },
                            ]);
                          }
                        }}
                      >
                        <Text style={{ color: isActive ? accent.primary : colors.text, fontSize: 13, fontWeight: "500" }}>
                          {preset.name}{!preset.builtin ? " ✎" : ""}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {/* Save the current prompt as a new preset */}
                <View style={{ flexDirection: "row", alignItems: "center", marginTop: 10 }}>
                  <TextInput
                    style={[styles.formInput, { flex: 1, marginRight: 8, color: colors.text, borderColor: colors.line, backgroundColor: colors.surface }]}
                    placeholder="name to save current prompt…"
                    placeholderTextColor={colors.faint}
                    value={newPresetName}
                    onChangeText={setNewPresetName}
                  />
                  <TouchableOpacity
                    style={{ backgroundColor: accent.primary, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 8, opacity: newPresetName.trim() ? 1 : 0.5 }}
                    disabled={!newPresetName.trim()}
                    onPress={() => {
                      controller.saveCurrentAsPreset(newPresetName);
                      setNewPresetName("");
                    }}
                  >
                    <Text style={{ color: "#fff", fontWeight: "bold" }}>Save</Text>
                  </TouchableOpacity>
                </View>
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

              {/* Chunk System Prompt Customization */}
              <View style={styles.formSection}>
                <Text style={[styles.sectionLabel, { color: colors.muted, marginTop: 12 }]}>Chunk System Prompt</Text>
                <View style={[styles.systemPromptBox, { backgroundColor: colors.surface, borderColor: colors.line }]}>
                  <TextInput
                    style={[styles.systemPromptInput, { color: colors.text }]}
                    multiline={true}
                    numberOfLines={5}
                    placeholder="Custom instructions for chunk generation..."
                    placeholderTextColor={colors.faint}
                    value={chunkSystemPromptInput}
                    onChangeText={(val) => {
                      setChunkSystemPromptInput(val);
                      controller.setCustomChunkSystemPrompt(val);
                    }}
                  />
                </View>
                <TouchableOpacity
                  style={{ marginTop: 6, alignSelf: "flex-end" }}
                  onPress={() => {
                    setChunkSystemPromptInput(DEFAULT_CHUNK_SYSTEM_PROMPT);
                    controller.setCustomChunkSystemPrompt(DEFAULT_CHUNK_SYSTEM_PROMPT);
                  }}
                >
                  <Text style={{ color: accent.primary, fontSize: 12 }}>Reset to default</Text>
                </TouchableOpacity>
              </View>

              {/* Search Preset Flags */}
              <View style={styles.formSection}>
                <Text style={[styles.sectionLabel, { color: colors.muted, marginTop: 12 }]}>Search Site Flags</Text>
                <Text style={[styles.sheetSub, { color: colors.faint, marginBottom: 8, fontSize: 13 }]}>
                  Map custom flags like "--wiki" to specific domains for the search command.
                </Text>
                {Object.entries(state.searchSiteFlags || {}).map(([flag, domain]) => (
                  <View key={flag} style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
                    <Text style={{ color: colors.text, flex: 1, fontFamily: "monospace" }}>--{flag}</Text>
                    <Text style={{ color: colors.muted, flex: 2 }} numberOfLines={1} ellipsizeMode="middle">{domain}</Text>
                    <TouchableOpacity
                      style={{ padding: 4 }}
                      onPress={() => {
                        const newFlags = { ...state.searchSiteFlags };
                        delete newFlags[flag];
                        controller.updateSearchSiteFlags(newFlags);
                      }}
                    >
                      <Text style={{ color: "#ef4444", fontSize: 20, fontWeight: "bold" }}>×</Text>
                    </TouchableOpacity>
                  </View>
                ))}
                
                {/* Add new flag row */}
                <View style={{ flexDirection: "row", alignItems: "center", marginTop: 8 }}>
                  <TextInput
                    style={[styles.formInput, { flex: 1, marginRight: 8, color: colors.text, borderColor: colors.line, backgroundColor: colors.surface }]}
                    placeholder="flag (e.g. wiki)"
                    placeholderTextColor={colors.faint}
                    value={newFlagName}
                    onChangeText={setNewFlagName}
                  />
                  <TextInput
                    style={[styles.formInput, { flex: 2, marginRight: 8, color: colors.text, borderColor: colors.line, backgroundColor: colors.surface }]}
                    placeholder="domain (e.g. wikipedia.org)"
                    placeholderTextColor={colors.faint}
                    value={newFlagDomain}
                    onChangeText={setNewFlagDomain}
                  />
                  <TouchableOpacity
                    style={{ backgroundColor: accent.primary, paddingHorizontal: 12, paddingVertical: 12, borderRadius: 6 }}
                    onPress={() => {
                      if (newFlagName.trim() && newFlagDomain.trim()) {
                        const newFlags = { ...state.searchSiteFlags, [newFlagName.trim().replace(/^--/, "")]: newFlagDomain.trim() };
                        controller.updateSearchSiteFlags(newFlags);
                        setNewFlagName("");
                        setNewFlagDomain("");
                      }
                    }}
                  >
                    <Text style={{ color: "#fff", fontWeight: "bold" }}>Add</Text>
                  </TouchableOpacity>
                </View>
              </View>

            </ScrollView>
          </View>
          </KeyboardAvoidingView>
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
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={{ flex: 1, width: "100%" }}
            pointerEvents="box-none"
          >
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

            {/* PRESET FLAGS FOR SEARCH */}
            {state.pendingCommandName === "search" && Object.keys(state.searchSiteFlags || {}).length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: 18, marginBottom: 12, maxHeight: 32 }}>
                {Object.keys(state.searchSiteFlags || {}).map(flag => {
                  const flagStr = `--${flag}`;
                  const isActive = sheetInput.includes(flagStr);
                  return (
                    <TouchableOpacity
                      key={flag}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        borderRadius: 16,
                        borderWidth: 1,
                        borderColor: isActive ? accent.primary : colors.line,
                        backgroundColor: isActive ? accent.primary + "20" : colors.surface,
                        marginRight: 8,
                        justifyContent: "center"
                      }}
                      onPress={() => {
                        if (isActive) {
                          setSheetInput(sheetInput.replace(new RegExp(`\\s*${flagStr}\\b`, "g"), ""));
                        } else {
                          setSheetInput(sheetInput ? `${sheetInput} ${flagStr}` : flagStr);
                        }
                      }}
                    >
                      <Text style={{ color: isActive ? accent.primary : colors.muted, fontSize: 13, fontWeight: "500" }}>
                        {flagStr}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

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
          </KeyboardAvoidingView>
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
            pointerEvents="box-none"
          >
            <View style={[styles.bottomSheet, { backgroundColor: colors.surface2, borderTopColor: colors.line }]}>
              <View style={[styles.sheetGrab, { backgroundColor: colors.line }]} />

              <Text style={[styles.sheetTitle, { color: colors.text }]}>New command</Text>
              <Text style={[styles.sheetSub, { color: colors.muted }]}>
                {newCmdKind === "agent" ? (
                  <>Runs the agent with your prompt, like <Text style={styles.monoText}>ask</Text>. Use it as{" "}
                  <Text style={styles.monoText}>{newCmdName.trim() ? newCmdName.trim().toLowerCase() : "name"} "your query"</Text>.</>
                ) : (
                  <>A saved pipeline macro. Use <Text style={styles.monoText}>$1</Text> for an argument, e.g.{" "}
                  <Text style={styles.monoText}>ask "$1" | chunk | recall | space</Text>.</>
                )}
              </Text>

              {/* Command kind selector */}
              <View style={{ flexDirection: "row", paddingHorizontal: 18, marginBottom: 12, gap: 8 }}>
                {(["agent", "pipeline"] as const).map(k => (
                  <TouchableOpacity
                    key={k}
                    style={{
                      flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center",
                      borderRadius: 12, borderWidth: 1,
                      borderColor: newCmdKind === k ? accent.primary : colors.line,
                      backgroundColor: newCmdKind === k ? accent.soft : colors.surface,
                    }}
                    onPress={() => setNewCmdKind(k)}
                  >
                    <Text style={{ color: newCmdKind === k ? accent.primary : colors.muted, fontWeight: "600", fontSize: 13 }}>
                      {k === "agent" ? "Agent prompt" : "Pipeline macro"}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

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
                {newCmdKind === "agent" ? (
                  <TextInput
                    style={[styles.sheetTextArea, { color: colors.text }]}
                    multiline={true}
                    numberOfLines={4}
                    placeholder="system prompt — how the agent should generate cards"
                    placeholderTextColor={colors.faint}
                    value={newCmdPrompt}
                    onChangeText={setNewCmdPrompt}
                  />
                ) : (
                  <TextInput
                    style={[styles.sheetTextArea, { color: colors.text, fontFamily: Platform.OS === "ios" ? "Courier" : "monospace" }]}
                    multiline={true}
                    numberOfLines={3}
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder='pipeline — e.g. ask "$1" | chunk | recall | space'
                    placeholderTextColor={colors.faint}
                    value={newCmdBody}
                    onChangeText={setNewCmdBody}
                  />
                )}
              </View>

              <TouchableOpacity
                style={[
                  styles.sheetPrimaryBtn,
                  { backgroundColor: accent.primary, opacity: newCmdName.trim() && newCmdPayloadValid ? 1 : 0.5 },
                ]}
                onPress={handleCreateCommand}
                disabled={!newCmdName.trim() || !newCmdPayloadValid}
              >
                <Text style={styles.sheetPrimaryBtnText}>Create command</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
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
    width: 44,
    height: 44,
    borderRadius: 12,
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
  cardDeleteBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 4,
  },
  selDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1.5,
    borderColor: "#5A5F6B",
    alignItems: "center",
    justifyContent: "center",
  },
  selDotCheck: {
    fontSize: 14,
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
    minHeight: 44,
    paddingVertical: 12,
    paddingHorizontal: 16,
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
    minHeight: 52,
    paddingVertical: 14,
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
    width: 44,
    height: 44,
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
  htmlEditor: {
    minHeight: 220,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    fontSize: 13,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    textAlignVertical: "top",
  },
  reviewInputBox: {
    marginTop: 18,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  reviewInput: {
    fontSize: 17,
    minHeight: 28,
    textAlignVertical: "top",
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
    gap: 8,
  },
  gradeBtn: {
    flex: 1,
    minHeight: 60,
    paddingVertical: 14,
    paddingHorizontal: 6,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  gradeBtnText: {
    fontSize: 15,
    fontWeight: "700",
  },
  gradeTimeSub: {
    fontSize: 10,
    marginTop: 3,
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
