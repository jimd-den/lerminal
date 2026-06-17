import { Card, createCard } from "../../entities/card";
import { createWorkspace, Workspace } from "../../entities/workspace";
import { AppSettings } from "../../adapters/repositories/SettingsRepository";
import { SettingsRepository } from "../../adapters/repositories/SettingsRepository";
import { WorkspaceRepository } from "../../adapters/repositories/WorkspaceRepository";
import { CardRepository } from "../../adapters/repositories/CardRepository";
import { AgentGateway } from "../../adapters/gateways/AgentGateway";
import { AgentRequestError } from "../errors";

/** Inputs needed to bootstrap a user's first workspace from onboarding answers. */
export interface CompleteOnboardingRequest {
  /** Workspace name (the user's chosen topic). */
  topic: string;
  /** The query used to seed the first batch of cards. */
  prompt: string;
  /** Full settings to persist (with the onboarding-entered key already merged in). */
  settings: AppSettings;
}

/** The workspace and seed cards produced by completing onboarding. */
export interface CompleteOnboardingResult {
  workspace: Workspace;
  cards: Card[];
}

/**
 * # Complete Onboarding Interactor
 *
 * ## Business Value & Purpose
 * Turns the answers gathered during onboarding into a usable starting point: it
 * creates and persists the first workspace, saves the user's settings, asks the
 * agent for an initial set of cards, and persists them. The presenter applies the
 * returned workspace/cards to UI state.
 */
export class CompleteOnboardingInteractor {
  constructor(
    private readonly workspaceRepo: WorkspaceRepository,
    private readonly cardRepo: CardRepository,
    private readonly settingsRepo: SettingsRepository,
    private readonly agentGateway: AgentGateway
  ) {}

  async execute(request: CompleteOnboardingRequest): Promise<CompleteOnboardingResult> {
    const workspace = createWorkspace({ name: request.topic });
    await this.workspaceRepo.saveWorkspace(workspace);
    await this.settingsRepo.saveSettings(request.settings);

    let agentCards;
    try {
      agentCards = await this.agentGateway.ask(
        request.prompt,
        [],
        request.settings.openRouterKey,
        request.settings.selectedModel,
        request.settings.customSystemPrompt
      );
    } catch (err: any) {
      throw new AgentRequestError(err?.message);
    }

    const cards = agentCards.map(item =>
      createCard({
        workspaceId: workspace.id,
        type: "chunk",
        title: item.title,
        body: item.body,
        cite: request.topic.substring(0, 16),
      })
    );

    await this.cardRepo.saveCards(cards);
    return { workspace, cards };
  }
}
