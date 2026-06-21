/**
 * # Prompt Presets & the Strict Card-Generation Contract
 *
 * ## Business Value & Purpose
 * Card generation is split into two layers so the user can "request almost anything"
 * without ever breaking parsing:
 *
 * 1. **Instruction** (user-controllable): *what* kind of cards to make — informative,
 *    ELI5, exam Q&A, definitions, etc. Presets are named, reusable instructions, and
 *    the set is extendable (users add their own).
 * 2. **Format contract** ({@link RESPONSE_FORMAT_PROMPT}, strict + always enforced):
 *    *how* to respond — a JSON array of `{title, body}`. The gateway appends this to
 *    every request, so an instruction never has to mention JSON and can't accidentally
 *    produce unparseable output.
 *
 * {@link composeCardPrompt} combines the two.
 */

/**
 * The strict, overarching output contract appended to every card-generation request.
 * Kept deliberately rigid so any instruction yields parseable cards. Must contain the
 * phrase "Respond ONLY with a valid JSON array" (relied on downstream).
 */
export const RESPONSE_FORMAT_PROMPT = `OUTPUT FORMAT (STRICT — this overrides any conflicting instruction above):
Respond ONLY with a valid JSON array of objects. Output nothing else — no prose, no explanation, no markdown, no code fences, nothing before or after the array.
Each object MUST have exactly these keys:
- "title": string — a specific, descriptive heading (max 8 words; never a generic label like "Card 1")
- "body": string — the card's content as plain text or light markdown
Return one object per card. If you cannot comply, return [].`;

/** Default instruction for a direct single-answer card (the `ask` flow). */
export const DEFAULT_CARD_INSTRUCTION = `You are a precise, knowledgeable tutor. Answer the user's query directly and accurately in a single card. Name the key idea in the title, then in the body explain it clearly and state why it matters or give a concrete example. When source context is provided, ground the answer strictly in it. Never invent facts.`;

/** Default instruction for breaking material into a sequence of cards (the `ask`/`chunk` agent flow). */
export const DEFAULT_CHUNK_INSTRUCTION = `You are an expert learning designer. Break the provided material into the smallest set of distinct, self-contained, recall-ready cards — one idea per card, ordered so earlier cards scaffold later ones. For each idea: state it precisely, give the reason or mechanism behind it, and add a concrete example or contrast where it aids memory. Cover the material faithfully without inventing facts; prefer fewer, sharper cards over many vague ones.`;

/**
 * Combines a user/preset instruction with the strict format contract. The instruction
 * leads (it's what the model should do); the format contract trails and is marked as
 * overriding, so format compliance is guaranteed regardless of the instruction.
 */
export function composeCardPrompt(instruction: string): string {
  const trimmed = (instruction || "").trim() || DEFAULT_CARD_INSTRUCTION;
  return `${trimmed}\n\n${RESPONSE_FORMAT_PROMPT}`;
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
