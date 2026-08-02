import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import {
  AppState,
  GriotController,
} from "../../../adapters/presenters/GriotController";
import {
  AssistantCapability,
  createAssistantProfile,
  OutputContractKind,
} from "../../../entities/assistantProfile";
import {
  FieldKind,
  FieldSpec,
  LearningBehavior,
  normalizeCardTypeId,
} from "../../../entities/cardTypeDefinition";
import { ChatMessage } from "../../../usecases/ports/gateways/AgentGateway";
import {
  DEFAULT_CARD_INSTRUCTION,
  DEFAULT_CHUNK_INSTRUCTION,
} from "../../../entities/promptPreset";
import {
  AGENT_PROMPT_DEFINITIONS,
  AGENT_PROMPT_IDS,
  AgentPromptId,
  PARENT_SYSTEM_PROMPT,
} from "../../../entities/agentPrompts";
import { Chip, CollapsibleSection, SectionLabel, Slab } from "./components";
import { ACCENT_OPTIONS, GriotTheme, TypeScale } from "./theme";
import { AppearanceSettingsSection } from "./AppearanceSettings";
import { TrashIcon } from "./Icons";
import { BRAND_NAME } from "../../../entities/brand";

const CAPABILITIES: { id: AssistantCapability; label: string }[] = [
  { id: "generate-cards", label: "CARD GENERATION" },
  { id: "chunk-document", label: "DOCUMENT CHUNKING" },
  { id: "chat", label: "CHAT · ASK GRIOT PERSONAS" },
  { id: "cloze", label: "CLOZE" },
];

export function SettingsScreen({
  controller,
  state,
  theme,
}: {
  controller: GriotController;
  state: AppState;
  theme: GriotTheme;
}) {
  const [apiKey, setApiKey] = useState(state.openRouterKey);
  const [customModel, setCustomModel] = useState(state.selectedModel);
  const [workspaceName, setWorkspaceName] = useState("");
  const [flagName, setFlagName] = useState("");
  const [flagDomain, setFlagDomain] = useState("");
  const [presetName, setPresetName] = useState("");
  const [systemPrompt, setSystemPrompt] = useState(state.customSystemPrompt);
  const [chunkPrompt, setChunkPrompt] = useState(state.customChunkSystemPrompt);
  const [typeName, setTypeName] = useState("");
  const [typeColor, setTypeColor] = useState("#63E6D5");
  const [typeLearning, setTypeLearning] = useState<LearningBehavior>("none");
  const [typeFields, setTypeFields] = useState<FieldSpec[]>([]);
  const [typeFieldLabel, setTypeFieldLabel] = useState("");
  const [typeFieldKind, setTypeFieldKind] = useState<FieldKind>("text");
  const [designerOpen, setDesignerOpen] = useState(false);
  /** Which persona's model picker is expanded, if any. One at a time keeps the list scannable. */
  const [modelPickerProfileId, setModelPickerProfileId] = useState<string | null>(null);

  useEffect(() => setApiKey(state.openRouterKey), [state.openRouterKey]);
  useEffect(() => setCustomModel(state.selectedModel), [state.selectedModel]);
  useEffect(
    () => setSystemPrompt(state.customSystemPrompt),
    [state.customSystemPrompt],
  );
  useEffect(
    () => setChunkPrompt(state.customChunkSystemPrompt),
    [state.customChunkSystemPrompt],
  );

  const createWorkspace = async () => {
    if (!workspaceName.trim()) return;
    await controller.createNewWorkspace(workspaceName);
    setWorkspaceName("");
  };

  const deleteWorkspace = () => {
    const active = state.workspaces.find(
      (workspace) => workspace.id === state.activeWorkspaceId,
    );
    Alert.alert(
      `Delete "${active?.name ?? "space"}"?`,
      "All material in this learning space will be permanently removed.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete space",
          style: "destructive",
          onPress: () => void controller.deleteActiveWorkspace(),
        },
      ],
    );
  };

  const addFlag = async () => {
    const name = flagName.trim().replace(/^--/, "");
    const domain = flagDomain.trim();
    if (!name || !domain) return;
    await controller.updateSearchSiteFlags({
      ...state.searchSiteFlags,
      [name]: domain,
    });
    setFlagName("");
    setFlagDomain("");
  };

  const createType = async () => {
    if (!typeName.trim()) return;
    await controller.createCardType({
      name: typeName,
      color: typeColor,
      icon: "[]",
      learning: typeLearning,
      fields: typeFields,
    });
    setTypeName("");
    setTypeFields([]);
  };

  const addTypeField = () => {
    const label = typeFieldLabel.trim();
    const key = normalizeCardTypeId(label);
    if (!label || typeFields.some((field) => field.key === key)) return;
    setTypeFields((fields) => [...fields, { key, label, kind: typeFieldKind }]);
    setTypeFieldLabel("");
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
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
            Machine configuration
          </Text>
        </View>
        <Text style={[localStyles.tag, { color: theme.accent, fontFamily: theme.fontMono }]}>
          SETTINGS
        </Text>
      </View>

      <CollapsibleSection theme={theme} title="APPEARANCE" defaultOpen>
      <SectionLabel theme={theme}>DISPLAY MODE</SectionLabel>
      <View style={styles.rowWrap}>
        <Chip
          label="DARK HULL"
          active={state.theme === "dark"}
          theme={theme}
          onPress={() => controller.setTheme("dark")}
        />
        <Chip
          label="LIGHT HULL"
          active={state.theme === "light"}
          theme={theme}
          onPress={() => controller.setTheme("light")}
        />
      </View>
      <View style={styles.colorGrid}>
        {ACCENT_OPTIONS.map((option) => (
          <Pressable
            key={option.name}
            onPress={() => controller.setAccent(option.name)}
            style={[
              styles.colorOption,
              {
                borderColor:
                  state.accent === option.name ? option.color : theme.line,
                backgroundColor:
                  state.accent === option.name
                    ? `${option.color}1F`
                    : theme.panelStrong,
              },
            ]}
          >
            <View
              style={[styles.colorBar, { backgroundColor: option.color }]}
            />
            <Text
              style={[
                styles.colorText,
                { color: theme.text, fontFamily: theme.fontMono },
              ]}
            >
              {option.label.toUpperCase()}
            </Text>
          </Pressable>
        ))}
      </View>

      <AppearanceSettingsSection controller={controller} state={state} theme={theme} />
      </CollapsibleSection>

      <CollapsibleSection theme={theme} title="AI LINK // OPENROUTER">
      <Panel theme={theme}>
        <Text style={[styles.helperText, { color: theme.textMuted }]}>
          Model features — Explain, Research, Study cards, and every agent-backed
          suggestion — need your own OpenRouter key. Nothing here is required: the rest
          of GRIOT works fully without one.
        </Text>

        <View style={styles.panelHead}>
          <FieldLabel theme={theme}>API KEY</FieldLabel>
          <Pressable
            accessibilityRole="link"
            onPress={() => void Linking.openURL("https://openrouter.ai/keys")}
          >
            <Text style={[styles.link, { color: theme.accent, fontFamily: theme.fontMono }]}>
              GET A FREE KEY →
            </Text>
          </Pressable>
        </View>
        <TextInput
          secureTextEntry
          value={apiKey}
          onChangeText={setApiKey}
          onBlur={() => controller.setOpenRouterKey(apiKey)}
          placeholder="sk-or-..."
          placeholderTextColor={theme.textFaint}
          autoCapitalize="none"
          autoCorrect={false}
          style={[
            styles.input,
            {
              color: theme.text,
              borderColor: theme.line,
              fontFamily: theme.fontMono,
            },
          ]}
        />
        {/*
         * Honest about what this can and can't confirm: a key that's merely present has
         * not been checked against OpenRouter, and claiming "connected" without a real
         * call would be exactly the fabricated success this app refuses to show. The
         * first real model call is the actual test, and its own error is truthful either
         * way, so this only ever reports what is locally, verifiably true.
         */}
        <View style={styles.keyStatusRow}>
          <View
            style={[
              styles.keyStatusDot,
              { backgroundColor: apiKey.trim() ? theme.accent : theme.textFaint },
            ]}
          />
          <Text style={[styles.keyStatusText, { color: theme.textMuted, fontFamily: theme.fontMono }]}>
            {apiKey.trim() ? "KEY SET — MODEL FEATURES ENABLED" : "NO KEY — MODEL FEATURES OFF"}
          </Text>
        </View>

        <View style={styles.panelHead}>
          <FieldLabel theme={theme}>MODEL</FieldLabel>
          <Pressable
            onPress={() => void controller.loadAvailableModels()}
            disabled={state.isLoadingModels}
          >
            <Text
              style={[
                styles.link,
                { color: theme.accent, fontFamily: theme.fontMono },
              ]}
            >
              {state.isLoadingModels ? "SCANNING..." : "FETCH MODELS"}
            </Text>
          </Pressable>
        </View>
        {state.isLoadingModels ? (
          <ActivityIndicator color={theme.accent} />
        ) : null}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.modelRow}
        >
          {state.availableModels.map((model) => (
            <Pressable
              key={model.id}
              onPress={() => {
                controller.setSelectedModel(model.id);
                setCustomModel(model.id);
              }}
              style={[
                styles.model,
                {
                  borderColor:
                    state.selectedModel === model.id
                      ? theme.accent
                      : theme.line,
                  backgroundColor:
                    state.selectedModel === model.id
                      ? theme.accentSoft
                      : theme.panelMuted,
                },
              ]}
            >
              <Text
                numberOfLines={1}
                style={[
                  styles.modelName,
                  { color: theme.text, fontFamily: theme.fontMono },
                ]}
              >
                {model.name}
              </Text>
              <Text
                style={[
                  styles.modelMeta,
                  {
                    color: model.free ? theme.accent : theme.warning,
                    fontFamily: theme.fontMono,
                  },
                ]}
              >
                {model.free ? "FREE" : "PAID"}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
        <TextInput
          value={customModel}
          onChangeText={setCustomModel}
          onSubmitEditing={() => controller.setSelectedModel(customModel)}
          placeholder="provider/custom-model"
          placeholderTextColor={theme.textFaint}
          style={[
            styles.input,
            {
              color: theme.text,
              borderColor: theme.line,
              fontFamily: theme.fontMono,
            },
          ]}
        />
        <ActionButton
          label="USE MODEL ID"
          theme={theme}
          onPress={() => controller.setSelectedModel(customModel)}
        />
      </Panel>
      <ToggleRow
        title="Web search"
        detail="Let the model's provider search the web during agent turns. Only sources it actually consulted are ever shown."
        enabled={state.webSearchEnabled}
        theme={theme}
        onToggle={() => controller.setWebSearchEnabled(!state.webSearchEnabled)}
      />
      </CollapsibleSection>

      <CollapsibleSection theme={theme} title="STUDY BEHAVIOR">
      <ToggleRow
        title="Group by command"
        detail="Route generated output into command groups"
        enabled={state.autoGroupByCommand}
        theme={theme}
        onToggle={() =>
          controller.setAutoGroupByCommand(!state.autoGroupByCommand)
        }
      />
      <ToggleRow
        title="Interleave reviews"
        detail="Mix cards across topics during review"
        enabled={state.interleaveReviews}
        theme={theme}
        onToggle={() =>
          controller.setInterleaveReviews(!state.interleaveReviews)
        }
      />
      </CollapsibleSection>

      <CollapsibleSection theme={theme} title="LEARNING SPACES">
      <Panel theme={theme}>
        {state.workspaces.map((workspace) => (
          <Pressable
            key={workspace.id}
            onPress={() => void controller.switchWorkspace(workspace.id)}
            style={[styles.workspaceRow, { borderBottomColor: theme.line }]}
          >
            <View
              style={[
                styles.workspaceSignal,
                {
                  backgroundColor:
                    workspace.id === state.activeWorkspaceId
                      ? theme.accent
                      : theme.line,
                },
              ]}
            />
            <Text
              style={[
                styles.workspaceName,
                { color: theme.text, fontFamily: theme.fontMono },
              ]}
            >
              {workspace.name}
            </Text>
            <Text
              style={[
                styles.workspaceState,
                {
                  color:
                    workspace.id === state.activeWorkspaceId
                      ? theme.accent
                      : theme.textFaint,
                  fontFamily: theme.fontMono,
                },
              ]}
            >
              {workspace.id === state.activeWorkspaceId ? "ACTIVE" : "LOAD"}
            </Text>
          </Pressable>
        ))}
        <View style={styles.inlineForm}>
          <TextInput
            value={workspaceName}
            onChangeText={setWorkspaceName}
            placeholder="new-space"
            placeholderTextColor={theme.textFaint}
            style={[
              styles.inlineInput,
              {
                color: theme.text,
                borderColor: theme.line,
                fontFamily: theme.fontMono,
              },
            ]}
          />
          <ActionButton
            label="CREATE"
            theme={theme}
            onPress={() => void createWorkspace()}
            compact
          />
        </View>
        {/* The assisted alternative to a blank space. Both stay available: creating a
            workspace above never involves a model, and the agent never creates anything
            until its proposal is confirmed. */}
        <ActionButton
          label="PLAN A GOAL WITH THE AGENT"
          theme={theme}
          onPress={() => controller.openWorkspaceAgent()}
        />
        <Pressable
          onPress={deleteWorkspace}
          style={[styles.dangerButton, { borderColor: theme.danger }]}
        >
          <TrashIcon color={theme.danger} />
          <Text
            style={[
              styles.dangerText,
              { color: theme.danger, fontFamily: theme.fontMono },
            ]}
          >
            DELETE ACTIVE SPACE
          </Text>
        </Pressable>
      </Panel>
      </CollapsibleSection>

      <CollapsibleSection theme={theme} title="ASSISTANT PROFILES">
      <Panel theme={theme}>
        {CAPABILITIES.map((capability) => (
          <View key={capability.id} style={styles.profileSection}>
            <FieldLabel theme={theme}>{capability.label}</FieldLabel>
            {state.assistantProfiles
              .filter((profile) => profile.capability === capability.id)
              .map((profile) => {
                const active =
                  state.activeProfileIds[capability.id] === profile.id;
                const pinnedModel = profile.model;
                // The pin is shown by the model's friendly name when we know it, but a
                // pin to a model that isn't in the fetched list still shows its raw id
                // rather than silently reading as "app default".
                const pinLabel = pinnedModel
                  ? (state.availableModels.find((m) => m.id === pinnedModel)?.name ??
                    pinnedModel)
                  : "APP DEFAULT";
                const pickerOpen = modelPickerProfileId === profile.id;
                return (
                  <View
                    key={profile.id}
                    style={[
                      styles.profileCard,
                      {
                        borderColor: active ? theme.accent : theme.line,
                        backgroundColor: active
                          ? theme.accentSoft
                          : theme.panelMuted,
                      },
                    ]}
                  >
                    <View style={styles.profileRow}>
                      <Pressable
                        style={{ flex: 1 }}
                        onPress={() =>
                          controller.setActiveProfileForCapability(
                            capability.id,
                            profile.id,
                          )
                        }
                      >
                        <Text
                          style={[
                            styles.profileName,
                            { color: theme.text, fontFamily: theme.fontMono },
                          ]}
                        >
                          {profile.name}
                        </Text>
                        <Text
                          numberOfLines={2}
                          style={[
                            styles.profileDescription,
                            { color: theme.textMuted },
                          ]}
                        >
                          {profile.description}
                        </Text>
                      </Pressable>
                      {!profile.builtin ? (
                        <Pressable
                          onPress={() =>
                            Alert.alert(
                              `Delete "${profile.name}"?`,
                              "This assistant profile will be removed.",
                              [
                                { text: "Cancel", style: "cancel" },
                                {
                                  text: "Delete",
                                  style: "destructive",
                                  onPress: () =>
                                    void controller.deleteAssistantProfile(
                                      profile.id,
                                    ),
                                },
                              ],
                            )
                          }
                          style={styles.miniDelete}
                        >
                          <TrashIcon color={theme.danger} size={19} />
                        </Pressable>
                      ) : null}
                    </View>

                    <Pressable
                      onPress={() =>
                        setModelPickerProfileId(pickerOpen ? null : profile.id)
                      }
                      style={[styles.modelPinRow, { borderTopColor: theme.line }]}
                    >
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.modelPinText,
                          {
                            color: pinnedModel ? theme.accent : theme.textMuted,
                            fontFamily: theme.fontMono,
                          },
                        ]}
                      >
                        {`MODEL: ${pinLabel}`}
                      </Text>
                      <Text
                        style={[
                          styles.modelPinText,
                          { color: theme.textMuted, fontFamily: theme.fontMono },
                        ]}
                      >
                        {pickerOpen ? "▲" : "▼"}
                      </Text>
                    </Pressable>

                    {pickerOpen ? (
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.modelRow}
                      >
                        {/* Clearing the pin is a first-class choice, not a hidden gesture. */}
                        <Pressable
                          onPress={() => {
                            void controller.setProfileModel(profile.id, undefined);
                            setModelPickerProfileId(null);
                          }}
                          style={[
                            styles.model,
                            {
                              borderColor: !pinnedModel ? theme.accent : theme.line,
                              backgroundColor: !pinnedModel
                                ? theme.accentSoft
                                : theme.panelMuted,
                            },
                          ]}
                        >
                          <Text
                            numberOfLines={1}
                            style={[
                              styles.modelName,
                              { color: theme.text, fontFamily: theme.fontMono },
                            ]}
                          >
                            APP DEFAULT
                          </Text>
                        </Pressable>
                        {state.availableModels.map((model) => (
                          <Pressable
                            key={model.id}
                            onPress={() => {
                              void controller.setProfileModel(profile.id, model.id);
                              setModelPickerProfileId(null);
                            }}
                            style={[
                              styles.model,
                              {
                                borderColor:
                                  pinnedModel === model.id ? theme.accent : theme.line,
                                backgroundColor:
                                  pinnedModel === model.id
                                    ? theme.accentSoft
                                    : theme.panelMuted,
                              },
                            ]}
                          >
                            <Text
                              numberOfLines={1}
                              style={[
                                styles.modelName,
                                { color: theme.text, fontFamily: theme.fontMono },
                              ]}
                            >
                              {model.name}
                            </Text>
                            <Text
                              style={[
                                styles.modelMeta,
                                {
                                  color: model.free ? theme.accent : theme.warning,
                                  fontFamily: theme.fontMono,
                                },
                              ]}
                            >
                              {model.free ? "FREE" : "PAID"}
                            </Text>
                          </Pressable>
                        ))}
                      </ScrollView>
                    ) : null}
                  </View>
                );
              })}
          </View>
        ))}
        <ActionButton
          label="DESIGN ASSISTANT"
          theme={theme}
          onPress={() => setDesignerOpen(true)}
        />
      </Panel>
      </CollapsibleSection>

      <CollapsibleSection theme={theme} title="SEARCH SCOPES">
      <Panel theme={theme}>
        {Object.entries(state.searchSiteFlags).map(([name, domain]) => (
          <View
            key={name}
            style={[styles.flagRow, { borderBottomColor: theme.line }]}
          >
            <Text
              style={[
                styles.flagName,
                { color: theme.accent, fontFamily: theme.fontMono },
              ]}
            >
              --{name}
            </Text>
            <Text
              style={[
                styles.flagDomain,
                { color: theme.textMuted, fontFamily: theme.fontMono },
              ]}
            >
              {domain}
            </Text>
            <Pressable
              onPress={() => {
                const next = { ...state.searchSiteFlags };
                delete next[name];
                void controller.updateSearchSiteFlags(next);
              }}
            >
              <Text
                style={[
                  styles.remove,
                  { color: theme.danger, fontFamily: theme.fontMono },
                ]}
              >
                DEL
              </Text>
            </Pressable>
          </View>
        ))}
        <View style={styles.inlineForm}>
          <TextInput
            value={flagName}
            onChangeText={setFlagName}
            placeholder="flag"
            placeholderTextColor={theme.textFaint}
            style={[
              styles.flagInput,
              {
                color: theme.text,
                borderColor: theme.line,
                fontFamily: theme.fontMono,
              },
            ]}
          />
          <TextInput
            value={flagDomain}
            onChangeText={setFlagDomain}
            placeholder="domain.org"
            placeholderTextColor={theme.textFaint}
            style={[
              styles.flagDomainInput,
              {
                color: theme.text,
                borderColor: theme.line,
                fontFamily: theme.fontMono,
              },
            ]}
          />
          <ActionButton
            label="ADD"
            theme={theme}
            onPress={() => void addFlag()}
            compact
          />
        </View>
      </Panel>
      </CollapsibleSection>

      <CollapsibleSection theme={theme} title="PROMPT MEMORY">
      <Panel theme={theme}>
        <View
          style={[
            styles.promptGuide,
            { borderColor: theme.accent, backgroundColor: theme.accentSoft },
          ]}
        >
          <Text
            style={[
              styles.promptGuideTitle,
              { color: theme.accent, fontFamily: theme.fontMono },
            ]}
          >
            HOW TO WRITE THESE INSTRUCTIONS
          </Text>
          <Text style={[styles.promptGuideText, { color: theme.textMuted }]}> 
            Describe the cards you want: quantity, learning goal, depth, tone,
            and what belongs in each title and body. Do not request JSON or
            other response formatting. The app automatically requires a
            non-empty array of title/body cards.
          </Text>
          <Text
            style={[
              styles.promptExample,
              { color: theme.text, fontFamily: theme.fontMono },
            ]}
          >
            EXAMPLE // Create 3-5 exam cards. Put an application question in
            each title and a concise model answer with one example in the body.
            Focus on mechanisms and common mistakes.
          </Text>
        </View>
        <FieldLabel theme={theme}>CARD GENERATION INSTRUCTION</FieldLabel>
        <Text style={[styles.promptHint, { color: theme.textFaint }]}> 
          Applied after the active Card Generation assistant. This instruction
          has priority for content, depth, and style.
        </Text>
        <TextInput
          multiline
          value={systemPrompt}
          onChangeText={setSystemPrompt}
          onBlur={() => controller.setCustomSystemPrompt(systemPrompt)}
          placeholder="Describe the cards to generate..."
          placeholderTextColor={theme.textFaint}
          style={[
            styles.promptInput,
            { color: theme.text, borderColor: theme.line },
          ]}
        />
        <FieldLabel theme={theme}>DOCUMENT CHUNK INSTRUCTION</FieldLabel>
        <Text style={[styles.promptHint, { color: theme.textFaint }]}> 
          Controls how imported material is divided and explained. The active
          chunking assistant still supplies its specialist role.
        </Text>
        <TextInput
          multiline
          value={chunkPrompt}
          onChangeText={setChunkPrompt}
          onBlur={() => controller.setCustomChunkSystemPrompt(chunkPrompt)}
          placeholder="Describe how documents should be chunked..."
          placeholderTextColor={theme.textFaint}
          style={[
            styles.promptInput,
            { color: theme.text, borderColor: theme.line },
          ]}
        />
        <View style={styles.inlineForm}>
          <ActionButton
            label="SAVE INSTRUCTIONS"
            theme={theme}
            compact
            onPress={() => {
              controller.setCustomSystemPrompt(systemPrompt);
              controller.setCustomChunkSystemPrompt(chunkPrompt);
            }}
          />
          <ActionButton
            label="RESET DEFAULTS"
            theme={theme}
            compact
            onPress={() => {
              setSystemPrompt(DEFAULT_CARD_INSTRUCTION);
              setChunkPrompt(DEFAULT_CHUNK_INSTRUCTION);
              controller.setCustomSystemPrompt(DEFAULT_CARD_INSTRUCTION);
              controller.setCustomChunkSystemPrompt(DEFAULT_CHUNK_INSTRUCTION);
            }}
          />
        </View>
        <View style={styles.presetGrid}>
          {state.promptPresets.map((preset) => (
            <Pressable
              key={preset.id}
              onPress={() => controller.applyPromptPreset(preset.id)}
              onLongPress={() =>
                !preset.builtin && void controller.deletePromptPreset(preset.id)
              }
              style={[styles.preset, { borderColor: theme.line }]}
            >
              <Text
                style={[
                  styles.presetName,
                  { color: theme.text, fontFamily: theme.fontMono },
                ]}
              >
                {preset.name}
              </Text>
              <Text style={[styles.presetMeta, { color: theme.textFaint }]}>
                {preset.builtin ? "BUILT-IN" : "HOLD TO DELETE"}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.inlineForm}>
          <TextInput
            value={presetName}
            onChangeText={setPresetName}
            placeholder="preset-name"
            placeholderTextColor={theme.textFaint}
            style={[
              styles.inlineInput,
              {
                color: theme.text,
                borderColor: theme.line,
                fontFamily: theme.fontMono,
              },
            ]}
          />
          <ActionButton
            label="SAVE"
            theme={theme}
            compact
            onPress={() => {
              if (presetName.trim()) {
                void controller.saveCurrentAsPreset(presetName);
                setPresetName("");
              }
            }}
          />
        </View>
      </Panel>
      </CollapsibleSection>

      <CollapsibleSection theme={theme} title="AGENT PROMPTS">
      <AgentPromptsSection controller={controller} state={state} theme={theme} />
      </CollapsibleSection>

      <CollapsibleSection theme={theme} title="CARD TYPE REGISTRY">
      <Panel theme={theme}>
        {state.cardTypes.map((type) => (
          <View
            key={type.id}
            style={[styles.typeRow, { borderBottomColor: theme.line }]}
          >
            <View style={[styles.typeColor, { backgroundColor: type.color }]} />
            <View style={{ flex: 1 }}>
              <Text
                style={[
                  styles.typeName,
                  { color: theme.text, fontFamily: theme.fontMono },
                ]}
              >
                {type.name}
              </Text>
              <Text
                style={[
                  styles.typeMeta,
                  { color: theme.textFaint, fontFamily: theme.fontMono },
                ]}
              >
                {type.learning.toUpperCase()} // {type.render ?? "markdown"}
              </Text>
            </View>
            {!type.builtin ? (
              <Pressable
                onPress={() => void controller.deleteCardType(type.id)}
              >
                <Text
                  style={[
                    styles.remove,
                    { color: theme.danger, fontFamily: theme.fontMono },
                  ]}
                >
                  DEL
                </Text>
              </Pressable>
            ) : null}
          </View>
        ))}
        <TextInput
          value={typeName}
          onChangeText={setTypeName}
          placeholder="new-type-name"
          placeholderTextColor={theme.textFaint}
          style={[
            styles.input,
            {
              color: theme.text,
              borderColor: theme.line,
              fontFamily: theme.fontMono,
            },
          ]}
        />
        <View style={styles.inlineForm}>
          <TextInput
            value={typeColor}
            onChangeText={setTypeColor}
            style={[
              styles.flagInput,
              {
                color: theme.text,
                borderColor: theme.line,
                fontFamily: theme.fontMono,
              },
            ]}
          />
          {(
            ["none", "flashcard", "cloze", "elaboration"] as LearningBehavior[]
          ).map((behavior) => (
            <Pressable
              key={behavior}
              onPress={() => setTypeLearning(behavior)}
              style={[
                styles.learningChip,
                {
                  borderColor:
                    typeLearning === behavior ? theme.accent : theme.line,
                },
              ]}
            >
              <Text
                style={[
                  styles.learningText,
                  {
                    color:
                      typeLearning === behavior
                        ? theme.accent
                        : theme.textFaint,
                    fontFamily: theme.fontMono,
                  },
                ]}
              >
                {behavior.slice(0, 4).toUpperCase()}
              </Text>
            </Pressable>
          ))}
        </View>
        {typeFields.map((field) => (
          <View
            key={field.key}
            style={[styles.flagRow, { borderBottomColor: theme.line }]}
          >
            <Text
              style={[
                styles.flagName,
                { color: theme.text, fontFamily: theme.fontMono },
              ]}
            >
              {field.label}
            </Text>
            <Text
              style={[
                styles.flagDomain,
                { color: theme.textFaint, fontFamily: theme.fontMono },
              ]}
            >
              {field.kind.toUpperCase()}
            </Text>
            <Pressable
              onPress={() =>
                setTypeFields((fields) =>
                  fields.filter((candidate) => candidate.key !== field.key),
                )
              }
            >
              <Text
                style={[
                  styles.remove,
                  { color: theme.danger, fontFamily: theme.fontMono },
                ]}
              >
                DEL
              </Text>
            </Pressable>
          </View>
        ))}
        <TextInput
          value={typeFieldLabel}
          onChangeText={setTypeFieldLabel}
          placeholder="optional-field-label"
          placeholderTextColor={theme.textFaint}
          style={[
            styles.input,
            {
              color: theme.text,
              borderColor: theme.line,
              fontFamily: theme.fontMono,
            },
          ]}
        />
        <View style={styles.rowWrap}>
          {(["text", "markdown", "hidden"] as FieldKind[]).map((kind) => (
            <Chip
              key={kind}
              label={kind.toUpperCase()}
              active={typeFieldKind === kind}
              theme={theme}
              onPress={() => setTypeFieldKind(kind)}
            />
          ))}
          <ActionButton
            label="ADD FIELD"
            theme={theme}
            compact
            onPress={addTypeField}
          />
        </View>
        <ActionButton
          label="REGISTER TYPE"
          theme={theme}
          onPress={() => void createType()}
        />
      </Panel>
      </CollapsibleSection>

      <CollapsibleSection theme={theme} title="COMMAND SYSTEM">
      <Slab
        title="Commands and pipelines"
        label={`${state.commandDefinitions.length} CUSTOM // ${state.pinnedCommands.length} PINNED`}
        meta="Discover, run, pin, create, and delete terminal commands"
        theme={theme}
        onPress={() => controller.setModalOpen(true)}
      />
      </CollapsibleSection>

      <AssistantDesignerModal
        visible={designerOpen}
        controller={controller}
        state={state}
        theme={theme}
        onClose={() => setDesignerOpen(false)}
      />
    </ScrollView>
  );
}

/**
 * # Agent Prompts — every instruction the app sends, and the layer it won't let you touch
 *
 * Each row edits a prompt's **body**: role, voice, emphasis. What it cannot edit is shown
 * first and marked read-only — the parent rules (never claim a tool ran, never invent a
 * source or an id) and, per capability, the output contract the app parses. Those are
 * composed around the body at send time by `composeSystemPrompt`, so nothing typed into
 * these fields can break parsing or remove a truthfulness guarantee. Saying so plainly
 * here is the point: a customisation surface that hides its own limits reads as a promise
 * it can't keep.
 */
function AgentPromptsSection({
  controller,
  state,
  theme,
}: {
  controller: GriotController;
  state: AppState;
  theme: GriotTheme;
}) {
  const [parentOpen, setParentOpen] = useState(false);

  return (
    <Panel theme={theme}>
      <View
        style={[
          styles.promptGuide,
          { borderColor: theme.accent, backgroundColor: theme.accentSoft },
        ]}
      >
        <Text
          style={[
            styles.promptGuideTitle,
            { color: theme.accent, fontFamily: theme.fontMono },
          ]}
        >
          ALWAYS ENFORCED // NOT EDITABLE
        </Text>
        <Text style={[styles.promptGuideText, { color: theme.textMuted }]}>
          These rules, and each capability's response format, are added around whatever
          you write below. You are changing how an assistant behaves — never what the app
          is able to parse, or what it is allowed to claim.
        </Text>
        <Pressable onPress={() => setParentOpen(!parentOpen)}>
          <Text
            style={[
              styles.promptGuideTitle,
              { color: theme.accent, fontFamily: theme.fontMono },
            ]}
          >
            {parentOpen ? "HIDE THE RULES" : "SHOW THE RULES"}
          </Text>
        </Pressable>
        {parentOpen ? (
          <Text
            style={[
              styles.promptExample,
              { color: theme.text, fontFamily: theme.fontMono },
            ]}
          >
            {PARENT_SYSTEM_PROMPT}
          </Text>
        ) : null}
      </View>

      {AGENT_PROMPT_IDS.map((id) => (
        <AgentPromptRow
          key={id}
          id={id}
          override={state.agentPromptOverrides[id]}
          controller={controller}
          theme={theme}
        />
      ))}
    </Panel>
  );
}

function AgentPromptRow({
  id,
  override,
  controller,
  theme,
}: {
  id: AgentPromptId;
  override: string | undefined;
  controller: GriotController;
  theme: GriotTheme;
}) {
  const definition = AGENT_PROMPT_DEFINITIONS[id];
  const [draft, setDraft] = useState(override ?? definition.defaultBody);
  const isCustomised = Boolean(override && override.trim());

  return (
    <View style={styles.agentPromptRow}>
      <FieldLabel theme={theme}>{definition.label.toUpperCase()}</FieldLabel>
      <Text style={[styles.promptHint, { color: theme.textFaint }]}>
        {definition.description}
      </Text>
      <TextInput
        multiline
        value={draft}
        onChangeText={setDraft}
        onBlur={() => controller.setAgentPromptOverride(id, draft)}
        placeholder={definition.defaultBody}
        placeholderTextColor={theme.textFaint}
        style={[styles.promptInput, { color: theme.text, borderColor: theme.line }]}
      />
      <View style={styles.inlineForm}>
        <Text style={[styles.promptHint, { color: theme.textFaint, flex: 1 }]}>
          {isCustomised ? "CUSTOMISED" : "USING THE DEFAULT"}
        </Text>
        <ActionButton
          label="SAVE"
          theme={theme}
          compact
          onPress={() => controller.setAgentPromptOverride(id, draft)}
        />
        <ActionButton
          label="RESET TO DEFAULT"
          theme={theme}
          compact
          onPress={() => {
            setDraft(definition.defaultBody);
            controller.resetAgentPrompt(id);
          }}
        />
      </View>
    </View>
  );
}

function AssistantDesignerModal({
  visible,
  controller,
  state,
  theme,
  onClose,
}: {
  visible: boolean;
  controller: GriotController;
  state: AppState;
  theme: GriotTheme;
  onClose: () => void;
}) {
  const [capability, setCapability] =
    useState<AssistantCapability>("generate-cards");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [working, setWorking] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [prompt, setPrompt] = useState("");
  /** The model this persona will speak through. Undefined = follow the app's selection. */
  const [model, setModel] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!visible) {
      setMessages([]);
      setInput("");
      setName("");
      setDescription("");
      setPrompt("");
      setModel(undefined);
    }
  }, [visible]);
  const chooseCapability = (next: AssistantCapability) => {
    if (next === capability) return;
    setCapability(next);
    setMessages([]);
    setInput("");
    setName("");
    setDescription("");
    setPrompt("");
    setModel(undefined);
  };
  const send = async () => {
    if (!input.trim()) return;
    const next: ChatMessage[] = [...messages, { role: "user", content: input }];
    setMessages(next);
    setInput("");
    setWorking(true);
    try {
      const response = await controller.designAssistantProfile(
        capability,
        next,
      );
      if (response.needsClarification && response.question)
        setMessages([
          ...next,
          { role: "assistant", content: response.question },
        ]);
      else {
        setName(response.nameSuggestion ?? "");
        setDescription(response.description ?? "");
        setPrompt(response.systemPrompt ?? "");
        setMessages([
          ...next,
          {
            role: "assistant",
            content: response.systemPrompt ?? "Profile ready.",
          },
        ]);
      }
    } catch (error: any) {
      Alert.alert(
        "Designer failed",
        error?.message ?? "Could not contact the assistant designer.",
      );
    } finally {
      setWorking(false);
    }
  };
  const save = async () => {
    if (!name.trim() || !prompt.trim()) return;
    // Only capabilities whose model output is card-shaped JSON get an output contract;
    // anything else validates its own shape at its own boundary.
    const outputContractsByCapability: Partial<Record<AssistantCapability, OutputContractKind>> = {
      "generate-cards": "cards-v1",
      "chunk-document": "chunks-v1",
      chat: "conversation-v1",
      cloze: "cloze-v1",
    };
    const outputContract = outputContractsByCapability[capability];
    const profile = await controller.saveAssistantProfile(
      createAssistantProfile({
        name,
        description,
        goal:
          messages.find((message) => message.role === "user")?.content ??
          description,
        capability,
        systemPrompt: prompt,
        outputContract,
        model,
      }),
    );
    controller.setActiveProfileForCapability(capability, profile.id);
    onClose();
  };
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView
          style={[styles.designer, { backgroundColor: theme.background }]}
        >
          <View
            style={[styles.designerHeader, { borderBottomColor: theme.line }]}
          >
            <Text
              style={[
                styles.designerTitle,
                { color: theme.text, fontFamily: theme.fontMono },
              ]}
            >
              ASSISTANT DESIGNER
            </Text>
            <Pressable onPress={onClose}>
              <Text
                style={[
                  styles.link,
                  { color: theme.accent, fontFamily: theme.fontMono },
                ]}
              >
                CLOSE
              </Text>
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={styles.designerContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.rowWrap}>
              {CAPABILITIES.map((option) => (
                <Chip
                  key={option.id}
                  label={option.label}
                  active={capability === option.id}
                  theme={theme}
                  onPress={() => chooseCapability(option.id)}
                />
              ))}
            </View>
            {messages.map((message, index) => (
              <View
                key={index}
                style={[
                  styles.designMessage,
                  {
                    borderColor:
                      message.role === "user" ? theme.accent : theme.line,
                    backgroundColor:
                      message.role === "user"
                        ? theme.accentSoft
                        : theme.panelStrong,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.messageRole,
                    { color: theme.accent, fontFamily: theme.fontMono },
                  ]}
                >
                  {message.role.toUpperCase()}
                </Text>
                <Text style={[styles.messageBody, { color: theme.text }]}>
                  {message.content}
                </Text>
              </View>
            ))}
            <TextInput
              multiline
              value={input}
              onChangeText={setInput}
              placeholder="Describe the assistant you need..."
              placeholderTextColor={theme.textFaint}
              style={[
                styles.designInput,
                { color: theme.text, borderColor: theme.line },
              ]}
            />
            <ActionButton
              label={working ? "DESIGNING..." : "SEND TO ARCHITECT"}
              theme={theme}
              onPress={() => void send()}
            />
            {prompt ? (
              <Panel theme={theme}>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="Profile name"
                  placeholderTextColor={theme.textFaint}
                  style={[
                    styles.input,
                    { color: theme.text, borderColor: theme.line },
                  ]}
                />
                <TextInput
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Description"
                  placeholderTextColor={theme.textFaint}
                  style={[
                    styles.input,
                    { color: theme.text, borderColor: theme.line },
                  ]}
                />
                <TextInput
                  multiline
                  value={prompt}
                  onChangeText={setPrompt}
                  style={[
                    styles.promptInput,
                    { color: theme.text, borderColor: theme.line },
                  ]}
                />
                {/* Binding the model here is what makes this a persona rather than just a
                    prompt: the same instructions on a big model and on a fast one are two
                    different collaborators, and the choice belongs with the writing of it. */}
                <FieldLabel theme={theme}>MODEL</FieldLabel>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.modelRow}
                >
                  <Chip
                    label="APP DEFAULT"
                    active={!model}
                    theme={theme}
                    onPress={() => setModel(undefined)}
                  />
                  {state.availableModels.map((option) => (
                    <Chip
                      key={option.id}
                      label={option.name}
                      active={model === option.id}
                      theme={theme}
                      onPress={() => setModel(option.id)}
                    />
                  ))}
                </ScrollView>
                <ActionButton
                  label="SAVE AND ACTIVATE"
                  theme={theme}
                  onPress={() => void save()}
                />
              </Panel>
            ) : null}
          </ScrollView>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

function Panel({
  theme,
  children,
}: {
  theme: GriotTheme;
  children: React.ReactNode;
}) {
  return (
    <View
      style={[
        styles.panel,
        { backgroundColor: theme.panelStrong, borderColor: theme.line },
      ]}
    >
      {children}
    </View>
  );
}
function FieldLabel({
  theme,
  children,
}: {
  theme: GriotTheme;
  children: React.ReactNode;
}) {
  return (
    <Text
      style={[
        styles.fieldLabel,
        { color: theme.textMuted, fontFamily: theme.fontMono },
      ]}
    >
      {children}
    </Text>
  );
}
function ActionButton({
  label,
  theme,
  onPress,
  compact,
}: {
  label: string;
  theme: GriotTheme;
  onPress: () => void;
  compact?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.action,
        compact && styles.actionCompact,
        { backgroundColor: theme.accent },
      ]}
    >
      <Text
        style={[
          styles.actionText,
          { color: theme.accentInk, fontFamily: theme.fontMono },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}
function ToggleRow({
  title,
  detail,
  enabled,
  theme,
  onToggle,
}: {
  title: string;
  detail: string;
  enabled: boolean;
  theme: GriotTheme;
  onToggle: () => void;
}) {
  return (
    <Pressable
      onPress={onToggle}
      style={[
        styles.toggle,
        {
          backgroundColor: theme.panelStrong,
          borderColor: enabled ? theme.accent : theme.line,
        },
      ]}
    >
      <View style={{ flex: 1 }}>
        <Text
          style={[
            styles.toggleTitle,
            { color: theme.text, fontFamily: theme.fontMono },
          ]}
        >
          {title}
        </Text>
        <Text style={[styles.toggleDetail, { color: theme.textMuted }]}>
          {detail}
        </Text>
      </View>
      <View
        style={[
          styles.switchTrack,
          {
            borderColor: enabled ? theme.accent : theme.line,
            backgroundColor: enabled ? theme.accentSoft : theme.panelMuted,
          },
        ]}
      >
        <View
          style={[
            styles.switchNode,
            {
              backgroundColor: enabled ? theme.accent : theme.textFaint,
              alignSelf: enabled ? "flex-end" : "flex-start",
            },
          ]}
        />
      </View>
    </Pressable>
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
  brandRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  brandDot: { width: 9, height: 9, borderRadius: 3 },
  brandName: { fontSize: 17, fontWeight: "800", letterSpacing: 0.5 },
  brandSub: { fontSize: TypeScale.meta, marginTop: 3, lineHeight: 18, marginLeft: 18 },
  tag: { fontSize: TypeScale.label, fontWeight: "900", letterSpacing: 1.3, marginTop: 3 },
});

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 50 },
  rowWrap: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  colorGrid: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 10 },
  colorOption: {
    width: "31%",
    minHeight: 64,
    borderWidth: 1,
    borderRadius: 6,
    padding: 10,
    justifyContent: "center",
  },
  colorBar: { width: 26, height: 5, marginBottom: 8 },
  colorText: { fontSize: 12, fontWeight: "900" },
  panel: { borderWidth: 1, borderRadius: 8, padding: 13 },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1,
    marginBottom: 7,
    marginTop: 5,
  },
  panelHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 10,
  },
  link: { fontSize: 12, fontWeight: "900", letterSpacing: 0.7 },
  helperText: { fontSize: 13, lineHeight: 19 },
  keyStatusRow: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 8 },
  keyStatusDot: { width: 7, height: 7, borderRadius: 4 },
  keyStatusText: { fontSize: 11, fontWeight: "700", letterSpacing: 0.6 },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 11,
    marginBottom: 9,
  },
  modelRow: { gap: 7, paddingVertical: 8 },
  model: {
    width: 150,
    minHeight: 68,
    borderWidth: 1,
    borderRadius: 6,
    padding: 10,
    justifyContent: "space-between",
  },
  modelName: { fontSize: 12, fontWeight: "800" },
  modelMeta: { fontSize: 12, marginTop: 7 },
  action: {
    minHeight: 53,
    borderRadius: 5,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 14,
    marginTop: 8,
  },
  actionCompact: { minWidth: 70, minHeight: 50, marginTop: 0 },
  actionText: { fontSize: 12, fontWeight: "900", letterSpacing: 0.8 },
  toggle: {
    minHeight: 80,
    borderWidth: 1,
    borderRadius: 7,
    marginBottom: 8,
    padding: 13,
    flexDirection: "row",
    alignItems: "center",
  },
  toggleTitle: { fontSize: 14, fontWeight: "800" },
  toggleDetail: { fontSize: 12, marginTop: 4 },
  switchTrack: {
    width: 48,
    height: 27,
    borderWidth: 1,
    borderRadius: 5,
    padding: 3,
  },
  switchNode: { width: 19, height: 19, borderRadius: 3 },
  workspaceRow: {
    minHeight: 57,
    borderBottomWidth: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  workspaceSignal: { width: 6, height: 30, marginRight: 11 },
  workspaceName: { flex: 1, fontSize: 13, fontWeight: "700" },
  workspaceState: { fontSize: 12, fontWeight: "900" },
  inlineForm: {
    flexDirection: "row",
    gap: 6,
    marginTop: 10,
    alignItems: "center",
  },
  inlineInput: {
    flex: 1,
    minHeight: 50,
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 10,
  },
  dangerButton: {
    minHeight: 53,
    borderWidth: 1,
    borderRadius: 5,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    marginTop: 10,
  },
  dangerText: { fontSize: 12, fontWeight: "900" },
  profileSection: { marginBottom: 16 },
  profileCard: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 11,
    paddingTop: 11,
    paddingBottom: 4,
    marginBottom: 6,
  },
  profileRow: {
    minHeight: 60,
    flexDirection: "row",
    alignItems: "center",
  },
  modelPinRow: {
    borderTopWidth: 1,
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  modelPinText: { fontSize: 11, fontWeight: "800", letterSpacing: 0.6 },
  profileName: { fontSize: 12, fontWeight: "800" },
  profileDescription: { fontSize: 12, lineHeight: 17, marginTop: 4 },
  miniDelete: {
    width: 42,
    minHeight: 50,
    justifyContent: "center",
    alignItems: "center",
  },
  flagRow: {
    minHeight: 53,
    borderBottomWidth: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  flagName: { width: 90, fontSize: 12, fontWeight: "900" },
  flagDomain: { flex: 1, fontSize: 12 },
  remove: { fontSize: 12, fontWeight: "900", padding: 12 },
  flagInput: {
    width: 86,
    minHeight: 50,
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 8,
  },
  flagDomainInput: {
    flex: 1,
    minHeight: 50,
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 8,
  },
  agentPromptRow: { marginBottom: 18 },
  promptInput: {
    minHeight: 150,
    borderWidth: 1,
    borderRadius: 5,
    padding: 11,
    textAlignVertical: "top",
    marginBottom: 12,
    fontSize: 14,
    lineHeight: 20,
  },
  promptGuide: {
    borderWidth: 1,
    borderRadius: 6,
    padding: 12,
    marginBottom: 14,
  },
  promptGuideTitle: { fontSize: 12, fontWeight: "900", letterSpacing: 1 },
  promptGuideText: { fontSize: 12, lineHeight: 18, marginTop: 8 },
  promptExample: { fontSize: 12, lineHeight: 16, marginTop: 10 },
  promptHint: { fontSize: 12, lineHeight: 16, marginBottom: 7 },
  presetGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  preset: {
    width: "48%",
    minHeight: 61,
    borderWidth: 1,
    borderRadius: 5,
    padding: 9,
  },
  presetName: { fontSize: 12, fontWeight: "800" },
  presetMeta: { fontSize: 12, marginTop: 6 },
  typeRow: {
    minHeight: 58,
    borderBottomWidth: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  typeColor: { width: 7, height: 32, marginRight: 10 },
  typeName: { fontSize: 12, fontWeight: "800" },
  typeMeta: { fontSize: 12, marginTop: 4 },
  learningChip: {
    minWidth: 43,
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 5,
    justifyContent: "center",
    alignItems: "center",
  },
  learningText: { fontSize: 12, fontWeight: "900" },
  designer: { flex: 1 },
  designerHeader: {
    minHeight: 88,
    paddingHorizontal: 17,
    paddingTop: 17,
    borderBottomWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  designerTitle: { fontSize: 19, fontWeight: "800" },
  designerContent: { padding: 16, paddingBottom: 40 },
  designMessage: { borderWidth: 1, borderRadius: 6, padding: 12, marginTop: 8 },
  messageRole: { fontSize: 12, fontWeight: "900" },
  messageBody: { fontSize: 14, lineHeight: 21, marginTop: 6 },
  designInput: {
    minHeight: 140,
    borderWidth: 1,
    borderRadius: 6,
    padding: 12,
    textAlignVertical: "top",
    marginTop: 12,
  },
});
