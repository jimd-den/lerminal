import { toolIntentItems } from "../../entities/workspaceAgent";
import { Card } from "../../entities/card";
import { WebCitation } from "../../entities/webCitation";
import { AgentMessageSegment, ParsedAgentTag } from "../../entities/agentTags";
import {
  ThinkTankState,
  ThinkTankThread,
  ThinkTankMessage,
} from "../../usecases/thinkTank/ThinkTankWorkflow";
import { AgentTagAction } from "../../entities/agentMessage";

/**
 * # Think Tank Presenter
 *
 * ## Business Value & Purpose
 * Pure projection from {@link ThinkTankState} into exactly what the Bridge board renders.
 * No side effects, no gateway, no clock beyond `now` — mirrors `WorkspaceAgentPresenter`
 * in shape and discipline, because a post on the board and a bubble in the modal owe the
 * reader the same honesty about what is offered, what is real, and what has settled.
 */

export interface ThinkTankTagViewModel {
  id: string;
  messageId: string;
  kindLabel: string;
  title: string;
  canAdd: boolean;
  detail?: string;
  status: "offered" | "pending" | "done" | "failed";
  items: string[];
}

export type ThinkTankSegmentViewModel =
  | { kind: "text"; text: string }
  | { kind: "tag"; tag: ThinkTankTagViewModel };

export interface ThinkTankMessageViewModel {
  id: string;
  speaker: "user" | "assistant";
  text: string;
  pending: boolean;
  streaming: boolean;
  segments: ThinkTankSegmentViewModel[];
  webCitations: WebCitation[];
  personaId?: string;
  personaName?: string;
  model?: string;
}

export interface ThinkTankThreadViewModel {
  roundtableId: string;
  roundtableName: string;
  messages: ThinkTankMessageViewModel[];
  isEmpty: boolean;
  isThinking: boolean;
  error: string | null;
}

export interface ThinkTankHistoryEntryViewModel {
  roundtableId: string;
  roundtableName: string;
  title: string;
  messageCount: number;
  updatedAt: number;
  /** True for the thread currently on the board. */
  active: boolean;
}

export interface ThinkTankViewModel {
  /** The thread the board is showing, or null when none is active. */
  active: ThinkTankThreadViewModel | null;
  history: ThinkTankHistoryEntryViewModel[];
  isHistoryOpen: boolean;
  loaded: boolean;
}

/** Projects the workflow's state, plus current cards (to resolve tag targets), into a view model. */
export function presentThinkTank(state: ThinkTankState, cards: Card[]): ThinkTankViewModel {
  const cardTitles = new Map(cards.map(card => [card.id, card]));
  const activeThread = state.activeRoundtableId
    ? state.threads[state.activeRoundtableId]
    : undefined;

  return {
    active: activeThread ? toThreadViewModel(activeThread, cardTitles) : null,
    history: state.history.map(entry => ({
      roundtableId: entry.roundtableId,
      roundtableName: entry.roundtableName,
      title: entry.title,
      messageCount: entry.messageCount,
      updatedAt: entry.updatedAt,
      active: entry.roundtableId === state.activeRoundtableId,
    })),
    isHistoryOpen: state.isHistoryOpen,
    loaded: state.loaded,
  };
}

function toThreadViewModel(
  thread: ThinkTankThread,
  cardsById: Map<string, Card>
): ThinkTankThreadViewModel {
  const messages = thread.messages.map(message => toMessageViewModel(message, thread.tagActions, cardsById));
  return {
    roundtableId: thread.roundtableId,
    roundtableName: thread.roundtableName,
    messages,
    isEmpty: messages.length === 0,
    isThinking: thread.isThinking,
    error: thread.error,
  };
}

function toMessageViewModel(
  message: ThinkTankMessage,
  tagActions: Record<string, AgentTagAction>,
  cardsById: Map<string, Card>
): ThinkTankMessageViewModel {
  return {
    id: message.id,
    speaker: message.speaker,
    text: message.text,
    pending: message.pending ?? false,
    streaming: message.streaming ?? false,
    segments: (message.segments ?? []).map(segment =>
      toSegmentViewModel(segment, message.id, tagActions, cardsById)
    ),
    webCitations: message.webCitations ? [...message.webCitations] : [],
    ...(message.personaId ? { personaId: message.personaId } : {}),
    ...(message.personaName ? { personaName: message.personaName } : {}),
    ...(message.model ? { model: message.model } : {}),
  };
}

function toSegmentViewModel(
  segment: AgentMessageSegment,
  messageId: string,
  tagActions: Record<string, AgentTagAction>,
  cardsById: Map<string, Card>
): ThinkTankSegmentViewModel {
  if (segment.kind === "text") return { kind: "text", text: segment.text };
  return {
    kind: "tag",
    tag: toTagViewModel(
      segment.tag,
      messageId,
      tagActions[`${messageId}:${segment.tag.id}`],
      cardsById
    ),
  };
}

/**
 * Projects one tag into its chip — the identical rule `WorkspaceAgentPresenter` uses: the
 * chip can only ever *offer*, `detail` is either why it can't be added or what actually
 * happened, and a multi-card intent names what it would really touch rather than asking
 * the reader to trust a count.
 */
function toTagViewModel(
  tag: ParsedAgentTag,
  messageId: string,
  action: AgentTagAction | undefined,
  cardsById: Map<string, Card>
): ThinkTankTagViewModel {
  const items = tag.intent
    ? (toolIntentItems(tag.intent) ?? []).map(
        item => (item.cardId ? (cardsById.get(item.cardId)?.title ?? item.title) : item.title)
      )
    : [];

  return {
    id: tag.id,
    messageId,
    kindLabel: tag.kindLabel,
    title: tag.title,
    canAdd: tag.intent !== null,
    ...(action?.resultMessage
      ? { detail: action.resultMessage }
      : tag.invalidReason
        ? { detail: tag.invalidReason }
        : {}),
    status:
      action?.status === "pending"
        ? "pending"
        : action?.status === "done"
          ? "done"
          : action?.status === "failed"
            ? "failed"
            : "offered",
    items,
  };
}
