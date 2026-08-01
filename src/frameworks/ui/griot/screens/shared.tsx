import React from "react";
import { Pressable, Text, View } from "react-native";
import { Card } from "../../../../entities/card";
import { GriotTheme } from "../theme";
import { styles } from "./screenStyles";

/**
 * # Shared Screen Parts
 *
 * ## Business Value & Purpose
 * The small pieces more than one deck screen needs: a command slab, the context panel,
 * an empty readout, and the pipeline-argument escaper. They live together because each
 * is too small to justify a file and too shared to belong to any one screen.
 */
export function CommandSlab({
  title,
  code,
  theme,
  onPress,
}: {
  title: string;
  code: string;
  theme: GriotTheme;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.commandSlab,
        { backgroundColor: theme.panelStrong, borderColor: theme.line },
        pressed && styles.pressed,
      ]}
    >
      <Text
        style={[
          styles.commandCode,
          { color: theme.accent, fontFamily: theme.fontMono },
        ]}
      >
        {code}
      </Text>
      <Text
        style={[
          styles.commandTitle,
          { color: theme.text, fontFamily: theme.fontMono },
        ]}
      >
        {title}
      </Text>
      <Text
        style={[
          styles.commandArrow,
          { color: theme.textFaint, fontFamily: theme.fontMono },
        ]}
      >
        &gt;
      </Text>
    </Pressable>
  );
}

export function ContextPanel({
  title,
  theme,
  children,
}: {
  title: string;
  theme: GriotTheme;
  children: React.ReactNode;
}) {
  return (
    <View
      style={[
        styles.contextPanel,
        { backgroundColor: theme.panelMuted, borderColor: theme.accent },
      ]}
    >
      <Text
        style={[
          styles.contextTitle,
          { color: theme.accent, fontFamily: theme.fontMono },
        ]}
      >
        {title} // VALID ROUTES
      </Text>
      {children}
    </View>
  );
}

export function EmptyReadout({ text, theme }: { text: string; theme: GriotTheme }) {
  return (
    <View
      style={[
        styles.empty,
        { backgroundColor: theme.panel, borderColor: theme.line },
      ]}
    >
      <Text
        style={[
          styles.emptyCode,
          { color: theme.textFaint, fontFamily: theme.fontMono },
        ]}
      >
        -- NO SIGNAL --
      </Text>
      <Text style={[styles.emptyText, { color: theme.textMuted }]}>{text}</Text>
    </View>
  );
}

export function encodeCommandArg(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/"/g, '\\"').trim();
}

