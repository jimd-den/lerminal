import {
  AssistantProfile,
  createAssistantProfile,
} from "../../entities/assistantProfile";
import {
  createRoundtable,
  MAX_ROUNDTABLE_MEMBERS,
  Roundtable,
} from "../../entities/roundtable";
import { AgentGateway } from "../ports/gateways/AgentGateway";
import { AssistantProfileRepository } from "../ports/repositories/AssistantProfileRepository";
import { RoundtableRepository } from "../ports/repositories/RoundtableRepository";

export interface CreateRoundtableRequest {
  /** What the user called the panel. Blank falls back to the architect's suggestion. */
  name: string;
  /** The characters they want, in plain English. */
  brief: string;
  apiKey: string;
  model: string;
  /** The user's edited "roundtable-architect" body, if they have one. */
  architectPrompt?: string;
}

export interface CreateRoundtableResult {
  roundtable: Roundtable;
  /** The chat profiles created for it, in speaking order. */
  members: AssistantProfile[];
}

export interface CreateRoundtableDeps {
  agentGateway: AgentGateway;
  profileRepo: AssistantProfileRepository;
  roundtableRepo: RoundtableRepository;
}

/**
 * # Create Roundtable Interactor
 *
 * ## Business Value & Purpose
 * Turns one sentence — "Feynman, a skeptical statistician, and a hard-nosed editor" —
 * into a panel the user can ask. Writing three good personas by hand is work most people
 * will not do, so the panel that would have been most useful is the one that never gets
 * built. This is the shortcut that makes the feature reachable.
 *
 * ## What it creates, and why it creates real profiles
 * Each character becomes an ordinary `chat` {@link AssistantProfile} — the same kind the
 * user writes by hand — and the roundtable holds their ids. That means a generated voice
 * can be edited, re-pointed at a different model, asked on its own, or put on a second
 * panel, all through machinery that already exists. A private, panel-only persona type
 * would have bought nothing and made every one of those impossible.
 *
 * ## Nothing partial is ever saved
 * The panel and its members are written only after the whole design comes back intact. A
 * failed design leaves no half-built roundtable and no orphan personas cluttering the
 * user's list — the run either produces a usable panel or changes nothing.
 */
export class CreateRoundtableInteractor {
  constructor(private readonly deps: CreateRoundtableDeps) {}

  async execute(request: CreateRoundtableRequest): Promise<CreateRoundtableResult> {
    const brief = request.brief.trim();
    if (!brief) {
      throw new Error("Describe who should be at the table first.");
    }
    if (!request.apiKey.trim()) {
      throw new Error("An OpenRouter key is needed to design a roundtable.");
    }

    const design = this.deps.agentGateway.designRoundtable;
    if (!design) {
      throw new Error("This model provider can't design a roundtable.");
    }

    const result = await design.call(this.deps.agentGateway, {
      brief,
      apiKey: request.apiKey,
      model: request.model,
      systemPrompt: request.architectPrompt,
    });

    const members = result.members
      .slice(0, MAX_ROUNDTABLE_MEMBERS)
      .map(member =>
        createAssistantProfile({
          name: member.name,
          description: member.description,
          goal: brief,
          capability: "chat",
          systemPrompt: member.systemPrompt,
          outputContract: "conversation-v1",
          // Left unpinned on purpose: the panel follows whatever model the app is set to,
          // so a user who switches models takes the whole table with them. Pinning one
          // voice to a model is a per-persona choice they can still make afterwards.
        })
      );

    if (members.length === 0) {
      throw new Error("The model didn't return any usable characters. Nothing was created.");
    }

    const roundtable = createRoundtable({
      name: request.name.trim() || result.nameSuggestion,
      brief,
      memberIds: members.map(member => member.id),
    });

    for (const member of members) {
      await this.deps.profileRepo.saveProfile(member);
    }
    await this.deps.roundtableRepo.saveRoundtable(roundtable);

    return { roundtable, members };
  }
}
