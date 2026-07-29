import { FontGateway } from "../../adapters/gateways/FontGateway";
import { FontChoice } from "../../entities/appearance";
import { UseCaseError } from "../errors";

/** Raised when a font can't be resolved or loaded — always with the provider's own reason. */
export class FontInstallError extends UseCaseError {
  constructor(userMessage: string) {
    super(userMessage);
  }
}

/**
 * Loads a resolved font file into the running app. Implemented in the frameworks layer by
 * `expo-font`; abstracted here so the interactor stays testable and the use-case layer
 * never imports a framework module.
 */
export interface FontLoader {
  load(family: string, uri: string): Promise<void>;
}

/**
 * # Install Font Interactor
 *
 * ## Business Value & Purpose
 * The two steps behind "add a font" — resolve the name to a file, then actually load it —
 * as one use case, so a font is only ever recorded in settings *after* it has proven it
 * can render. Recording first and loading later is how you get a settings screen claiming
 * a typeface that shows up as blank rectangles on next launch.
 *
 * Failure is always explicit: every path throws {@link FontInstallError} carrying the
 * provider's own reason, because "couldn't add that font" without a cause leaves the user
 * guessing whether they typo'd the name or lost signal.
 */
export class InstallFontInteractor {
  constructor(
    private readonly fontGateway: FontGateway,
    private readonly loader: FontLoader
  ) {}

  async execute(family: string): Promise<FontChoice> {
    let resolved;
    try {
      resolved = await this.fontGateway.resolveFont(family);
    } catch (err: any) {
      throw new FontInstallError(err?.message ?? "Couldn't find that font");
    }

    try {
      await this.loader.load(resolved.family, resolved.uri);
    } catch (err: any) {
      throw new FontInstallError(
        `Downloaded "${resolved.family}" but couldn't load it: ${err?.message ?? "unknown error"}`
      );
    }

    return { family: resolved.family, source: "google", uri: resolved.uri };
  }
}

/**
 * Re-loads previously installed fonts at startup.
 *
 * Resolves rather than rejects on failure: one unavailable font must not stop the app from
 * opening. A font that fails here simply isn't registered, and text falls back to the
 * system face — degraded, legible, and honest.
 */
export async function reloadInstalledFonts(
  fonts: FontChoice[],
  loader: FontLoader
): Promise<FontChoice[]> {
  const loaded: FontChoice[] = [];
  for (const font of fonts) {
    if (font.source !== "google" || !font.uri) continue;
    try {
      await loader.load(font.family, font.uri);
      loaded.push(font);
    } catch {
      // Intentionally swallowed — see the note above.
    }
  }
  return loaded;
}
