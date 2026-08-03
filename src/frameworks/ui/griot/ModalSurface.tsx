import React from "react";
import { StyleSheet, ViewStyle } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import type { Edge } from "react-native-safe-area-context";
import { GriotTheme } from "./theme";

/**
 * # Modal Surface — the page a full-screen modal draws on
 *
 * ## Business Value & Purpose
 * A full-screen `Modal` is its own window. Two things the app provides everywhere else
 * therefore stop applying inside one, and both were being re-solved (or forgotten) per
 * sheet:
 *
 * 1. **The background.** `MainLayout`'s themed root sits behind a routed screen; a modal
 *    has nothing behind it, so without an explicit background it falls through to the
 *    platform default — white, in a dark-themed app.
 * 2. **The insets.** Android has been edge-to-edge since Expo SDK 54, so a modal window
 *    is laid out under the status bar, the navigation bar, and — the visible one — the
 *    camera cutout. Content starts at y=0 and the first row of text lands behind the
 *    punch-hole.
 *
 * The nested {@link SafeAreaProvider} is deliberate and is what `react-native-safe-area-context`
 * asks for around modal content: the outer provider measured the *app* window, and this
 * one re-measures inside the modal's own.
 *
 * Sheets that deliberately float over the app rather than replacing it (the Ask GRIOT
 * conversation, the preflight) do not use this — they are transparent, they draw their own
 * scrim, and they anchor to one edge. This is for the opaque, full-screen ones.
 */
export function ModalSurface({
  theme,
  children,
  style,
  edges = ["top", "left", "right", "bottom"],
}: {
  theme: GriotTheme;
  children: React.ReactNode;
  style?: ViewStyle;
  /**
   * Which insets to honour. The default covers all four, which is right for a sheet that
   * owns the whole screen; a sheet with its own keyboard handling at the bottom may want
   * to drop `"bottom"` and let that take over.
   */
  edges?: readonly Edge[];
}) {
  return (
    <SafeAreaProvider>
      <SafeAreaView
        style={[styles.surface, { backgroundColor: theme.background }, style]}
        edges={edges}
      >
        {children}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  surface: { flex: 1 },
});
