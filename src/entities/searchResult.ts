/**
 * # Search Result
 *
 * ## Business Value & Purpose
 * The raw shape of a web hit before the app decides anything about it. It lives in the
 * domain rather than beside the search port because `research.ts` reasons about these
 * hits directly — keeping it here lets the domain stay ignorant of who fetched them
 * (DuckDuckGo today, anything else tomorrow).
 */
export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}
