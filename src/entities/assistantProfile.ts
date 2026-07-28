/**
 * Valid capabilities supported by AI assistance profiles.
 */
export type AssistantCapability = "generate-cards" | "chunk-document" | "chat" | "cloze";

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
  };
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
  targetProfileIdOrName?: string
): AssistantProfile {
  const allProfiles = [...customProfiles, ...builtinProfiles];

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
  const matchingCustom = customProfiles.find((p) => p.capability === capability);
  if (matchingCustom) return matchingCustom;

  const matchingBuiltin = builtinProfiles.find((p) => p.capability === capability);
  if (matchingBuiltin) return matchingBuiltin;

  // 4. Absolute fallback
  return BUILTIN_ASSISTANT_PROFILES[0];
}
