import { Logger, silentLogger } from "../ports/Logger";
import { CardRepository } from "../ports/repositories/CardRepository";
import { SettingsRepository } from "../ports/repositories/SettingsRepository";
import { AgentGateway } from "../ports/gateways/AgentGateway";
import { SearchGateway } from "../ports/gateways/SearchGateway";
import { ExtractionGateway } from "../ports/gateways/ExtractionGateway";
import { CommandDefinition } from "../../entities/commandDefinition";
import { CreateNote } from "../card/CreateNote";
import { GroupCardsInteractor } from "../grouping/GroupCardsInteractor";
import { PipelineCommand } from "./Command";
import { PipelineRunner } from "./PipelineRunner";
import { createPipelineCommand } from "./CommandFactory";
import { NoteCommand } from "./NoteCommand";
import { AskCommand } from "./AskCommand";
import { SourceCommand } from "./SourceCommand";
import { ChunkCommand } from "./ChunkCommand";
import { SplitCommand } from "./SplitCommand";
import { RecallCommand } from "./RecallCommand";
import { SpaceCommand } from "./SpaceCommand";
import { MoveCommand } from "./MoveCommand";
import { ReviewCommand } from "./ReviewCommand";
import { GroupCommand } from "./GroupCommand";
import { UngroupCommand } from "./UngroupCommand";
import { DeleteCommand } from "./DeleteCommand";
import { SearchCommand } from "./SearchCommand";
import { ClozeCommand } from "./ClozeCommand";
import { ElaborateCommand } from "./ElaborateCommand";

/**
 * # Command Registry
 *
 * ## Business Value & Purpose
 * Knows which commands exist and how to build a runner from them. Previously the app
 * controller imported all sixteen built-in command classes and assembled them inline,
 * which meant adding a command — the most routine extension this app has — required
 * editing the largest class in the codebase.
 *
 * The registry also owns the one subtlety in that assembly: custom commands are rebuilt
 * whenever their definitions change, and a pipeline macro must be able to call other
 * custom commands, so each is handed a lazy reference to the *current* runner rather
 * than the one that existed when it was created.
 */

export interface CommandRegistryDeps {
  cardRepo: CardRepository;
  settingsRepo: SettingsRepository;
  agentGateway: AgentGateway;
  searchGateway: SearchGateway;
  extractionGateway: ExtractionGateway;
  createNote: CreateNote;
  groupCards: GroupCardsInteractor;
  /** Where degraded-but-successful runs report themselves; silent by default. */
  logger?: Logger;
}

export class CommandRegistry {
  private readonly builtins: PipelineCommand[];
  private runner: PipelineRunner;

  private readonly logger: Logger;

  constructor(private readonly deps: CommandRegistryDeps) {
    this.logger = deps.logger ?? silentLogger;
    this.builtins = buildBuiltinCommands(deps, this.logger);
    this.runner = new PipelineRunner(this.builtins, this.logger);
  }

  /** The runner to execute against. Replaced wholesale whenever custom commands change. */
  getRunner(): PipelineRunner {
    return this.runner;
  }

  /** Rebuilds the runner from the built-ins plus the user's current custom definitions. */
  rebuild(definitions: CommandDefinition[]): PipelineRunner {
    const custom = definitions.map((definition) =>
      createPipelineCommand(definition, {
        agentGateway: this.deps.agentGateway,
        cardRepo: this.deps.cardRepo,
        // Lazy: a macro expands into whatever the current runner is, so macros defined
        // alongside each other can call one another.
        getRunner: () => this.runner,
      }),
    );
    this.runner = new PipelineRunner([...this.builtins, ...custom], this.logger);
    return this.runner;
  }
}

/** The commands every install has, in the order they are offered. */
function buildBuiltinCommands(
  deps: CommandRegistryDeps,
  logger: Logger,
): PipelineCommand[] {
  return [
    new NoteCommand(deps.createNote),
    new AskCommand(deps.agentGateway, deps.cardRepo),
    new SourceCommand(deps.cardRepo, deps.extractionGateway, logger),
    new ChunkCommand(deps.agentGateway, deps.cardRepo, logger),
    new SplitCommand(deps.cardRepo),
    new RecallCommand(deps.cardRepo),
    new SpaceCommand(deps.cardRepo),
    new MoveCommand(deps.cardRepo),
    new ReviewCommand(),
    new GroupCommand(deps.groupCards),
    new UngroupCommand(deps.cardRepo),
    new DeleteCommand(deps.cardRepo),
    new SearchCommand(deps.searchGateway, deps.cardRepo, deps.settingsRepo),
    new ClozeCommand(deps.cardRepo),
    new ElaborateCommand(deps.cardRepo),
  ];
}
