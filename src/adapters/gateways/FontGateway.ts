/**
 * # Font Gateway Port
 *
 * ## Business Value & Purpose
 * Resolving "the user typed *JetBrains Mono*" into "here is a font file to load" is a
 * network concern, so it sits behind a port like every other outside-world dependency.
 * Keeping it abstract means the install use case is testable without hitting Google, and
 * a future local-font or self-hosted source is a new implementation rather than a rewrite.
 */

export interface ResolvedFontFile {
  /** The canonical family name as the provider spells it. */
  family: string;
  /** A direct URL to a font file the platform can load. */
  uri: string;
}

export interface FontGateway {
  /**
   * Resolves a family name to a loadable font file.
   *
   * @throws when the family doesn't exist or no usable file is offered — callers must
   *   surface that plainly rather than silently falling back to a different typeface.
   */
  resolveFont(family: string): Promise<ResolvedFontFile>;
}
