import { describe, expect, it } from "bun:test";
import { ExtractResearchResultInteractor } from "../ExtractResearchResultInteractor";
import { ExtractionGateway } from "../../../adapters/gateways/ExtractionGateway";
import { normalizeSearchResults } from "../../../entities/research";
import { ResearchExtractionFailedError } from "../../errors";

class FakeExtractionGateway implements ExtractionGateway {
  constructor(private impl: (url: string) => Promise<string>) {}
  extractText(url: string): Promise<string> {
    return this.impl(url);
  }
}

function makeResult() {
  return normalizeSearchResults(
    [{ title: "Doc", url: "https://docs.example.com/x", snippet: "short snippet" }],
    "query"
  )[0];
}

describe("ExtractResearchResultInteractor", () => {
  it("returns the candidate with extractedText populated on success", async () => {
    const gateway = new FakeExtractionGateway(async () => "Full extracted article text.");
    const interactor = new ExtractResearchResultInteractor(gateway);
    const result = makeResult();

    const extracted = await interactor.execute(result);

    expect(extracted.extractedText).toBe("Full extracted article text.");
    // The original candidate is left untouched (pure/immutable update).
    expect(result.extractedText).toBeUndefined();
  });

  it("throws ResearchExtractionFailedError when extraction is blocked/fails", async () => {
    const gateway = new FakeExtractionGateway(async () => {
      throw new Error("403 blocked");
    });
    const interactor = new ExtractResearchResultInteractor(gateway);

    await expect(interactor.execute(makeResult())).rejects.toBeInstanceOf(ResearchExtractionFailedError);
  });
});
