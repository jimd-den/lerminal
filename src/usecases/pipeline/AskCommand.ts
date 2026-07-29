import { createCard } from "../../entities/card";
import { createProvenance } from "../../entities/provenance";
import { resolveAssistantProfile } from "../../entities/assistantProfile";
import { AgentGateway } from "../../adapters/gateways/AgentGateway";
import { CardRepository } from "../../adapters/repositories/CardRepository";
import { AgentRequestError } from "../errors";
import { CommandContext, CommandResult, PipelineCommand } from "./Command";

/**
 * The `--profile` regex's remainder capture group includes any surrounding quotes
 * (it only excludes them from the profile-name group), so the query needs its own
 * single-pair unquote pass — e.g. `ask --profile builtin-chat "query text"` must
 * resolve to `query text`, not `"query text"`.
 */
function unquote(value: string): string {
  const quote = value[0];
  const isQuoted = (quote === '"' || quote === "'") && value.length >= 2 && value[value.length - 1] === quote;
  return isQuoted ? value.slice(1, -1) : value;
}

/**
 * # AskCommand (`ask "<query>"` / `ask --profile "Name" "<query>"`)
 *
 * ## Business Value & Purpose
 * Queries the agent for atomic study cards, using input cards as reading context.
 * Resolves the active goal-specific {@link AssistantProfile} for `"generate-cards"` (or an
 * explicit `--profile` override) so instructions remain goal-specific (e.g. implementation coach
 * vs exam prep) while the app maintains strict non-editable response contracts.
 *
 * ## Applied Design Patterns
 * - **Command Pattern**: Encapsulates card generation in a pipeline execution step.
 * - **Strategy / Profile Pattern**: Dynamically resolves system instructions from AssistantProfile.
 */
export class AskCommand implements PipelineCommand {
  readonly name = "ask";

  constructor(
    private readonly agentGateway: AgentGateway,
    private readonly cardRepo: CardRepository
  ) {}

  async execute(arg: string, ctx: CommandContext): Promise<CommandResult> {
    if (!arg || !arg.trim()) {
      return { kind: "needsInput", mode: "ask" };
    }

    let query = arg.trim();
    let profileOverride: string | undefined;

    // Parse --profile "Profile Name" if supplied in pipeline invocation
    const profileMatch = query.match(/^--profile\s+["']?([^"']+)["']?\s+(.*)$/i);
    if (profileMatch) {
      profileOverride = profileMatch[1];
      query = unquote(profileMatch[2].trim());
    }

    const profile = resolveAssistantProfile(
      "generate-cards",
      ctx.activeProfileIds,
      ctx.assistantProfiles,
      undefined,
      profileOverride
    );
    const settingsInstruction = ctx.systemPrompt?.trim();
    const systemPrompt = [
      profile.systemPrompt,
      settingsInstruction
        ? `USER-CONFIGURED CARD INSTRUCTION (this has priority for content, depth, and style):\n${settingsInstruction}`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    let result;
    try {
      result = await this.agentGateway.ask(
        query,
        ctx.inputCards,
        ctx.apiKey,
        ctx.model,
        systemPrompt,
        profile.outputContract ?? "cards-v1"
      );
    } catch (err: any) {
      throw new AgentRequestError(err?.message);
    }

    // Provenance records whether a model actually wrote this, so a card can always
    // answer "where did you come from?" long after the run that made it.
    const cards = result.cards.map(item =>
      createCard({
        workspaceId: ctx.workspaceId,
        type: "chunk",
        title: item.title,
        body: item.body,
        cite: query.substring(0, 16),
        parentId: ctx.parentId ?? undefined,
        provenance: createProvenance({
          mode: "agent",
          sourceCardIds: ctx.inputCards.map(card => card.id),
          assistantProfileId: profile.id,
          model: ctx.model,
          isLocalFallback: result.isLocalFallback || undefined,
        }),
      })
    );

    if (cards.length === 0) {
      throw new AgentRequestError("The AI did not generate any cards from this prompt.");
    }

    await this.cardRepo.saveCards(cards);
    return { kind: "cards", cards };
  }
}
