/**
 * # Brand
 *
 * ## Business Value & Purpose
 * The app's name, expansion, and tagline in one place, so a rename is a one-line edit
 * rather than an archaeology expedition through forty components. The previous rename
 * touched 158 references across 40 files precisely because these strings were inlined
 * wherever they happened to be needed.
 *
 * ## Why a griot
 * A griot is a West African keeper of record — someone who holds a lineage of knowledge
 * and can recount where each part of it came from. That is the app's actual promise:
 * not that it knows things, but that it can always say where something came from and who
 * said it. The recursive expansion is a nod to the GNU tradition.
 */

export const BRAND_NAME = "GRIOT";

/** The recursive expansion, in the GNU tradition. */
export const BRAND_EXPANSION = "GRIOT Recursively Inquires Over Text";

export const BRAND_TAGLINE =
  "A personal learning shell for evidence, practice, and proof.";

/**
 * Builds the `SystemHeader` eyebrow for a screen, e.g. `GRIOT // CAPTURE`.
 *
 * Centralised so every screen's system label is spelled and spaced identically — the
 * kind of consistency that reads as machined rather than assembled.
 */
export function systemLabel(section: string): string {
  return `${BRAND_NAME} // ${section.toUpperCase()}`;
}
