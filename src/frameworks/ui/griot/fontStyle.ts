/**
 * # Font style merging
 *
 * The pure half of {@link ./Typography}: the rule deciding when the user's chosen face
 * applies to a text element. Kept free of any React Native import so it can be tested
 * directly — importing `react-native` into the test runner is not possible here.
 */

/**
 * True when a style — of any of the shapes RN accepts, including nested arrays and
 * `null` holes — already names a face.
 *
 * A registered style is a plain object in current React Native, so recursing over the
 * structure is enough; anything that is not an object or array (a legacy numeric style
 * id) is reported as unspecified, which errs toward applying the user's font rather than
 * silently ignoring their choice.
 */
export function specifiesFontFamily(style: unknown): boolean {
  if (!style) return false;
  if (Array.isArray(style)) return style.some(specifiesFontFamily);
  if (typeof style !== "object") return false;
  return Boolean((style as { fontFamily?: unknown }).fontFamily);
}

/**
 * The element's final style: the chosen face applied only where none was named.
 *
 * The default is prepended, never appended, so the caller's own style still wins on
 * merge. Appending would make this an override and flip every deliberate `fontMono`
 * label in the app to sans — the opposite of a fix.
 */
export function resolveTextStyle<S>(style: S, sans: string | undefined): S | unknown[] {
  if (!sans || specifiesFontFamily(style)) return style;
  return [{ fontFamily: sans }, style];
}
