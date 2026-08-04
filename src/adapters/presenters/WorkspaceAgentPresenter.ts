import { Card } from "../../entities/card";
import { Roundtable, resolveRoundtableMembers } from "../../entities/roundtable";
import { WebCitation } from "../../entities/webCitation";
import { Workspace } from "../../entities/workspace";
import { toolIntentItems } from "../../entities/workspaceAgent";
import { AgentMessageSegment, ParsedAgentTag } from "../../entities/agentTags";
import {
  contextCardIds,
  tagActionKey,
  WorkspaceAgentMessage,
  WorkspaceAgentSentContext,
  WorkspaceAgentState,
  WorkspaceAgentTagAction,
} from "../../usecases/workspaceAgent/WorkspaceAgentWorkflow";
import { WorkspacePulseObservation } from "../../usecases/workspaceAgent/observeWorkspace";

/**
 * # Workspace Agent Presenter
 *
 * ## Business Value & Purpose
 * Pure projection from the workflow's session state and `observeWorkspace`'s output into
 * exactly what the pulse banner and conversation sheet render. No side effects, no
 * gateway access — this file cannot itself make anything look like AI or web activity
 * happened, because it never runs anything, it only describes state that already exists.
 */

/** Up to three short actions offered beside the pulse text. */
export interface WorkspacePulseChip {
  id: string;
  label: string;
}

export interface WorkspacePulseViewModel {
  message: string;
  chips: WorkspacePulseChip[];
  cardIds: string[];
}

const CHIPS_BY_KIND: Record<WorkspacePulseObservation["kind"], WorkspacePulseChip[]> = {
  "notes-need-question": [
    { id: "group-these", label: "Group these" },
    { id: "dismiss", label: "Dismiss" },
  ],
  "unextracted-source": [
    { id: "extract-source", label: "Extract source" },
    { id: "dismiss", label: "Dismiss" },
  ],
  "unlinked-note-cluster": [
    { id: "group-these", label: "Group these" },
    { id: "find-sources", label: "Find sources" },
    { id: "dismiss", label: "Dismiss" },
  ],
};

/** Projects a raw observation (or none) into the pulse banner's view model. */
export function presentWorkspacePulse(
  observation: WorkspacePulseObservation | null,
): WorkspacePulseViewModel | null {
  if (!observation) return null;

  return {
    message: observation.message,
    chips: CHIPS_BY_KIND[observation.kind] ?? [{ id: "dismiss", label: "Dismiss" }],
    cardIds: [...observation.cardIds],
  };
}

export interface WorkspaceAgentMessageViewModel {
  id: string;
  speaker: "user" | "assistant";
  text: string;
  pending: boolean;
  /**
   * Receipts: sources the model's provider actually consulted for this reply. Empty
   * whenever nothing came back, which is the only honest default — the sheet renders the
   * "sources consulted" strip if and only if this is non-empty, so nothing in the UI can
   * imply a search happened on the strength of a setting.
   *
   * These are *not* saved research candidates. The app's own `SearchGateway` /
   * `ResearchWorkflow` path produces those, and it stays a separate mechanism.
   */
  webCitations: WebCitation[];
  /**
   * What actually left the device for this reply, resolved to readable card titles —
   * the sheet's transparency disclosure. Present on assistant messages only.
   */
  sentContext?: WorkspaceAgentSentContextViewModel;
  /**
   * The model's own intermediate thinking, when the provider returned any. Absent
   * whenever it didn't: the sheet renders reasoning if and only if this is set, so no
   * turn can be made to look like it reasoned.
   */
  reasoning?: string;
  /**
   * The reply as prose and inline tag chips, in the order the model wrote them. A plain
   * conversational reply — the common case — is a single text segment and renders as
   * nothing but a bubble.
   */
  segments: WorkspaceAgentSegmentViewModel[];
  /** True while this reply is still being generated. The sheet shows the partial text. */
  streaming: boolean;
  /**
   * Which voice said it, and on what model. Assistant messages only, and recorded at send
   * time — a transcript with several personas in it stays honest about who said what even
   * after the user switches persona or re-pins a model.
   */
  personaName?: string;
  model?: string;
}

/** One row in the history list. */
export interface WorkspaceAgentHistoryEntryViewModel {
  id: string;
  title: string;
  /** How many turns are in it, so a one-line exchange is distinguishable from real work. */
  messageCount: number;
  updatedAt: number;
  /** True for the conversation currently on screen. */
  current: boolean;
}

/** One selectable voice in the persona strip. */
export interface WorkspaceAgentPersonaViewModel {
  id: string;
  name: string;
  /** The model it speaks through, shown under the name so the pairing is never a guess. */
  model: string;
  active: boolean;
}

/** One inline chip: what the model offered to create, and what has become of it. */
export interface WorkspaceAgentTagViewModel {
  id: string;
  /** The reply the chip belongs to — the other half of the key `+` dispatches with. */
  messageId: string;
  /** NOTE / QUESTION / LINK / GROUP. */
  kindLabel: string;
  title: string;
  /**
   * False when there is nothing to add: an unresolvable card reference, a link that isn't
   * a URL, a group with nothing in it. The `+` disables and `detail` says why.
   */
  canAdd: boolean;
  /**
   * The truthful line under the chip: why it can't be added, or what happened when it
   * was. Absent while a healthy chip is simply waiting to be tapped.
   */
  detail?: string;
  /** "offered" until the user taps `+`. Nothing is created in any other state. */
  status: "offered" | "pending" | "done" | "failed";
  /**
   * For a chip that would touch several cards (a group), the titles it would actually
   * use — resolved here, because only the adapter layer knows what a card is called.
   */
  items: string[];
}

export type WorkspaceAgentSegmentViewModel =
  | { kind: "text"; text: string }
  | { kind: "tag"; tag: WorkspaceAgentTagViewModel };

/** The audit view of one turn's request — see `WorkspaceAgentSentContext`. */
export interface WorkspaceAgentSentContextViewModel {
  /** The group the turn was scoped to, or null for the workspace root. */
  groupLabel: string | null;
  /**
   * Every card that travelled, in send order. `title` falls back to the id when the card
   * has since been deleted — an id is still the truth about what was sent.
   */
  cards: Array<{ id: string; title: string; focus: boolean }>;
  /** The verbatim briefing text that was sent. */
  briefing: string;
}

/**
 * Summary line for the sheet's context chips row.
 *
 * `cardCount` is the number of cards that will actually accompany the next message — the
 * open card plus the selection, de-duplicated, exactly as `contextCardIds` computes it for
 * the briefing. The chips therefore cannot over-claim: they are projected from the same
 * live context the workflow sends.
 */
export interface WorkspaceAgentContextViewModel {
  workspaceName: string;
  groupLabel: string | null;
  /** Cards accompanying the next message (open card + selection, de-duplicated). */
  cardCount: number;
  /** Title of the card open in the detail modal, if any — the "explain this" focus. */
  focusCardTitle: string | null;
}

export interface WorkspaceAgentViewModel {
  isOpen: boolean;
  context: WorkspaceAgentContextViewModel;
  messages: WorkspaceAgentMessageViewModel[];
  /** True when there is nothing in the transcript yet. */
  isEmpty: boolean;
  isThinking: boolean;
  agentError: string | null;
  /** Every voice available. Always begins with plain GRIOT. */
  personas: WorkspaceAgentPersonaViewModel[];
  /** True once the user has configured a persona beyond GRIOT — the strip hides until then. */
  hasMultiplePersonas: boolean;
  isHistoryOpen: boolean;
  /** Saved conversations for this workspace, newest first. */
  history: WorkspaceAgentHistoryEntryViewModel[];
  /** The user's saved panels, each already narrowed to members that still exist. */
  roundtables: WorkspaceAgentRoundtableViewModel[];
}

export interface WorkspaceAgentRoundtableViewModel {
  id: string;
  name: string;
  /** The voices that will actually answer, in speaking order. */
  memberNames: string[];
  /**
   * True when every member has been deleted. Kept in the list rather than hidden: a panel
   * that silently vanished would look like data loss, and the user is the one who should
   * decide whether to rebuild it or clear it away.
   */
  isEmpty: boolean;
}

const EMPTY_CONTEXT_VIEW: WorkspaceAgentContextViewModel = {
  workspaceName: "",
  groupLabel: null,
  cardCount: 0,
  focusCardTitle: null,
};

/**
 * Projects the workflow's conversation state into the sheet's view model. `workspaces`
 * and `groupTitle` are looked up here rather than stored on the workflow, since the
 * workflow only knows ids and the workspace name can change out from under it.
 */
export function presentWorkspaceAgent(
  state: WorkspaceAgentState,
  workspaces: Workspace[],
  groupTitle: string | null,
  focusCardTitle: string | null = null,
  cards: Card[] = [],
  roundtables: Roundtable[] = [],
): WorkspaceAgentViewModel {
  const cardTitles = new Map(cards.map((card) => [card.id, card]));
  const workspace = workspaces.find((ws) => ws.id === state.workspaceId);

  const context: WorkspaceAgentContextViewModel = state.isOpen
    ? {
        workspaceName: workspace?.name ?? "",
        groupLabel: groupTitle,
        cardCount: contextCardIds(state.context).length,
        focusCardTitle: state.context.openCardId ? focusCardTitle : null,
      }
    : EMPTY_CONTEXT_VIEW;

  const messages = state.messages.map(message =>
    toMessageViewModel(message, state.tagActions, cardTitles)
  );

  // Defaulted rather than assumed: this projection feeds the whole app state, and a
  // conversation state that predates personas must degrade to "GRIOT only", never crash
  // the screen. Same posture as `message.segments ?? []` below.
  const personas: WorkspaceAgentPersonaViewModel[] = (state.personas ?? []).map(persona => ({
    id: persona.id,
    name: persona.name,
    model: persona.model,
    active: persona.id === state.activePersonaId,
  }));

  return {
    isOpen: state.isOpen,
    context,
    messages,
    isEmpty: messages.length === 0,
    isThinking: state.isThinking,
    agentError: state.agentError,
    personas,
    // One voice is not a choice: with only GRIOT configured the sheet looks exactly as it
    // did before personas existed.
    hasMultiplePersonas: personas.length > 1,
    // Resolved against the personas actually available, so a panel naming a deleted
    // voice shows the voices that remain rather than a name that answers nothing.
    roundtables: roundtables.map(roundtable => {
      const members = resolveRoundtableMembers(roundtable, personas);
      return {
        id: roundtable.id,
        name: roundtable.name,
        memberNames: members.map(member => member.name),
        isEmpty: members.length === 0,
      };
    }),
    isHistoryOpen: state.isHistoryOpen ?? false,
    history: (state.history ?? []).map(conversation => ({
      id: conversation.id,
      title: conversation.title,
      messageCount: conversation.messages.length,
      updatedAt: conversation.updatedAt,
      current: conversation.id === state.conversationId,
    })),
  };
}

function toMessageViewModel(
  message: WorkspaceAgentMessage,
  tagActions: Record<string, WorkspaceAgentTagAction>,
  cardsById: Map<string, Card>,
): WorkspaceAgentMessageViewModel {
  return {
    id: message.id,
    speaker: message.speaker,
    text: message.text,
    pending: message.pending ?? false,
    webCitations: message.webCitations ? [...message.webCitations] : [],
    ...(message.sentContext
      ? { sentContext: toSentContextViewModel(message.sentContext, cardsById) }
      : {}),
    // Copied through verbatim, and omitted entirely when the model returned none.
    ...(message.reasoning ? { reasoning: message.reasoning } : {}),
    segments: (message.segments ?? []).map(segment =>
      toSegmentViewModel(segment, message.id, tagActions, cardsById)
    ),
    streaming: message.streaming ?? false,
    ...(message.personaName ? { personaName: message.personaName } : {}),
    ...(message.model ? { model: message.model } : {}),
  };
}

function toSegmentViewModel(
  segment: AgentMessageSegment,
  messageId: string,
  tagActions: Record<string, WorkspaceAgentTagAction>,
  cardsById: Map<string, Card>,
): WorkspaceAgentSegmentViewModel {
  if (segment.kind === "text") return { kind: "text", text: segment.text };
  return {
    kind: "tag",
    tag: toTagViewModel(segment.tag, messageId, tagActions[tagActionKey(messageId, segment.tag.id)], cardsById),
  };
}

/**
 * Projects one tag into its chip.
 *
 * The chip can only ever *offer*: `status` starts at "offered" and moves only because the
 * user tapped `+`, and `detail` is either the parser's own reason the tag isn't usable or
 * the dispatcher's own account of what happened. Neither is written here, so this file
 * cannot make anything look like it was created.
 */
function toTagViewModel(
  tag: ParsedAgentTag,
  messageId: string,
  action: WorkspaceAgentTagAction | undefined,
  cardsById: Map<string, Card>,
): WorkspaceAgentTagViewModel {
  // Multi-card intents (a group) list what they would really touch, by title — the entity
  // layer only knows ids, and a chip that says "3 cards" without naming them is a chip the
  // user has to trust rather than check.
  const items = tag.intent
    ? (toolIntentItems(tag.intent) ?? [])
        .map(item => (item.cardId ? (cardsById.get(item.cardId)?.title ?? item.title) : item.title))
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
    status: action?.status === "pending"
      ? "pending"
      : action?.status === "done"
        ? "done"
        : action?.status === "failed"
          ? "failed"
          : "offered",
    items,
  };
}

function toSentContextViewModel(
  sent: WorkspaceAgentSentContext,
  cardsById: Map<string, Card>,
): WorkspaceAgentSentContextViewModel {
  const focus = new Set(sent.focusCardIds);
  return {
    groupLabel: sent.groupId ? (cardsById.get(sent.groupId)?.title ?? sent.groupId) : null,
    cards: sent.cardIds.map((id) => ({
      id,
      title: cardsById.get(id)?.title ?? id,
      focus: focus.has(id),
    })),
    briefing: sent.briefing,
  };
}
