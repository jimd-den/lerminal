import { describe, expect, it, beforeEach } from "bun:test";
import { ExtractUrlInteractor } from "../ExtractUrlInteractor";
import { MemoryCardRepository } from "../../../adapters/repositories/MemoryCardRepository";
import { ExtractionGateway } from "../../../adapters/gateways/ExtractionGateway";

class MockExtractionGateway implements ExtractionGateway {
  async extractText(url: string): Promise<string> {
    return `# Article Heading\n\nIntroductory paragraph.\n\n## Section 1\n\nDetailed content for section 1.\n\n## Section 2\n\nDetailed content for section 2.`;
  }
}

describe("ExtractUrlInteractor Unit Tests", () => {
  let cardRepo: MemoryCardRepository;
  let interactor: ExtractUrlInteractor;

  beforeEach(() => {
    cardRepo = new MemoryCardRepository();
    interactor = new ExtractUrlInteractor(new MockExtractionGateway(), cardRepo);
  });

  it("should create a single source card containing the full markdown text when importing a URL", async () => {
    const card = await interactor.execute({
      url: "https://example.com/article",
      title: "Sample Article",
      workspaceId: "ws-url-import",
    });

    expect(card).toBeDefined();
    expect(card.type).toBe("source");
    expect(card.title).toBe("Sample Article");
    expect(card.cite).toBe("https://example.com/article");
    expect(card.body).toContain("# Article Heading");
    expect(card.body).toContain("Detailed content for section 2.");

    // Ensure only ONE card is saved in the repository (not auto-chunked into multiple cards/groups)
    const allWorkspaceCards = await cardRepo.getCardsByWorkspace("ws-url-import");
    expect(allWorkspaceCards).toHaveLength(1);
    expect(allWorkspaceCards[0].id).toBe(card.id);
  });
});
