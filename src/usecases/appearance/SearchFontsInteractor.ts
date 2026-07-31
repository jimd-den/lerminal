import {
  FontCategory,
  FontFamilySummary,
  RankedFontFamily,
  rankFontFamilies,
} from "../../entities/fontCatalog";
import { FontGateway } from "../ports/gateways/FontGateway";
import { UseCaseError } from "../errors";

/** Raised when the font catalog can't be fetched, carrying the provider's own reason. */
export class FontCatalogError extends UseCaseError {
  constructor(userMessage: string) {
    super(userMessage);
  }
}

export interface FontSearchQuery {
  text: string;
  category?: FontCategory | null;
  limit?: number;
}

/**
 * # Search Fonts Interactor
 *
 * ## Business Value & Purpose
 * Makes the font picker searchable by *description* rather than by exact name. A user who
 * wants "something like Garamond" or "a handwriting one" cannot type a family name they
 * have never seen, and the old install-by-exact-name box had no answer for them.
 *
 * ## Fetch once, search locally
 * The catalog is fetched from the gateway a single time and then searched in memory. Every
 * keystroke hitting the network would be slow, wasteful, and useless offline; ranking
 * against a cached list is instant and works on a plane. The ranking itself lives in
 * `entities/fontCatalog` — this use case only owns *when* the catalog is loaded.
 */
export class SearchFontsInteractor {
  private catalog: FontFamilySummary[] | null = null;

  constructor(private readonly fontGateway: FontGateway) {}

  /**
   * Ranks the catalog against a query, loading it on first use.
   *
   * @throws {FontCatalogError} when the catalog has never loaded and can't be fetched, so
   *   the UI can say the browser is unavailable and offer install-by-name instead of
   *   showing an empty list that reads as "no fonts matched".
   */
  async execute(query: FontSearchQuery): Promise<RankedFontFamily[]> {
    const catalog = await this.loadCatalog();
    return rankFontFamilies(query.text, catalog, {
      limit: query.limit,
      category: query.category ?? null,
    });
  }

  /** True once the catalog is in memory and searching is instant. */
  isReady(): boolean {
    return this.catalog !== null;
  }

  private async loadCatalog(): Promise<FontFamilySummary[]> {
    if (this.catalog) return this.catalog;

    try {
      this.catalog = await this.fontGateway.listFamilies();
    } catch (err: any) {
      throw new FontCatalogError(
        err?.message ?? "Couldn't load the font catalog"
      );
    }
    return this.catalog;
  }
}
