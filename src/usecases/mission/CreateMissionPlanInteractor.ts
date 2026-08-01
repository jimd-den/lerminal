import { Card, createCard } from "../../entities/card";
import {
  describeAssumptions,
  describeKnownGaps,
  InsightOrigin,
  MissionProposal,
  WorkingMap,
} from "../../entities/mission";
import {
  createOperationRecord,
  OperationRecord,
} from "../../entities/operationLog";
import { createProvenance, CreationMode } from "../../entities/provenance";
import {
  createWorkspaceMission,
  updateWorkspaceMission,
  Workspace,
} from "../../entities/workspace";
import { CardRepository } from "../ports/repositories/CardRepository";
import { OperationLogRepository } from "../ports/repositories/OperationLogRepository";
import { WorkspaceRepository } from "../ports/repositories/WorkspaceRepository";
import { UseCaseError } from "../errors";

/** Raised when a mission plan can't be created, always with a reason the user can act on. */
export class MissionPlanError extends UseCaseError {
  constructor(userMessage: string) {
    super(userMessage);
  }
}

export interface CreateMissionPlanInput {
  workspaceId: string;
  proposal: MissionProposal;
  map: WorkingMap;
  /** Answer ids that fed the proposal, recorded on the receipt as the operation's input. */
  answerIds: string[];
  /** True only if a model actually contributed to the map. */
  modelUsed: boolean;
  /** True only if a real, user-approved search ran during the session. */
  webUsed: boolean;
  /** The model id, when one was genuinely used. */
  model?: string;
  /** Queries actually executed, if any. Never the merely *recommended* ones. */
  searchQueries?: string[];
  startedAt: number;
}

export interface MissionPlanOutcome {
  group: Card;
  cards: Card[];
  workspace: Workspace;
  operation: OperationRecord;
}

/**
 * Maps where a finding came from onto how the resulting card records its own creation.
 *
 * The mapping matters: a card derived from something the user typed is `manual`, and one
 * derived from a model's suggestion is `agent`. Recording every mission card as `agent`
 * because an agent was in the room would overstate the model's contribution; recording
 * them all as `manual` would hide it.
 */
function modeForOrigin(origin: InsightOrigin): CreationMode {
  switch (origin) {
    case "agent":
      return "agent";
    case "web":
      return "search";
    case "app":
      return "command";
    case "user":
    default:
      return "manual";
  }
}

/**
 * # Create Mission Plan Interactor
 *
 * ## Business Value & Purpose
 * The one place where accepting a mission becomes real: a group of cards with semantic
 * roles, a workspace mission, and a receipt honest enough to undo. Until this runs, the
 * proposal has created nothing, which is what lets the draft say so truthfully.
 *
 * ## What it refuses to do
 * It does not schedule anything for review. Turning a fresh plan into twenty due cards is
 * the fastest way to make a new user feel behind on day one, so study enrolment stays a
 * separate, explicit act.
 *
 * It does not overstate the model. `modelUsed` and `webUsed` are passed in from what
 * actually happened during the session, and each card's provenance follows the origin of
 * the finding behind it — so a mission built with no API key records no model, and a card
 * the user's own words produced is never marked as the agent's work.
 */
export class CreateMissionPlanInteractor {
  constructor(
    private readonly cardRepo: CardRepository,
    private readonly workspaceRepo: WorkspaceRepository,
    private readonly operationLogRepo?: OperationLogRepository
  ) {}

  async execute(input: CreateMissionPlanInput): Promise<MissionPlanOutcome> {
    const { proposal, map, workspaceId } = input;

    if (!proposal.goalStatement.trim()) {
      throw new MissionPlanError("This mission has no goal statement yet.");
    }

    const workspaces = await this.workspaceRepo.getWorkspaces();
    const workspace = workspaces.find(item => item.id === workspaceId);
    if (!workspace) {
      throw new MissionPlanError("That workspace no longer exists.");
    }

    const operationId = Math.random().toString(36).substring(2, 10);
    const createdAt = Date.now();

    // One provenance shape per card, differing only in mode and the origin behind it.
    const provenanceFor = (origin: InsightOrigin) =>
      createProvenance({
        mode: modeForOrigin(origin),
        operationId,
        // Named only when genuinely used — an unused model must not appear on a receipt.
        model: input.modelUsed ? input.model : undefined,
        searchQuery: input.searchQueries?.[0],
        createdAt,
      });

    const group = createCard({
      workspaceId,
      type: "group",
      role: "goal",
      title: proposal.title,
      body: proposal.goalStatement,
      createdAt,
      provenance: provenanceFor(map.goal?.origin ?? "user"),
    });

    const children: Card[] = proposal.suggestedCards.map(proposed =>
      createCard({
        workspaceId,
        type: proposed.type,
        role: proposed.role,
        title: proposed.title,
        body: proposed.body,
        parentId: group.id,
        createdAt,
        provenance: provenanceFor(proposed.origin),
        // Deliberately no `schedule`: see the note on study enrolment above.
      })
    );

    // Two standing notes that keep the mission honest about its own foundations.
    const assumptionsNote = createCard({
      workspaceId,
      type: "note",
      role: "claim",
      title: "Mission assumptions",
      body: describeAssumptions(map),
      parentId: group.id,
      createdAt,
      provenance: provenanceFor("app"),
    });

    const gapsNote = createCard({
      workspaceId,
      type: "note",
      role: "question",
      title: "Known gaps",
      body: describeKnownGaps(map),
      parentId: group.id,
      createdAt,
      provenance: provenanceFor("app"),
    });

    const created = [group, ...children, assumptionsNote, gapsNote];
    await this.cardRepo.saveCards(created);

    const mission = workspace.mission
      ? updateWorkspaceMission(workspace.mission, {
          goalTitle: proposal.title,
          goalDescription: proposal.goalStatement,
          successCriteria: proposal.successCriteria,
          targetDeliverable: proposal.targetDeliverable,
          // A re-accepted mission points at its newest group — the previous one, if
          // any, is left as an ordinary group rather than deleted.
          missionGroupId: group.id,
        })
      : createWorkspaceMission({
          goalTitle: proposal.title,
          goalDescription: proposal.goalStatement,
          successCriteria: proposal.successCriteria,
          targetDeliverable: proposal.targetDeliverable,
          missionGroupId: group.id,
        });

    const updatedWorkspace: Workspace = { ...workspace, mission };
    await this.workspaceRepo.saveWorkspace(updatedWorkspace);

    const operation = createOperationRecord({
      id: operationId,
      commandName: "goal",
      workspaceId,
      inputCardIds: input.answerIds,
      createdCardIds: created.map(card => card.id),
      // Snapshots are what let undo tell "untouched" from "edited since".
      createdCardSnapshots: created.map(card => ({ ...card })),
      webUsed: input.webUsed,
      searchQuery: input.searchQueries?.[0],
      model: input.modelUsed ? input.model : undefined,
      startedAt: input.startedAt,
      completedAt: createdAt,
      summary: this.summarize(created.length, input),
    });

    await this.operationLogRepo?.saveRecord(operation);

    return { group, cards: created, workspace: updatedWorkspace, operation };
  }

  /** A receipt line that states exactly what was involved — model and web included. */
  private summarize(cardCount: number, input: CreateMissionPlanInput): string {
    const parts = [`Created ${cardCount} mission cards`];
    parts.push(input.modelUsed ? `with model ${input.model ?? "unknown"}` : "without a model");
    if (input.webUsed) {
      parts.push(`using ${input.searchQueries?.length ?? 0} web search(es)`);
    } else {
      parts.push("without web access");
    }
    return parts.join(", ");
  }
}
