import { Card } from "../../entities/card";
import { ResearchResult } from "../../entities/research";
import { UseCaseError } from "../errors";
import { RunResearchInteractor } from "./RunResearchInteractor";
import { ExtractResearchResultInteractor } from "./ExtractResearchResultInteractor";
import { SaveResearchResultAsSourceInteractor } from "./SaveResearchResultAsSourceInteractor";
import { CreateResearchBriefInteractor } from "./CreateResearchBriefInteractor";

/**
 * # Research Workflow
 *
 * ## Business Value & Purpose
 * Owns the whole "search the web, inspect what came back, keep what's real, cite it"
 * loop as one unit. It used to be five methods and six state fields inside the app
 * controller, tangled with unrelated features; on its own it can be reasoned about and
 * tested as what it actually is — a small state machine over four interactors.
 *
 * The honesty guarantees of the flow live here in one place: results come from a real
 * search, extraction failure is reported rather than invented, and a brief is only ever
 * built from the candidates the user explicitly kept.
 */

/** Everything the research sheet renders. */
export interface ResearchState {
  query: string;
  results: ResearchResult[];
  isOpen: boolean;
  loading: boolean;
  error: string | null;
  isCreatingBrief: boolean;
}

/** The surrounding app state a research run needs to read at the moment it runs. */
export interface ResearchContext {
  workspaceId: string | null;
  parentId: string | null;
  apiKey: string;
  model: string;
}

/** What a brief run produced, for the app to turn into a receipt. */
export interface BriefOutcome {
  created: Card[];
  keptCount: number;
  workspaceId: string;
  parentId: string | null;
}

/** The effects the workflow needs from the app but must not own. */
export interface ResearchHost {
  context(): ResearchContext;
  /** Research state changed; re-render. */
  onChange(): void;
  /** Show the user a transient message. */
  notify(message: string): void;
  /** A card was written for this workspace; reload if it is still the active one. */
  onSourceSaved(workspaceId: string, card: Card): Promise<void>;
  /** A cited brief was created; present the receipt. */
  onBriefCreated(outcome: BriefOutcome): Promise<void>;
}

export interface ResearchWorkflowDeps {
  runResearch: RunResearchInteractor;
  extractResult: ExtractResearchResultInteractor;
  saveAsSource: SaveResearchResultAsSourceInteractor;
  createBrief: CreateResearchBriefInteractor;
  host: ResearchHost;
}

const EMPTY_STATE: ResearchState = {
  query: "",
  results: [],
  isOpen: false,
  loading: false,
  error: null,
  isCreatingBrief: false,
};

/** Turns any thrown value into something worth showing a user. */
const messageFor = (error: unknown, fallback: string): string =>
  error instanceof UseCaseError ? error.userMessage : fallback;

export class ResearchWorkflow {
  private current: ResearchState = { ...EMPTY_STATE };

  constructor(private readonly deps: ResearchWorkflowDeps) {}

  get state(): ResearchState {
    return this.current;
  }

  /** Applies a partial update and re-renders — the only way this class changes state. */
  private patch(changes: Partial<ResearchState>): void {
    this.current = { ...this.current, ...changes };
    this.deps.host.onChange();
  }

  /** Replaces one candidate, matched by url. Pure with respect to the others. */
  private replaceResult(url: string, next: (result: ResearchResult) => ResearchResult): void {
    this.patch({
      results: this.current.results.map((result) =>
        result.url === url ? next(result) : result,
      ),
    });
  }

  private find(url: string): ResearchResult | undefined {
    return this.current.results.find((result) => result.url === url);
  }

  /**
   * Runs a real web search and opens the sheet with normalized, inspectable candidates.
   * A failed search sets `error` — it never falls back to model-invented "results".
   */
  async start(query: string): Promise<void> {
    const trimmed = query.trim();
    if (!trimmed) return;

    this.patch({
      query: trimmed,
      results: [],
      error: null,
      loading: true,
      isOpen: true,
    });

    try {
      this.patch({ results: await this.deps.runResearch.execute(trimmed) });
    } catch (error) {
      this.patch({ error: messageFor(error, "Search failed") });
    } finally {
      this.patch({ loading: false });
    }
  }

  /** Marks a candidate kept or rejected (or resets it to undecided). */
  setKeepState(url: string, keepState: ResearchResult["keepState"]): void {
    this.replaceResult(url, (result) => ({ ...result, keepState }));
  }

  /** Fetches a candidate's full text. Failure is surfaced, never filled in. */
  async extract(url: string): Promise<void> {
    const target = this.find(url);
    if (!target) return;

    this.patch({ loading: true });
    try {
      const extracted = await this.deps.extractResult.execute(target);
      this.replaceResult(url, () => extracted);
    } catch (error) {
      this.deps.host.notify(messageFor(error, "Extraction failed"));
    } finally {
      this.patch({ loading: false });
    }
  }

  /**
   * Saves a candidate as a real source card immediately — deterministic, no model call,
   * no API key. A learner must be able to keep evidence they found even with no AI set up.
   */
  async saveAsSource(url: string): Promise<void> {
    const { workspaceId, parentId } = this.deps.host.context();
    const target = this.find(url);
    if (!workspaceId || !target || target.savedCardId) return;

    try {
      const card = await this.deps.saveAsSource.execute({
        result: target,
        workspaceId,
        parentId,
      });
      this.replaceResult(url, (result) => ({ ...result, savedCardId: card.id }));
      await this.deps.host.onSourceSaved(workspaceId, card);
      this.deps.host.notify(`Source added: ${card.title}`);
    } catch (error) {
      this.deps.host.notify(messageFor(error, "Could not save source"));
    }
  }

  /**
   * Synthesizes a cited brief from exactly the kept candidates. The interactor refuses
   * without a key and rejects an uncited response, so a "successful" brief here always
   * traces back to sources the user chose to keep.
   */
  async createBrief(): Promise<boolean> {
    const { workspaceId, parentId, apiKey, model } = this.deps.host.context();
    if (!workspaceId) return false;

    this.patch({ isCreatingBrief: true });
    try {
      const created = await this.deps.createBrief.execute({
        query: this.current.query,
        results: this.current.results,
        workspaceId,
        parentId,
        apiKey,
        model,
      });

      const keptCount = this.current.results.filter((r) => r.keepState === "kept").length;
      this.patch({ isOpen: false });
      await this.deps.host.onBriefCreated({ created, keptCount, workspaceId, parentId });
      return true;
    } catch (error) {
      this.deps.host.notify(messageFor(error, "Could not create brief"));
      return false;
    } finally {
      this.patch({ isCreatingBrief: false });
    }
  }

  /** Closes the sheet and forgets the run; kept sources have already been saved. */
  close(): void {
    this.patch({ ...EMPTY_STATE, isCreatingBrief: this.current.isCreatingBrief });
  }
}
