import { Card, createCard } from "./card";

/**
 * # Failed Run Cards
 *
 * ## Business Value & Purpose
 * When an operation fails, the failure becomes a **card** rather than a banner.
 *
 * A banner is the wrong shape for this: it can be dismissed, it vanishes on navigation,
 * and it dies on app restart — so a run that failed while the user was on another screen
 * leaves no trace, and they're left wondering whether it ever ran. A card is durable,
 * sits in the workspace where the output *would* have gone, can be inspected later, and
 * carries everything needed to try again.
 *
 * It also fits the product's own grammar: everything here is a card. A failure is simply
 * a card about something that didn't happen.
 *
 * ## What it carries
 * Enough to re-run faithfully — the pipeline text, the exact input cards, and the
 * destination group — because a retry that silently uses *whatever is selected now* is a
 * different operation wearing the same label.
 */

/** Field keys on a failure card. Kept in one place so writer and reader can't drift. */
const FIELD = {
  pipelineText: "pipelineText",
  inputCardIds: "inputCardIds",
  parentId: "parentId",
  errorMessage: "errorMessage",
  failedAt: "failedAt",
} as const;

export interface FailedRunDetails {
  /** The pipeline that failed, verbatim, ready to run again. */
  pipelineText: string;
  /** The cards it consumed, so a retry sees the same input. */
  inputCardIds: string[];
  /** Where the output was headed (null = workspace root). */
  parentId: string | null;
  /** The failure, in the user's terms. */
  errorMessage: string;
  failedAt: number;
}

export interface CreateFailedRunCardParams extends FailedRunDetails {
  workspaceId: string;
}

/**
 * Builds the failure card. The title states what failed rather than leading with the
 * error, so a deck full of cards still reads as a list of *operations* — the error is the
 * detail, the run is the subject.
 */
export function createFailedRunCard(params: CreateFailedRunCardParams): Card {
  return createCard({
    workspaceId: params.workspaceId,
    type: "failure",
    typeId: "failure",
    title: `Failed: ${params.pipelineText}`,
    body: params.errorMessage,
    parentId: params.parentId ?? undefined,
    fields: {
      [FIELD.pipelineText]: params.pipelineText,
      [FIELD.inputCardIds]: JSON.stringify(params.inputCardIds),
      [FIELD.parentId]: params.parentId ?? "",
      [FIELD.errorMessage]: params.errorMessage,
      [FIELD.failedAt]: String(params.failedAt),
    },
  });
}

export function isFailedRunCard(card: Card): boolean {
  return (card.typeId ?? card.type) === "failure";
}

/**
 * Reads a failure card back into its retry payload, or null when the card is malformed.
 *
 * Returning null rather than a partially-filled object matters: a retry built from half a
 * payload would run *something*, just not the thing that failed. Better to offer no retry
 * than a misleading one.
 */
export function readFailedRunCard(card: Card): FailedRunDetails | null {
  if (!isFailedRunCard(card)) return null;
  const fields = card.fields;
  const pipelineText = fields?.[FIELD.pipelineText];
  if (!pipelineText) return null;

  let inputCardIds: string[] = [];
  try {
    const parsed = JSON.parse(fields?.[FIELD.inputCardIds] ?? "[]");
    if (Array.isArray(parsed)) inputCardIds = parsed.filter(id => typeof id === "string");
  } catch {
    return null;
  }

  const parentId = fields?.[FIELD.parentId];
  return {
    pipelineText,
    inputCardIds,
    parentId: parentId ? parentId : null,
    errorMessage: fields?.[FIELD.errorMessage] ?? card.body ?? "Something went wrong",
    failedAt: Number(fields?.[FIELD.failedAt]) || card.createdAt,
  };
}
