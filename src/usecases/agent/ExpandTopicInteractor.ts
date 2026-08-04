import { AgentGateway } from "../ports/gateways/AgentGateway";
import { CardRepository } from "../ports/repositories/CardRepository";
import { BUILTIN_ASSISTANT_PROFILES } from "../../entities/assistantProfile";
import { Card } from "../../entities/card";
import { AgentRequestError, MissingApiKeyError } from "../errors";
import { buildGroupedCards } from "./groupedCards";

const TOPIC_PROFILE = BUILTIN_ASSISTANT_PROFILES.find(p => p.id === "builtin-topic-architect")!;

export interface ExpandTopicRequest {
  /** What to cover, in the user's own words. */
  topic: string;
  workspaceId: string;
  /** Where the resulting group lands — the group the user is currently inside, if any. */
  parentId?: string | null;
  apiKey: string;
  model: string;
  /**
   * The active persona's behaviour body, when the user is talking to one.
   *
   * This is the whole reason topic expansion is not just a second syllabus call. A learner
   * who has chosen a voice — a first-principles tutor, a contrarian, a shipping-focused
   * engineer — chose it for the material too, not only for the chat bubbles. Layering that
   * body over the curriculum instruction is what keeps the chapters sounding like the
   * assistant they were talking to a moment ago.
   */
  voicePrompt?: string;
  /** Name of that persona, so the group can say who wrote it. Cosmetic only. */
  voiceName?: string;
}

export interface ExpandedTopic {
  group: Card;
  /** Chapter subgroups, in reading order. */
  chapters: Card[];
  items: Card[];
}

/**
 * # Expand Topic Interactor
 *
 * ## Business Value & Purpose
 * The chat agent can offer a study set inline, but a tag written mid-sentence is bounded by
 * the turn it lives in — it produces what fits in a reply, not what the topic deserves. This
 * is the deeper pass: one dedicated model call whose entire job is to cover a topic
 * properly, returning a group of named chapters with cards underneath and a closing chapter
 * of things worth reading.
 *
 * ## Voice
 * {@link ExpandTopicRequest.voicePrompt} carries the active persona's body into the call.
 * The app's own curriculum instruction leads (it owns the *shape* of the answer), the
 * persona's body follows (it owns the *manner*), and the output contract closes as always.
 * A persona can therefore change how the material reads and never what the app can parse.
 *
 * ## What it will not do
 * It inherits the same rule every other call obeys: no invented URLs. Reading suggestions
 * name the work and say what it is good for; a link appears only when the model is certain
 * of the address. Real, verifiable sources come from the research/search path, which is a
 * separate mechanism on purpose.
 *
 * An empty or unparseable response throws rather than saving a hollow group.
 */
export class ExpandTopicInteractor {
  constructor(
    private readonly agentGateway: AgentGateway,
    private readonly cardRepo: CardRepository
  ) {}

  async execute(request: ExpandTopicRequest): Promise<ExpandedTopic> {
    const topic = request.topic.trim();
    if (!request.apiKey?.trim()) {
      throw new MissingApiKeyError("Expanding a topic");
    }
    if (!topic) {
      throw new AgentRequestError("No topic was given, so nothing was generated.");
    }

    const askResult = await this.agentGateway.ask(
      buildTopicPrompt(topic),
      [],
      request.apiKey,
      request.model,
      composeTopicInstruction(request.voicePrompt),
      "cards-v1"
    );

    // Template material would be confidently wrong about the topic, and worse, would look
    // like the model had answered.
    if (askResult.isLocalFallback) {
      throw new AgentRequestError(
        askResult.fallbackReason ?? "No model answered, so nothing was generated"
      );
    }

    const valid = askResult.cards.filter(
      card => typeof card?.title === "string" && card.title.trim() && typeof card?.body === "string"
    );
    if (valid.length === 0) {
      throw new AgentRequestError("The model didn't return anything usable on that topic.");
    }

    const { group, sections, items } = buildGroupedCards({
      workspaceId: request.workspaceId,
      groupTitle: topic,
      parentId: request.parentId ?? null,
      items: valid.map(card => ({
        title: card.title,
        body: card.body,
        references: card.references,
      })),
      model: request.model,
    });

    await this.cardRepo.saveCards([group, ...sections, ...items]);
    return { group, chapters: sections, items };
  }
}

/**
 * The app's curriculum instruction, with the persona's voice layered over it.
 *
 * Order matters: shape first, manner second. A persona that says "answer in one word"
 * still ships an instruction demanding chapters, because the app's requirement is stated
 * before the persona's and the output contract restates it afterwards.
 */
export function composeTopicInstruction(voicePrompt?: string): string {
  const voice = voicePrompt?.trim();
  if (!voice) return TOPIC_PROFILE.systemPrompt;
  return [
    TOPIC_PROFILE.systemPrompt,
    `VOICE (how this should read — it changes the manner, never the structure required above):\n${voice}`,
  ].join("\n\n");
}

/** The user-message half of the call: what to cover, and the title convention to use. */
export function buildTopicPrompt(topic: string): string {
  return [
    `Topic to cover: ${topic}`,
    "",
    'Return 10 to 20 cards. Every title MUST be "Chapter name :: Card title", so the app can',
    "group them. Order the chapters the way someone should actually work through them, and",
    'make the last chapter "Further reading".',
    "",
    "Each card's body says what the idea is and why it matters for this topic, concretely.",
    "Name real instructions, techniques, constraints, and trade-offs rather than topic labels.",
  ].join("\n");
}
