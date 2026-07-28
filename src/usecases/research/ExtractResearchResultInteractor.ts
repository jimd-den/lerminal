import { ExtractionGateway } from "../../adapters/gateways/ExtractionGateway";
import { ResearchResult } from "../../entities/research";
import { ResearchExtractionFailedError } from "../errors";

/**
 * # Extract Research Result Interactor
 *
 * ## Business Value & Purpose
 * Turns "Extract" on a kept source candidate into a real fetch via
 * {@link ExtractionGateway}, returning a new {@link ResearchResult} with `extractedText`
 * set. `ExtractionGateway` implementations throw on failure (unlike the search gateway),
 * so a blocked/failed extraction surfaces as a clear, catchable error here rather than
 * silently leaving the candidate on just its snippet.
 */
export class ExtractResearchResultInteractor {
  constructor(private readonly extractionGateway: ExtractionGateway) {}

  async execute(result: ResearchResult): Promise<ResearchResult> {
    let text: string;
    try {
      text = await this.extractionGateway.extractText(result.url);
    } catch (err: any) {
      throw new ResearchExtractionFailedError(err?.message);
    }
    return { ...result, extractedText: text };
  }
}
