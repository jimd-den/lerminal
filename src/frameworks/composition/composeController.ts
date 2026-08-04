import { Platform } from "react-native";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { GriotController } from "../../adapters/presenters/GriotController";
import {
  NATIVE_FONT_FORMATS,
  WEB_FONT_FORMATS,
} from "../../entities/fontCatalog";
import { Logger } from "../../usecases/ports/Logger";
import { KeyValueStore } from "../storage/KeyValueStore";
import { asyncStorageKeyValueStore } from "../storage/asyncStorageKeyValueStore";
import { ConsoleLogger } from "../logging/ConsoleLogger";
import { AsyncStorageCardRepository } from "../storage/AsyncStorageCardRepository";
import { AsyncStorageWorkspaceRepository } from "../storage/AsyncStorageWorkspaceRepository";
import { AsyncStorageSettingsRepository } from "../storage/AsyncStorageSettingsRepository";
import { AsyncStorageCommandDefinitionRepository } from "../storage/AsyncStorageCommandDefinitionRepository";
import { AsyncStorageCardTypeRepository } from "../storage/AsyncStorageCardTypeRepository";
import { AsyncStoragePromptPresetRepository } from "../storage/AsyncStoragePromptPresetRepository";
import { AsyncStorageAssistantProfileRepository } from "../storage/AsyncStorageAssistantProfileRepository";
import { AsyncStorageReviewLogRepository } from "../storage/AsyncStorageReviewLogRepository";
import { AsyncStorageOperationLogRepository } from "../storage/AsyncStorageOperationLogRepository";
import { AsyncStorageCardLinkRepository } from "../storage/AsyncStorageCardLinkRepository";
import { AsyncStorageConversationRepository } from "../storage/AsyncStorageConversationRepository";
import { AsyncStorageRoundtableRepository } from "../storage/AsyncStorageRoundtableRepository";
import { ExpoNotificationGateway } from "../notifications/ExpoNotificationGateway";
import { SilentNotificationGateway } from "../notifications/SilentNotificationGateway";
import { OpenRouterAgentGateway } from "../network/OpenRouterAgentGateway";
import { DuckDuckGoSearchGateway } from "../network/DuckDuckGoSearchGateway";
import { WebExtractionGateway } from "../network/WebExtractionGateway";
import { GoogleFontsGateway } from "../network/GoogleFontsGateway";
import { ExpoFontLoader } from "../fonts/ExpoFontLoader";

/**
 * # Composition Root
 *
 * ## Business Value & Purpose
 * The one module that knows which concrete implementation stands behind each port.
 * Keeping the wiring here — rather than in `App.tsx` or, worse, inside the controller —
 * is what makes "swap AsyncStorage for SQLite" or "run the whole app against fakes"
 * a single-file change.
 */

export interface CompositionOptions {
  /** Defaults to the device's AsyncStorage; override to test or to change backends. */
  store?: KeyValueStore;
  logger?: Logger;
}

/**
 * True inside the Expo Go client, which ships a fixed set of native modules and does not
 * include ours. `StoreClient` is the SDK's own name for "running in the downloaded Expo
 * app" as opposed to a standalone or development build.
 */
const isExpoGo =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

export function composeController(options: CompositionOptions = {}): GriotController {
  const store = options.store ?? asyncStorageKeyValueStore;
  const logger = options.logger ?? new ConsoleLogger();
  const storeOptions = { logger };

  return new GriotController({
    cardRepo: new AsyncStorageCardRepository(store, storeOptions),
    workspaceRepo: new AsyncStorageWorkspaceRepository(store, storeOptions),
    settingsRepo: new AsyncStorageSettingsRepository(store, storeOptions),
    commandDefinitionRepo: new AsyncStorageCommandDefinitionRepository(store, storeOptions),
    cardTypeRepo: new AsyncStorageCardTypeRepository(store, storeOptions),
    promptPresetRepo: new AsyncStoragePromptPresetRepository(store, storeOptions),
    assistantProfileRepo: new AsyncStorageAssistantProfileRepository(store, storeOptions),
    reviewLogRepo: new AsyncStorageReviewLogRepository(store, storeOptions),
    operationLogRepo: new AsyncStorageOperationLogRepository(store, storeOptions),
    cardLinkRepo: new AsyncStorageCardLinkRepository(store, storeOptions),
    conversationRepo: new AsyncStorageConversationRepository(store, storeOptions),
    roundtableRepo: new AsyncStorageRoundtableRepository(store, storeOptions),
    // Expo Go has no native notification module, so it gets silence rather than a crash;
    // every real build — EAS APK, dev build, `expo run:android` — gets the real thing.
    // Nothing else about the app changes between the two.
    notifications: isExpoGo
      ? new SilentNotificationGateway(logger)
      : new ExpoNotificationGateway(logger),
    agentGateway: new OpenRouterAgentGateway(),
    searchGateway: new DuckDuckGoSearchGateway(),
    extractionGateway: new WebExtractionGateway(),
    fontGateway: new GoogleFontsGateway(),
    fontLoader: new ExpoFontLoader(),
    // Which font files the host can actually render is a platform fact, so it is decided
    // here: native loads TTF/OTF only, while the web build can take WOFF2 first.
    fontFormats: Platform.OS === "web" ? WEB_FONT_FORMATS : NATIVE_FONT_FORMATS,
    logger,
  });
}
