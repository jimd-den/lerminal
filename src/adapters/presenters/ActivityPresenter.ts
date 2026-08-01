import { AppState } from "./GriotController";
import { findCommandDoc } from "../../usecases/commands/commandCatalog";

/**
 * # Activity Presenter
 *
 * ## Business Value & Purpose
 * Answers one question, from anywhere in the app: **is something happening right now, and
 * does it involve a model or the network?**
 *
 * This exists because of a real hole. Every in-flight indicator in the app was owned by
 * the screen that started the work — the pipeline banner lived on the deck, the brief
 * spinner in the research sheet, the streaming state in the card modal. So running
 * "Explain" on a selection while browsing a space closed the sheet and showed *nothing at
 * all* until cards silently appeared. An app whose entire thesis is "you can always see
 * what the AI is doing" was, in most of its screens, doing it invisibly.
 *
 * ## Why the shell consumes this, not the screens
 * In-flight work outlives the screen that started it — you can navigate away mid-run. So
 * reporting it belongs to the frame that is always mounted, and this presenter gives that
 * frame a single derived answer rather than making it inspect six unrelated flags.
 */

export interface ActivityModel {
  /** What is happening, in the user's words. */
  label: string;
  /** True when a language model is being called. */
  usesModel: boolean;
  /** True when the network is being used for search or fetching. */
  usesWeb: boolean;
  /** Set when the most recent operation failed and is still unacknowledged. */
  error: { message: string; operationId: string; canRetry: boolean } | null;
}

/**
 * Reads the first word of a pipeline as its command, so `chunk | recall | space` is
 * reported by what it *starts* with — the stage actually running when the banner appears.
 */
function leadingCommand(pipelineText: string): string {
  return pipelineText.trim().split(/[\s|]/)[0]?.toLowerCase() ?? "";
}

/** Turns a raw pipeline string into something worth reading on a banner. */
function describeRun(pipelineText: string): { label: string; usesModel: boolean; usesWeb: boolean } {
  const command = leadingCommand(pipelineText);
  const doc = findCommandDoc(command);

  if (!doc) {
    // A custom command or macro — we can't know its exposure, so we don't claim to.
    return { label: `Running ${command || "command"}`, usesModel: false, usesWeb: false };
  }
  return { label: doc.label, usesModel: doc.usesModel, usesWeb: doc.usesWeb };
}

/**
 * The single activity worth reporting, or null when the app is idle.
 *
 * Ordered by how much the user needs to know: a failure outranks anything still running,
 * and model/web work outranks a local download, because those are the two exposures the
 * product promises to keep visible.
 */
export function presentActivity(state: AppState): ActivityModel | null {
  const failed = state.pendingOperations.find(operation => operation.status === "error");
  if (failed) {
    return {
      label: describeRun(failed.pipelineText ?? failed.commandName).label,
      usesModel: false,
      usesWeb: false,
      error: {
        message: failed.errorMessage ?? "Something went wrong",
        operationId: failed.id,
        // A multi-stage pipeline can't be safely re-run from a failed midpoint.
        canRetry: Boolean(failed.pipelineText && !failed.pipelineText.includes("|")),
      },
    };
  }

  const running = state.pendingOperations.find(operation => operation.status === "loading");
  if (running) {
    const described = describeRun(running.pipelineText ?? running.commandName);
    return { ...described, error: null };
  }

  if (state.isCreatingBrief) {
    return { label: "Writing a cited brief", usesModel: true, usesWeb: false, error: null };
  }
  if (state.isSuggestingQueries) {
    return { label: "Suggesting search queries", usesModel: true, usesWeb: false, error: null };
  }
  if (state.chatStreamingCardId) {
    return { label: "Replying", usesModel: true, usesWeb: false, error: null };
  }
  if (state.researchLoading) {
    return { label: "Searching the web", usesModel: false, usesWeb: true, error: null };
  }
  if (state.isInstallingFont) {
    return { label: "Downloading a font", usesModel: false, usesWeb: true, error: null };
  }

  return null;
}
