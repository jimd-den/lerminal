import { Card } from "../../entities/card";
import { AgentGateway } from "../ports/gateways/AgentGateway";
import { NextAction, NextActionOptions, nextActionsForCard } from "./nextActions";
import { UseCaseError } from "../errors";

/** Raised when the model can't be asked or its answer can't be used. */
export class SuggestNextActionError extends UseCaseError {
  constructor(userMessage: string) {
    super(userMessage);
  }
}

export interface SuggestedNextAction {
  /** One of the deterministic {@link NextAction}s already offered for this card. */
  action: NextAction;
  /** The model's one-line reason, shown next to the highlighted choice. */
  reason: string;
}

/**
 * # Suggest Next Action Interactor
 *
 * ## Business Value & Purpose
 * The agentic half of "what should I do with this?" — the model looks at a freshly
 * captured card and points at *one* of the next moves already on offer, with a reason.
 * This is what makes GRIOT feel like a working partner rather than a static menu: instead
 * of always leading with the same first item, the highlighted choice responds to what was
 * actually captured.
 *
 * ## Why the model cannot invent an action
 * `nextActionsForCard` is the single source of truth for what a card can legally do next
 * — the same closed vocabulary the deterministic menu renders. This interactor asks the
 * model to choose an `id` from that exact list and rejects anything else, so a
 * hallucinated action, a made-up preset, or a wording drift can never reach a dispatch.
 * The model is a chooser over a menu it doesn't get to write, via a dedicated gateway
 * method rather than the card-generation `ask` path, whose output contract would fight
 * this one's strict `id:`/`reason:` format.
 *
 * ## Never on the critical path
 * Every one of these actions is already reachable without asking the model at all — this
 * only decides which one to point at first. A missing key or a failed call is a real
 * failure the caller must show (never a silent fallback that pretends nothing happened),
 * but it costs the user a *highlight*, not a capability.
 */
export class SuggestNextActionInteractor {
  constructor(private readonly agentGateway: AgentGateway) {}

  async execute(
    card: Card,
    apiKey: string,
    model: string,
    options: NextActionOptions = {}
  ): Promise<SuggestedNextAction> {
    const menu = nextActionsForCard(card, options);
    if (menu.length === 0) {
      throw new SuggestNextActionError("There's nothing to suggest for this card.");
    }

    const trimmedKey = apiKey.trim();
    if (!trimmedKey) {
      throw new SuggestNextActionError("No API key is set.");
    }
    if (!this.agentGateway.suggestNextAction) {
      throw new SuggestNextActionError("This build has no model connection for suggestions.");
    }

    let text: string;
    try {
      text = await this.agentGateway.suggestNextAction({
        prompt: buildPrompt(card, menu),
        apiKey: trimmedKey,
        model,
      });
    } catch (err: any) {
      throw new SuggestNextActionError(err?.message ?? "Couldn't reach the model");
    }

    const parsed = parseChoice(text);
    const chosen = parsed && menu.find(action => action.id === parsed.id);
    if (!chosen) {
      throw new SuggestNextActionError("The model's answer wasn't one of the offered actions.");
    }

    return { action: chosen, reason: parsed!.reason };
  }
}

function buildPrompt(card: Card, menu: NextAction[]): string {
  const options = menu.map(action => `- ${action.id}: ${action.label}`).join("\n");
  return [
    `A learner just captured this card:`,
    `Title: ${card.title}`,
    card.body ? `Body: ${card.body}` : null,
    ``,
    `Pick exactly one of the following next actions by id, and give a one-sentence reason.`,
    `Respond with nothing but this exact format, no other text:`,
    `id: <one of the ids below>`,
    `reason: <one sentence>`,
    ``,
    options,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

/** Reads the strict `id: …\nreason: …` format the prompt asks for. Anything else is null. */
function parseChoice(text: string): { id: string; reason: string } | null {
  const idMatch = text.match(/id:\s*([a-z0-9-]+)/i);
  const reasonMatch = text.match(/reason:\s*(.+)/i);
  if (!idMatch) return null;
  return {
    id: idMatch[1].trim(),
    reason: reasonMatch?.[1]?.trim() ?? "",
  };
}
