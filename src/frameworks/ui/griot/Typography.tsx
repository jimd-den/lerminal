import React, { createContext, useContext, useMemo } from "react";
import {
  Text as RNText,
  TextInput as RNTextInput,
  TextProps,
  TextInputProps,
} from "react-native";
import { GriotTheme } from "./theme";
import { resolveTextStyle } from "./fontStyle";

/**
 * # Typography — making "choose a font" mean the whole app
 *
 * ## The bug this exists to fix
 * Picking a typeface changed almost nothing. `theme.fontMono` was threaded by hand into
 * roughly two-thirds of the app's `<Text>` elements, and `theme.fontSans` into barely a
 * dozen — every other label, body, button and input silently kept the platform font. So a
 * user who installed a font saw a handful of labels change and concluded the setting was
 * broken. It was: the setting was correct and the wiring was incomplete.
 *
 * Chasing the remaining hundred call sites by hand would fix today's misses and guarantee
 * tomorrow's, because the next `<Text>` anyone writes would default to the platform font
 * again. So the default moves into the type itself.
 *
 * ## How
 * {@link Text} and {@link TextInput} stand in for React Native's, applying the user's
 * chosen face as a *default* that any explicit `fontFamily` in the element's own style
 * still overrides. Every existing `fontFamily: theme.fontMono` therefore keeps winning
 * exactly as before, and everything that specified nothing — which was the whole bug —
 * now follows the sans choice rather than the platform's.
 *
 * ## Why sans is the default rather than mono
 * It preserves what the app looks like today. Unstyled text was rendering in the platform
 * UI face, which is the role `fontSans` names; defaulting to mono would restyle the entire
 * app the first time this shipped, which is a redesign, not a bug fix.
 */

interface FontContextValue {
  mono: string;
  sans: string | undefined;
}

/**
 * Empty by default so a component rendered outside the provider (a test, a screenshot
 * harness) keeps the platform font instead of throwing.
 */
const FontContext = createContext<FontContextValue>({
  mono: undefined as unknown as string,
  sans: undefined,
});

export function FontProvider({
  theme,
  children,
}: {
  theme: GriotTheme;
  children: React.ReactNode;
}) {
  const value = useMemo(
    () => ({ mono: theme.fontMono, sans: theme.fontSans }),
    [theme.fontMono, theme.fontSans]
  );
  return <FontContext.Provider value={value}>{children}</FontContext.Provider>;
}

/** The resolved faces, for the rare caller that needs the family name itself. */
export function useAppFonts(): FontContextValue {
  return useContext(FontContext);
}

/** Stand-ins for React Native's. The merge rule itself lives in `fontStyle.ts`. */
export function Text({ style, ...props }: TextProps) {
  const { sans } = useAppFonts();
  return <RNText {...props} style={resolveTextStyle(style, sans) as TextProps["style"]} />;
}

export function TextInput({ style, ...props }: TextInputProps) {
  const { sans } = useAppFonts();
  return (
    <RNTextInput
      {...props}
      style={resolveTextStyle(style, sans) as TextInputProps["style"]}
    />
  );
}
