import type { OutputContractKind } from "./assistantProfile";

/**
 * # Prompt Presets & the Strict Output Contracts
 *
 * ## Business Value & Purpose
 * Every agent-backed generation request is split into two layers so a user (or the
 * AI Prompt Architect) can "request almost anything" without ever breaking parsing:
 *
 * 1. **Instruction** (user-controllable, per {@link AssistantProfile} or preset): *what*
 *    kind of output to make — informative, ELI5, exam Q&A, semantic chunks, etc.
 * 2. **Format contract** (strict + always enforced): *how* to respond. Each
 *    {@link OutputContractKind} has its own contract text (e.g. cards-v1 is a JSON array
 *    of `{title, body}`; chunks-v1 adds `{sourceCardId, sourceExcerpt}`). The gateway
 *    appends the contract matching the resolved profile's capability, so an instruction
 *    never has to mention JSON and can't accidentally produce unparseable output — and a
 *    chunk-document profile's instruction is never silently coerced into the cards-v1 shape.
 *
 * {@link composeCardPrompt} combines an instruction with the contract for a given kind.
 */

/**
 * The `references` key, shared by every card-shaped contract.
 *
 * ## Why this lives in the contract layer
 * It is the reason citations reach *every* AI in the app, including the user's own
 * personas and custom commands. Instructions are the user's to rewrite; contracts are
 * appended afterwards and marked as overriding, so a persona that never mentions sources
 * still ships this clause and still returns the field.
 *
 * ## Why it is so insistent about not guessing
 * The parent rules already forbid inventing a URL, and asking every card for a reference
 * is exactly the pressure that would tempt a model to break that. So the clause states the
 * honest outs plainly and more than once: a reference with no URL is fine, an empty list is
 * fine, and a plausible-looking wrong link is the one unacceptable answer. A citation the
 * user cannot follow is worse than none, because it looks like a receipt and is not one.
 */
export const REFERENCES_CONTRACT_CLAUSE = `- "references": array — the sources behind this card, in APA 7th edition format. Each entry is an object with:
    - "text": string — the full APA reference, e.g. "Bjork, R. A. (1994). Memory and metamemory considerations in the training of human beings. In J. Metcalfe & A. Shimamura (Eds.), Metacognition: Knowing about knowing (pp. 185-205). MIT Press."
    - "url": string — the source's address, included only when you are certain of it (a DOI, an official documentation page, a well-known permanent URL). Omit this key entirely when you are not certain.
  Cite the real, checkable works the claims in this card actually rest on: the standard text, the canonical paper, the official documentation. When source material was supplied to you, cite that material.
  NEVER guess, construct, or pattern-match a URL. A reference with "text" and no "url" is a good answer; a plausible-looking link that does not exist is the one answer that is never acceptable.
  Return [] when you cannot name a real source for this card. An empty array is always preferable to an invented citation.`;

/**
 * The strict output contract for the `cards-v1` capability (plain generate/ask cards).
 * Kept deliberately rigid so any instruction yields parseable cards. Must contain the
 * phrase "Respond ONLY with a valid JSON array" (relied on downstream).
 */
export const RESPONSE_FORMAT_PROMPT = `OUTPUT FORMAT (STRICT — this overrides any conflicting instruction above):
Respond ONLY with a valid JSON array of objects. Output nothing else — no prose, no explanation, no markdown, no code fences, nothing before or after the array.
Each object MUST have exactly these keys:
- "title": string — a specific, descriptive heading (max 8 words; never a generic label like "Card 1")
- "body": string — the card's content as plain text or light markdown
${REFERENCES_CONTRACT_CLAUSE}
For every non-empty query, return at least one useful card. Return [] only when both the query and source context are empty.`;

/**
 * The strict output contract for the `chunks-v1` capability (`chunk` semantic restructuring).
 * Adds provenance fields so each chunk can be traced back to its source card.
 */
export const CHUNK_RESPONSE_FORMAT_PROMPT = `OUTPUT FORMAT (STRICT — this overrides any conflicting instruction above):
Respond ONLY with a valid JSON array of objects. Output nothing else — no prose, no explanation, no markdown, no code fences, nothing before or after the array.
Each object MUST have exactly these keys:
- "title": string — a specific, descriptive heading for this chunk (max 8 words)
- "body": string — a clear, self-contained explanation of this chunk as plain text or light markdown
- "sourceCardId": string — the exact id of the source card this chunk was drawn from
- "sourceExcerpt": string — a short supporting quote copied from that source card
${REFERENCES_CONTRACT_CLAUSE}
For every non-empty query, return at least one useful chunk. Return [] only when both the query and source context are empty.`;

/** Maps each output contract kind to its strict format text. Empty string = no contract appended (e.g. free-text chat). */
const FORMAT_PROMPTS_BY_CONTRACT: Record<OutputContractKind, string> = {
  "cards-v1": RESPONSE_FORMAT_PROMPT,
  "chunks-v1": CHUNK_RESPONSE_FORMAT_PROMPT,
  "cloze-v1": RESPONSE_FORMAT_PROMPT,
  "conversation-v1": "",
};

/** Default instruction for a direct single-answer card (the `ask` flow). */
export const DEFAULT_CARD_INSTRUCTION = `You are a precise, knowledgeable tutor. Answer the user's query directly and accurately in a single card. Name the key idea in the title, then in the body explain it clearly and state why it matters or give a concrete example. When source context is provided, ground the answer strictly in it. Never invent facts.`;

/** Default instruction for breaking material into a sequence of cards (the `ask`/`chunk` agent flow). */
export const DEFAULT_CHUNK_INSTRUCTION = `You are an expert learning designer. Break the provided material into the smallest set of distinct, self-contained, recall-ready cards — one idea per card, ordered so earlier cards scaffold later ones. For each idea: state it precisely, give the reason or mechanism behind it, and add a concrete example or contrast where it aids memory. Cover the material faithfully without inventing facts; prefer fewer, sharper cards over many vague ones.`;

/**
 * Combines a custom/preset instruction with the strict format contract for the given
 * output kind (defaults to `cards-v1`, the plain generate/ask shape). The instruction
 * leads (it's what the model should do); the format contract trails and is marked as
 * overriding, so format compliance is guaranteed regardless of the instruction, and each
 * capability's own contract (e.g. `chunks-v1`'s provenance fields) is never dropped in
 * favor of the generic card shape.
 */
export function composeCardPrompt(
  instruction: string,
  contract: OutputContractKind = "cards-v1"
): string {
  const trimmed = (instruction || "").trim() || DEFAULT_CARD_INSTRUCTION;
  const formatPrompt = FORMAT_PROMPTS_BY_CONTRACT[contract] ?? RESPONSE_FORMAT_PROMPT;
  return formatPrompt ? `${trimmed}\n\n${formatPrompt}` : trimmed;
}

export interface PromptPreset {
  /** Unique id. */
  id: string;
  /** Display name shown in the preset dropdown. */
  name: string;
  /** The instruction text (no format boilerplate needed — the contract is appended). */
  prompt: string;
  /** True for seeded presets (cannot be deleted, only used as a starting point). */
  builtin: boolean;
}

/** Seeded presets covering common card styles. Users can add more. */
export const BUILTIN_PROMPT_PRESETS: PromptPreset[] = [
  { id: "informative", name: "Informative cards", builtin: true, prompt: DEFAULT_CHUNK_INSTRUCTION },
  {
    id: "eli5",
    name: "Explain simply (ELI5)",
    builtin: true,
    prompt: "Explain each idea as if to a curious 12-year-old: plain words, vivid everyday analogies, and no jargon. One simple idea per card; if a technical term is unavoidable, define it in the same breath.",
  },
  {
    id: "exam",
    name: "Exam Q&A",
    builtin: true,
    prompt: "Turn the material into exam-style question-and-answer cards. Put a probing question in the title and a complete, correct model answer in the body. Favor questions that test understanding and application over recall of trivia.",
  },
  {
    id: "definitions",
    name: "Key terms & definitions",
    builtin: true,
    prompt: "Extract the key terms from the material. For each, set the title to the term and the body to a crisp, precise definition followed by one concrete example of it in use.",
  },
  {
    id: "deepdive",
    name: "Deep dive",
    builtin: true,
    prompt: "Produce thorough, detailed cards that fully explain each concept — including nuances, common misconceptions, edge cases, and how it connects to related ideas. Depth over brevity, but stay faithful to the material.",
  },
];

/** A preset name normalizer / id generator for user-created presets. */
export function createPromptPreset(params: { id?: string; name: string; prompt: string }): PromptPreset {
  return {
    id: params.id || Math.random().toString(36).substring(2, 10),
    name: params.name.trim() || "My preset",
    prompt: params.prompt,
    builtin: false,
  };
}
