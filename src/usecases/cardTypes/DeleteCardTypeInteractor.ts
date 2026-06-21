import { CardTypeRepository } from "../../adapters/repositories/CardTypeRepository";
import { BuiltinCardTypeError } from "../errors";

/**
 * # Delete Card Type Interactor
 *
 * ## Business Value & Purpose
 * Removes a user-defined card type. Built-in types are protected — they can be
 * restyled but never deleted — so the seeded vocabulary every card may reference
 * always resolves.
 */
export class DeleteCardTypeInteractor {
  constructor(private readonly repo: CardTypeRepository) {}

  /**
   * @throws {BuiltinCardTypeError} when the target type is a seeded built-in.
   */
  async execute(id: string): Promise<void> {
    const types = await this.repo.getTypes();
    const target = types.find(t => t.id === id);
    if (target?.builtin) {
      throw new BuiltinCardTypeError();
    }
    await this.repo.deleteType(id);
  }
}
