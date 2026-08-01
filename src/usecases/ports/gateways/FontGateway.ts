import { FontFamilySummary, FontFormat } from "../../../entities/fontCatalog";

/**
 * # Font Gateway Port
 *
 * ## Business Value & Purpose
 * Turning "the user wants something like *Garamond*" into "here is a file this platform
 * can render" is entirely an outside-world concern, so it sits behind a port like every
 * other one. Keeping it abstract means search and install are testable without hitting
 * Google, and a future local-font or self-hosted source is a new implementation rather
 * than a rewrite.
 */

export interface ResolvedFontFile {
  /** The canonical family name as the provider spells it. */
  family: string;
  /** A direct URL to a font file the platform can load. */
  uri: string;
  /**
   * The container format actually served. Recorded rather than assumed, because a file
   * the platform can't render is the failure this whole port exists to prevent.
   */
  format: FontFormat;
}

export interface ResolveFontOptions {
  /**
   * Formats the caller can render, best first. The gateway must return one of these or
   * fail — it must never fall back to a format outside the list, since an unrenderable
   * font installs successfully and then shows up as blank rectangles.
   */
  acceptedFormats: FontFormat[];
}

export interface FontGateway {
  /**
   * Lists every family the provider offers, for local search and browsing.
   *
   * @throws when the catalog can't be fetched — callers should degrade to name-only
   *   install rather than presenting an empty catalog as "no fonts exist".
   */
  listFamilies(): Promise<FontFamilySummary[]>;

  /**
   * Resolves a family name to a loadable font file in one of the accepted formats.
   *
   * @throws when the family doesn't exist or no acceptable format is offered — callers
   *   must surface that plainly rather than silently falling back to a different typeface.
   */
  resolveFont(family: string, options: ResolveFontOptions): Promise<ResolvedFontFile>;
}
