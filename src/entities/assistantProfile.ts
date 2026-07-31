import { AgentScopeKind, DEFAULT_SCOPE_BUDGET } from "./agentScope";
import { SemanticRole } from "./card";

/**
 * Valid capabilities supported by AI assistance profiles.
 */
export type AssistantCapability = "generate-cards" | "chunk-document" | "chat" | "cloze";

/**
 * Who a profile belongs to and how long it lives.
 *
 * `session` profiles are never persisted — they live only in the running app's UI state
 * and vanish on restart by construction, not by a separate cleanup step. `workspace`
 * profiles are visible only inside the workspace they were created in. Absent on a
 * profile means `"global"`, which is every profile's behavior before this field existed.
 */
export type ProfileScope = "builtin" | "global" | "workspace" | "session";

/**
 * What an operation using this profile is allowed to read.
 *
 * Mirrors `AgentScopeKind`/`ScopeBudget` (see `entities/agentScope.ts`) rather than
 * reinventing them, because "what will this read" is exactly the same question a
 * preflight already answers for a one-off operation — a profile is just that answer,
 * saved.
 */
export interface ContextPolicy {
  defaultScope: AgentScopeKind;
  maxCards: number;
  maxCharacters: number;
  allowSources: boolean;
  allowMission: boolean;
  allowPriorOutputs: boolean;
}

/** The conservative default: same budget every ad hoc preflight already uses. */
export const DEFAULT_CONTEXT_POLICY: ContextPolicy = {
  defaultScope: "selected-only",
  maxCards: DEFAULT_SCOPE_BUDGET.maxCards,
  maxCharacters: DEFAULT_SCOPE_BUDGET.maxCharacters,
  allowSources: true,
  allowMission: false,
  allowPriorOutputs: false,
};

/** What a profile's run is allowed to do with its own output. */
export interface OutputPolicy {
  allowCardCreation: boolean;
  /** Empty means unrestricted — every role is allowed, today's behavior. */
  allowedRoles: SemanticRole[];
  requireReviewBeforeSave: boolean;
  createGroupForOutputs: boolean;
}

/** Matches today's actual behavior: a run creates cards, no forced review, no grouping. */
export const DEFAULT_OUTPUT_POLICY: OutputPolicy = {
  allowCardCreation: true,
  allowedRoles: [],
  requireReviewBeforeSave: false,
  createGroupForOutputs: false,
};

/** Whether a profile may ever trigger a real web search. Never inferred, always declared. */
export type WebPolicy = "never" | "preflight-required";

/**
 * Application-owned, non-editable output contract identifier.
 */
export type OutputContractKind = "cards-v1" | "chunks-v1" | "conversation-v1" | "cloze-v1";

/**
 * # AI Assistance Profile Entity
 *
 * ## Business Value & Rationale
 * Replaces global prompt settings with goal-specific AI assistance profiles. Learners
 * require distinct AI personas for different study goals (e.g. implementation coaching,
 * exam recall, semantic chunking, Socratic tutoring).
 *
 * The profile owns the editable instruction ("what good assistance means"), while the app
 * owns the strict non-editable output contracts and schema validation.
 */
export interface AssistantProfile {
  id: string;
  name: string;
  description: string;
  goal: string;
  capability: AssistantCapability;
  systemPrompt: string;
  outputContract?: OutputContractKind;
  createdAt: number;
  updatedAt: number;
  builtin?: boolean;
  /** Undefined means `"global"` — every profile's behavior before this field existed. */
  scope?: ProfileScope;
  /** Required when `scope === "workspace"`; ignored otherwise. */
  workspaceId?: string;
  /** Undefined means {@link DEFAULT_CONTEXT_POLICY}. */
  contextPolicy?: ContextPolicy;
  /** Undefined means `"never"` — no profile could trigger a search before this existed. */
  webPolicy?: WebPolicy;
  /** Undefined means {@link DEFAULT_OUTPUT_POLICY}. */
  outputPolicy?: OutputPolicy;
  /** Undefined means `!builtin` — every non-builtin profile was already editable. */
  isEditable?: boolean;
  /** Set when this profile was duplicated from a builtin, for "customized from" display. */
  sourceProfileId?: string;
}

export interface CreateAssistantProfileParams {
  id?: string;
  name: string;
  description?: string;
  goal?: string;
  capability: AssistantCapability;
  systemPrompt: string;
  outputContract?: OutputContractKind;
  builtin?: boolean;
  scope?: ProfileScope;
  workspaceId?: string;
  contextPolicy?: ContextPolicy;
  webPolicy?: WebPolicy;
  outputPolicy?: OutputPolicy;
  isEditable?: boolean;
  sourceProfileId?: string;
}

/**
 * Built-in default AI assistance profiles seeded into every workspace.
 */
export const BUILTIN_ASSISTANT_PROFILES: AssistantProfile[] = [
  {
    id: "builtin-generate-cards",
    name: "General Study Tutor",
    description: "Default card generator for active recall and fundamental understanding",
    goal: "Extract key concepts into clear, self-contained question and answer cards",
    capability: "generate-cards",
    outputContract: "cards-v1",
    systemPrompt: "You are an expert tutor. Create clear, concise active recall flashcards focusing on core mechanisms, definitions, and relationships.",
    createdAt: 1718582400000,
    updatedAt: 1718582400000,
    builtin: true,
  },
  {
    id: "builtin-implementation-coach",
    name: "Implementation Study Coach",
    description: "Technical study assistant for software engineering & systems architecture",
    goal: "Turn technical source material into cards emphasizing mechanisms, tradeoffs, and failure modes",
    capability: "generate-cards",
    outputContract: "cards-v1",
    systemPrompt: "You are an implementation-focused study coach. Prioritize practical mechanisms, architectural constraints, performance tradeoffs, edge cases, and concrete implementation decisions—avoid generic high-level summaries.",
    createdAt: 1718582400000,
    updatedAt: 1718582400000,
    builtin: true,
  },
  {
    id: "builtin-chunk-document",
    name: "Semantic Document Chunker",
    description: "Splits long-form documents into atomic, self-contained concept cards",
    goal: "Group text into logical 1-3 paragraph units maintaining full technical context",
    capability: "chunk-document",
    outputContract: "chunks-v1",
    systemPrompt: "You are a document structure expert. Break verbose material into focused, standalone concept units suitable for mobile reading. Maintain code snippets, formulas, and exact terminology.",
    createdAt: 1718582400000,
    updatedAt: 1718582400000,
    builtin: true,
  },
  {
    id: "builtin-chat",
    name: "Socratic Study Partner",
    description: "Interactive chat assistant that guides understanding through targeted questions",
    goal: "Help the user explore concepts without giving away answers directly",
    capability: "chat",
    outputContract: "conversation-v1",
    systemPrompt: "You are a Socratic study partner. Ask probing questions, offer hint-based guidance, and encourage the learner to synthesize solutions in their own words.",
    createdAt: 1718582400000,
    updatedAt: 1718582400000,
    builtin: true,
  },
  {
    id: "builtin-cloze",
    name: "Cloze Term Extractor",
    description: "Identifies key terms for fill-in-the-blank deletion practice",
    goal: "Highlight technical terms, numbers, and proper nouns for cloze practice",
    capability: "cloze",
    outputContract: "cloze-v1",
    systemPrompt: "You are a cloze deletion creator. Select salient terms, formulas, and key vocabulary for retrieval practice.",
    createdAt: 1718582400000,
    updatedAt: 1718582400000,
    builtin: true,
  },
  {
    id: "builtin-prerequisite-finder",
    name: "Prerequisite Finder",
    description: "Identifies what a learner needs to know before tackling the given material",
    goal: "Surface missing prerequisite concepts and open questions, grounded in what's actually provided",
    capability: "generate-cards",
    outputContract: "cards-v1",
    systemPrompt: "You are a curriculum gap analyst. Given the supplied material (and, if present, the learner's stated goal), identify the specific prerequisite concepts, terms, or skills a learner would need before this material makes sense. Each card names one prerequisite and explains why it's needed. If nothing supplied gives you enough to judge a prerequisite, say so plainly in a single card rather than inventing one.",
    createdAt: 1718582400000,
    updatedAt: 1718582400000,
    builtin: true,
  },
  {
    id: "builtin-experiment-planner",
    name: "Experiment Planner",
    description: "Turns selected notes or questions into a concrete, testable experiment plan",
    goal: "Produce one experiment plan with hypothesis, method, materials, measurement, expected result, and next action",
    capability: "generate-cards",
    outputContract: "cards-v1",
    systemPrompt: "You are a hands-on lab/project mentor. From the supplied material, propose one concrete experiment the learner can actually run to test or apply the idea. State a falsifiable hypothesis, the method/steps, required materials or tools, what to measure, the expected result, and one clear next action. Ground it strictly in the supplied material; never invent equipment or data the learner hasn't mentioned.",
    createdAt: 1718582400000,
    updatedAt: 1718582400000,
    builtin: true,
  },
  {
    id: "builtin-syllabus-planner",
    name: "Syllabus Planner",
    description: "Builds a mini-syllabus of ordered prerequisites for a stated goal",
    goal: "Turn a goal into 4-8 ordered prerequisite topics, each phrased as a searchable topic name",
    capability: "generate-cards",
    outputContract: "cards-v1",
    systemPrompt: "You are a curriculum designer building a mini-syllabus. Given the learner's goal (and, when provided, their why, target deliverable, success criteria, and current phase), produce 4 to 8 prerequisite topics ordered so earlier ones scaffold later ones. Each card's title MUST be the prerequisite topic itself, phrased as a concise searchable topic name (as someone would type into a search box — no numbering, no 'Learn' prefix). The body states in 1-2 sentences what to learn about it and why it's needed for this specific goal. Cover only genuine prerequisites for the stated goal; do not pad with generic study advice.",
    createdAt: 1718582400000,
    updatedAt: 1718582400000,
    builtin: true,
  },
  {
    id: "builtin-query-strategist",
    name: "Query Strategist",
    description: "Breaks a broad goal or topic down into several sharper web search queries",
    goal: "Turn one broad topic into 3-5 distinct, specific search queries covering different useful angles",
    capability: "generate-cards",
    outputContract: "cards-v1",
    systemPrompt: "You are a search query strategist. Given the user's broad goal or topic, produce 3 to 5 distinct, specific, well-formed web search queries that together cover it from different useful angles (e.g. official documentation, comparisons/alternatives, tutorials or how-tos, common pitfalls or troubleshooting). Put each query itself (not a description of it) in the title field, phrased exactly as someone would type it into a search box. Body should be a one-sentence reason this angle is useful. Do not repeat the same query twice; do not include the words 'search for' in the query text itself.",
    createdAt: 1718582400000,
    updatedAt: 1718582400000,
    builtin: true,
  },
  {
    id: "builtin-research-brief",
    name: "Research Brief Synthesizer",
    description: "Writes a cited brief strictly from retained web sources",
    goal: "Summarize only what the retained source excerpts actually say, with a citation for every claim",
    capability: "chunk-document",
    outputContract: "chunks-v1",
    systemPrompt: "You are a research brief synthesizer. You will be given source excerpts, each tagged with its title and source URL. Using ONLY what is stated in the supplied excerpts, write a set of concise, cited claim cards. Every card MUST cite the exact source card id and a short supporting quote via the required sourceCardId/sourceExcerpt fields. Never state anything not directly supported by a supplied excerpt; never fill gaps from general knowledge. If the excerpts don't support a useful claim, return fewer cards rather than inventing one.",
    createdAt: 1718582400000,
    updatedAt: 1718582400000,
    builtin: true,
  },
  {
    id: "builtin-status-reporter",
    name: "Status Reporter",
    description: "Adds a short qualitative read on top of the deterministic gap report",
    goal: "Comment on momentum and the single most useful next move, grounded in the supplied facts",
    capability: "generate-cards",
    outputContract: "cards-v1",
    systemPrompt: "You are a status-report assistant. You will be given the deterministic facts of a gap report (mission, evidence counts, gaps, blockers) already computed without you. Add ONE short qualitative assessment card: comment on momentum and name the single most useful next move. Do not restate the counts verbatim, do not invent facts not present in what's supplied, and do not claim more precision than the supplied heuristic labels already state.",
    createdAt: 1718582400000,
    updatedAt: 1718582400000,
    builtin: true,
  },
  {
    id: "builtin-capstone-planner",
    name: "Capstone Planner",
    description: "Turns a workspace mission and current material into milestone/task/deliverable cards",
    goal: "Break a stated goal and target deliverable into ordered milestones and concrete next tasks",
    capability: "generate-cards",
    outputContract: "cards-v1",
    systemPrompt: "You are a capstone project planner. Given the learner's stated goal, success criteria, target deliverable, and the material already gathered, produce ordered milestone/task cards that lead to the deliverable. Each card names one milestone or task and states what 'done' looks like for it. Ground every card in what's actually supplied; if the goal or deliverable is missing, say so in a single card instead of fabricating one.",
    createdAt: 1718582400000,
    updatedAt: 1718582400000,
    builtin: true,
  },
];

/**
 * Helper function to generate a random unique ID.
 */
function generateId(): string {
  return Math.random().toString(36).substring(2, 10);
}

/**
 * Factory for creating a valid {@link AssistantProfile}.
 */
export function createAssistantProfile(params: CreateAssistantProfileParams): AssistantProfile {
  const now = Date.now();
  return {
    id: params.id || `prof-${generateId()}`,
    name: params.name.trim(),
    description: (params.description || "").trim(),
    goal: (params.goal || "").trim(),
    capability: params.capability,
    systemPrompt: params.systemPrompt.trim(),
    outputContract: params.outputContract,
    createdAt: now,
    updatedAt: now,
    builtin: params.builtin ?? false,
    scope: params.scope,
    workspaceId: params.workspaceId,
    contextPolicy: params.contextPolicy,
    webPolicy: params.webPolicy,
    outputPolicy: params.outputPolicy,
    isEditable: params.isEditable,
    sourceProfileId: params.sourceProfileId,
  };
}

/** A profile's context policy, defaulted for anything predating this field. */
export function resolveContextPolicy(profile: AssistantProfile): ContextPolicy {
  return profile.contextPolicy ?? DEFAULT_CONTEXT_POLICY;
}

/** A profile's output policy, defaulted for anything predating this field. */
export function resolveOutputPolicy(profile: AssistantProfile): OutputPolicy {
  return profile.outputPolicy ?? DEFAULT_OUTPUT_POLICY;
}

/** A profile's web policy, defaulted to `"never"` — no profile could search before this existed. */
export function resolveWebPolicy(profile: AssistantProfile): WebPolicy {
  return profile.webPolicy ?? "never";
}

/** A profile's scope, defaulted to `"global"` — every profile's behavior before this field existed. */
export function resolveProfileScope(profile: AssistantProfile): ProfileScope {
  return profile.scope ?? "global";
}

/** Whether a profile can be edited: explicit `isEditable`, else "not a builtin". */
export function isProfileEditable(profile: AssistantProfile): boolean {
  return profile.isEditable ?? !profile.builtin;
}

/**
 * Duplicates a profile into a new, user-owned, editable copy.
 *
 * The only legal way to get a customizable version of a builtin: the source is never
 * mutated, and the copy always carries `sourceProfileId` so the UI can say what it was
 * customized from. Also the mechanism for "save as" on any profile, builtin or not.
 */
export function duplicateAssistantProfile(
  source: AssistantProfile,
  overrides: Partial<CreateAssistantProfileParams> = {}
): AssistantProfile {
  return createAssistantProfile({
    name: overrides.name ?? `${source.name} (Custom)`,
    description: overrides.description ?? source.description,
    goal: overrides.goal ?? source.goal,
    capability: overrides.capability ?? source.capability,
    systemPrompt: overrides.systemPrompt ?? source.systemPrompt,
    outputContract: overrides.outputContract ?? source.outputContract,
    scope: overrides.scope ?? "global",
    workspaceId: overrides.workspaceId,
    contextPolicy: overrides.contextPolicy ?? source.contextPolicy,
    webPolicy: overrides.webPolicy ?? source.webPolicy,
    outputPolicy: overrides.outputPolicy ?? source.outputPolicy,
    builtin: false,
    isEditable: true,
    sourceProfileId: source.id,
  });
}

/**
 * # Assistant Profile Resolver
 *
 * ## Business Value & Purpose
 * Resolves the active {@link AssistantProfile} for a specified capability or target profile name/ID.
 * Falls back gracefully to built-in default profiles if no custom profile matches.
 */
export function resolveAssistantProfile(
  capability: AssistantCapability,
  activeProfileIds: Partial<Record<AssistantCapability, string>> = {},
  customProfiles: AssistantProfile[] = [],
  builtinProfiles: AssistantProfile[] = BUILTIN_ASSISTANT_PROFILES,
  targetProfileIdOrName?: string,
  /**
   * The active workspace, for excluding workspace-scoped profiles that belong to a
   * different one. Optional and trailing so every existing call site — none of which
   * had workspace-scoped profiles to worry about — keeps working unchanged.
   */
  activeWorkspaceId?: string
): AssistantProfile {
  // A workspace-scoped profile is invisible outside its own workspace — the isolation
  // work.txt requires — filtered once here rather than at every call site.
  const visibleCustom = customProfiles.filter(
    (p) => resolveProfileScope(p) !== "workspace" || p.workspaceId === activeWorkspaceId
  );
  const allProfiles = [...visibleCustom, ...builtinProfiles];
  const customProfilesInScope = visibleCustom;

  // 1. Explicit override by profile ID or Name
  if (targetProfileIdOrName) {
    const targetKey = targetProfileIdOrName.trim().toLowerCase();
    const found = allProfiles.find(
      (p) => p.id.toLowerCase() === targetKey || p.name.toLowerCase() === targetKey
    );
    if (found) return found;
  }

  // 2. Lookup by configured activeProfileId for this capability
  const activeId = activeProfileIds[capability];
  if (activeId) {
    const found = allProfiles.find((p) => p.id === activeId);
    if (found) return found;
  }

  // 3. Fallback to first matching profile for capability
  const matchingCustom = customProfilesInScope.find((p) => p.capability === capability);
  if (matchingCustom) return matchingCustom;

  const matchingBuiltin = builtinProfiles.find((p) => p.capability === capability);
  if (matchingBuiltin) return matchingBuiltin;

  // 4. Absolute fallback
  return BUILTIN_ASSISTANT_PROFILES[0];
}
