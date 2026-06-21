import { describe, expect, it } from "bun:test";
import { MemoryCardTypeRepository } from "../../../adapters/repositories/MemoryCardTypeRepository";
import { CreateCardTypeInteractor } from "../CreateCardTypeInteractor";
import { DeleteCardTypeInteractor } from "../DeleteCardTypeInteractor";
import { BUILTIN_CARD_TYPES, resolveCardType } from "../../../entities/cardTypeDefinition";
import { BuiltinCardTypeError, DuplicateCardTypeError, InvalidCardTypeNameError } from "../../errors";

describe("Card type registry", () => {
  it("creates and persists a custom type, normalizing its id", async () => {
    const repo = new MemoryCardTypeRepository();
    const create = new CreateCardTypeInteractor(repo);

    const def = await create.execute({ name: "Key Term", color: "#FF0000", learning: "cloze" });

    expect(def.id).toBe("key-term");
    expect(def.builtin).toBe(false);
    expect(def.learning).toBe("cloze");
    const stored = await repo.getTypes();
    expect(stored.map(t => t.id)).toContain("key-term");
  });

  it("rejects malformed and duplicate ids", async () => {
    const repo = new MemoryCardTypeRepository();
    const create = new CreateCardTypeInteractor(repo);

    await expect(create.execute({ name: "  " })).rejects.toBeInstanceOf(InvalidCardTypeNameError);

    await repo.saveType(BUILTIN_CARD_TYPES[0]); // "source"
    await expect(create.execute({ name: "source" })).rejects.toBeInstanceOf(DuplicateCardTypeError);
  });

  it("protects built-in types from deletion but allows custom deletion", async () => {
    const repo = new MemoryCardTypeRepository();
    for (const t of BUILTIN_CARD_TYPES) await repo.saveType(t);
    const create = new CreateCardTypeInteractor(repo);
    const del = new DeleteCardTypeInteractor(repo);

    await expect(del.execute("source")).rejects.toBeInstanceOf(BuiltinCardTypeError);

    const custom = await create.execute({ name: "fact" });
    await del.execute(custom.id);
    expect((await repo.getTypes()).find(t => t.id === custom.id)).toBeUndefined();
  });

  it("resolves a card's type, falling back gracefully for unknown ids", () => {
    expect(resolveCardType("question", BUILTIN_CARD_TYPES).learning).toBe("flashcard");
    expect(resolveCardType("ghost", BUILTIN_CARD_TYPES).name).toBe("ghost");
    expect(resolveCardType(undefined, BUILTIN_CARD_TYPES).id).toBe("unknown");
  });
});
