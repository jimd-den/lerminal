import { FontChoice } from "../../entities/appearance";
import { InstallFontInteractor } from "./InstallFontInteractor";

/**
 * # Preview Font Interactor
 *
 * ## Business Value & Purpose
 * Lets the font browser render each search result *in its own typeface*. Choosing a font
 * by reading its name in the system face is choosing blind — the whole point of a font is
 * how it looks, so the preview has to be the real thing.
 *
 * ## Why this is not just "install"
 * Rendering a preview requires the same download-and-register work as installing, but it
 * must have none of the consequences: previewing thirty families while scrolling must not
 * write thirty entries into the user's settings. This use case therefore performs only the
 * runtime half — the caller decides, separately and explicitly, whether a family is
 * *kept*. That separation is what keeps "I looked at it" from becoming "I chose it".
 *
 * ## Bounded and idempotent
 * Requests are deduplicated by family and the results memoized, so scrolling a list back
 * and forth downloads each face once. Failures are memoized as failures too: a family
 * that can't render should fall back to the system face quietly rather than retry on
 * every re-render.
 */
export class PreviewFontInteractor {
  /**
   * Cached per family, holding the in-flight promise rather than the result so that
   * several rows mounting at once share one download.
   */
  private readonly previews = new Map<string, Promise<FontChoice | null>>();

  constructor(private readonly installer: InstallFontInteractor) {}

  /**
   * Loads a family for display and returns it, or `null` when it can't be rendered.
   *
   * Never throws: a preview is a nicety, and a broken one must degrade to the system face
   * rather than surface an error over a list the user is merely browsing.
   */
  async execute(family: string): Promise<FontChoice | null> {
    const key = family.trim().toLowerCase();
    if (!key) return null;

    const cached = this.previews.get(key);
    if (cached) return cached;

    const pending = this.installer
      .execute(family)
      .catch(() => null);

    this.previews.set(key, pending);
    return pending;
  }

  /** True when the family is already loaded and safe to render with. */
  isLoaded(family: string): boolean {
    return this.previews.has(family.trim().toLowerCase());
  }
}
