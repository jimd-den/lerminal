import { SearchResult } from "../../../entities/searchResult";

export type { SearchResult };

/**
 * # Search Gateway Port
 *
 * ## Business Value & Purpose
 * The application's only route to the open web for candidate sources. Implementations
 * (DuckDuckGo today) live in `frameworks/network`; use cases depend on this shape alone.
 */
export interface SearchGateway {
  search(query: string): Promise<SearchResult[]>;
}
