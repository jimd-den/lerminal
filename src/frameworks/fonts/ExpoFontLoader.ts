import * as Font from "expo-font";
import { FontLoader } from "../../usecases/appearance/InstallFontInteractor";

/**
 * # Expo Font Loader
 *
 * ## Business Value & Purpose
 * The frameworks-layer half of font installation: hands a remote font file to `expo-font`,
 * which downloads, caches, and registers it under the family name so `fontFamily` works
 * from that point on. Caching is Expo's, so a font installed once loads from disk on
 * subsequent launches rather than re-downloading.
 */
export class ExpoFontLoader implements FontLoader {
  async load(family: string, uri: string): Promise<void> {
    await Font.loadAsync({ [family]: uri });
  }
}
