import { describe, expect, it } from "bun:test";
import { SaveResearchResultAsSourceInteractor } from "../SaveResearchResultAsSourceInteractor";
import { MemoryCardRepository } from "../../../adapters/repositories/MemoryCardRepository";
import { normalizeSearchResults } from "../../../entities/research";

function makeResult() {
  return normalizeSearchResults(
    [{ title: "Official Guide", url: "https://docs.example.com/guide", snippet: "the official guide says X" }],
    "topic"
  )[0];
}

describe("SaveResearchResultAsSourceInteractor", () => {
  it("persists a source card without calling any gateway or requiring an API key", async () => {
    const cardRepo = new MemoryCardRepository();
    const interactor = new SaveResearchResultAsSourceInteractor(cardRepo);

    const card = await interactor.execute({ result: makeResult(), workspaceId: "w", parentId: null });

    expect(card.type).toBe("source");
    expect(card.role).toBe("source");
    expect(card.title).toBe("Official Guide");
    expect(card.cite).toBe("https://docs.example.com/guide");

    const persisted = await cardRepo.getCardsByWorkspace("w");
    expect(persisted.length).toBe(1);
    expect(persisted[0].id).toBe(card.id);
  });

  it("uses the snippet as body and records provenance mode 'search' when no extraction has happened", async () => {
    const cardRepo = new MemoryCardRepository();
    const interactor = new SaveResearchResultAsSourceInteractor(cardRepo);

    const card = await interactor.execute({ result: makeResult(), workspaceId: "w", parentId: null });

    expect(card.body).toBe("the official guide says X");
    expect(card.provenance?.mode).toBe("search");
    expect(card.provenance?.sourceUrls).toEqual(["https://docs.example.com/guide"]);
  });

  it("prefers the extracted full text and records provenance mode 'extraction' when available", async () => {
    const cardRepo = new MemoryCardRepository();
    const interactor = new SaveResearchResultAsSourceInteractor(cardRepo);
    const extracted = { ...makeResult(), extractedText: "The full extracted article text." };

    const card = await interactor.execute({ result: extracted, workspaceId: "w", parentId: null });

    expect(card.body).toBe("The full extracted article text.");
    expect(card.provenance?.mode).toBe("extraction");
  });

  it("nests the saved source under the given parent group", async () => {
    const cardRepo = new MemoryCardRepository();
    const interactor = new SaveResearchResultAsSourceInteractor(cardRepo);

    const card = await interactor.execute({ result: makeResult(), workspaceId: "w", parentId: "group-1" });

    expect(card.parentId).toBe("group-1");
  });
});
