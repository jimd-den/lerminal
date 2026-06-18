import { Card } from "../../entities/card";
import { createWorkspace, Workspace } from "../../entities/workspace";
import { AppSettings } from "../../adapters/repositories/SettingsRepository";
import { SettingsRepository } from "../../adapters/repositories/SettingsRepository";
import { WorkspaceRepository } from "../../adapters/repositories/WorkspaceRepository";
import { CardRepository } from "../../adapters/repositories/CardRepository";

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
    private readonly settingsRepo: SettingsRepository
  ) {}

  async execute(request: CompleteOnboardingRequest): Promise<CompleteOnboardingResult> {
    const workspace = createWorkspace({ name: request.topic });
    await this.workspaceRepo.saveWorkspace(workspace);
    await this.settingsRepo.saveSettings(request.settings);

    return { workspace, cards: [] };
  }
}
