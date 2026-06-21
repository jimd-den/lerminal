import {
  CardTypeDefinition,
  CARD_TYPE_NAME_PATTERN,
  createCardTypeDefinition,
  FieldSpec,
  LearningBehavior,
  normalizeCardTypeId,
} from "../../entities/cardTypeDefinition";
import { CardTypeRepository } from "../../adapters/repositories/CardTypeRepository";
import { DuplicateCardTypeError, InvalidCardTypeNameError } from "../errors";

/** Inputs for defining a custom card type. */
export interface CreateCardTypeRequest {
  name: string;
  color?: string;
  icon?: string;
  learning?: LearningBehavior;
  fields?: FieldSpec[];
}

/**
 * # Create Card Type Interactor
 *
 * ## Business Value & Purpose
 * Validates and persists a new user-defined card type. The id (derived from the name)
 * must be a single lowercase token and must be unique among all existing types —
 * including the seeded built-ins — so cards resolve their type unambiguously.
 */
export class CreateCardTypeInteractor {
  constructor(private readonly repo: CardTypeRepository) {}

  /**
   * @throws {InvalidCardTypeNameError | DuplicateCardTypeError}
   */
  async execute(request: CreateCardTypeRequest): Promise<CardTypeDefinition> {
    const id = normalizeCardTypeId(request.name);

    if (!CARD_TYPE_NAME_PATTERN.test(id)) {
      throw new InvalidCardTypeNameError();
    }

    const existing = await this.repo.getTypes();
    if (existing.some(t => t.id === id)) {
      throw new DuplicateCardTypeError(id);
    }

    const definition = createCardTypeDefinition({
      id,
      name: request.name,
      color: request.color,
      icon: request.icon,
      learning: request.learning,
      fields: request.fields,
    });
    await this.repo.saveType(definition);
    return definition;
  }
}
