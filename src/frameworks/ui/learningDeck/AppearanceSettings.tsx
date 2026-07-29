import React, { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  AppState,
  LearnimalController,
} from "../../../adapters/presenters/LearnimalController";
import {
  FontChoice,
  PALETTES,
  SYSTEM_MONO,
  SYSTEM_SANS,
} from "../../../entities/appearance";
import { LearningTheme, Structure, TypeScale } from "./theme";

/**
 * # Appearance Settings
 *
 * ## Business Value & Purpose
 * Where the console becomes *yours*: pick a palette, override the accent, and install a
 * typeface straight from Google Fonts by name. No account, no build step, no file
 * picker — type "JetBrains Mono", tap install, and the app is wearing it.
 *
 * ## The one rule the UI enforces
 * You choose the instrument, not what its lights mean. Palettes are applied whole rather
 * than as a row of colour pickers, so no combination can make a warning look like a
 * heading — customisation stops exactly where legibility of *state* begins.
 */
export function AppearanceSettingsSection({
  controller,
  state,
  theme,
}: {
  controller: LearnimalController;
  state: AppState;
  theme: LearningTheme;
}) {
  const [fontQuery, setFontQuery] = useState("");
  const appearance = state.appearance;
  const installed = appearance.installedFonts ?? [];

  const monoChoices: FontChoice[] = [SYSTEM_MONO, ...installed];
  const sansChoices: FontChoice[] = [SYSTEM_SANS, ...installed];

  const activeMono = appearance.monoFont?.family ?? SYSTEM_MONO.family;
  const activeSans = appearance.sansFont?.family ?? SYSTEM_SANS.family;

  return (
    <View>
      <SectionHeading theme={theme}>PALETTE</SectionHeading>
      {PALETTES.map(palette => {
        const active = (appearance.paletteId ?? "console") === palette.id;
        return (
          <Pressable
            key={palette.id}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => controller.setPalette(palette.id)}
            style={({ pressed }) => [
              styles.paletteRow,
              {
                borderColor: active ? theme.accent : theme.line,
                backgroundColor: active ? theme.accentSoft : theme.panelStrong,
              },
              pressed && styles.pressed,
            ]}
          >
            {/* A live swatch of the palette itself — the honest preview. */}
            <View style={[styles.swatch, { backgroundColor: palette.background, borderColor: palette.line }]}>
              <View style={[styles.swatchBar, { backgroundColor: palette.accent }]} />
              <View style={[styles.swatchBar, { backgroundColor: palette.text, width: 16 }]} />
              <View style={[styles.swatchBar, { backgroundColor: palette.textMuted, width: 10 }]} />
            </View>
            <View style={styles.paletteCopy}>
              <Text style={[styles.paletteLabel, { color: theme.text, fontFamily: theme.fontMono }]}>
                {palette.label}
              </Text>
              <Text style={[styles.paletteProvenance, { color: theme.textMuted }]}>
                {palette.provenance}
              </Text>
            </View>
            {active ? (
              <Text style={[styles.check, { color: theme.accent, fontFamily: theme.fontMono }]}>
                ON
              </Text>
            ) : null}
          </Pressable>
        );
      })}

      <SectionHeading theme={theme}>TYPEFACE</SectionHeading>
      <Text style={[styles.help, { color: theme.textMuted }]}>
        Install any family from Google Fonts by name. Monospace carries commands and
        system labels; the reading face carries prose.
      </Text>

      <View style={styles.installRow}>
        <TextInput
          value={fontQuery}
          onChangeText={setFontQuery}
          placeholder="e.g. JetBrains Mono"
          placeholderTextColor={theme.textFaint}
          autoCapitalize="words"
          autoCorrect={false}
          onSubmitEditing={() => void install()}
          style={[
            styles.installInput,
            { color: theme.text, borderColor: theme.line, fontFamily: theme.fontMono },
          ]}
        />
        <Pressable
          accessibilityRole="button"
          disabled={!fontQuery.trim() || state.isInstallingFont}
          onPress={() => void install()}
          style={({ pressed }) => [
            styles.installButton,
            {
              backgroundColor: theme.accent,
              opacity: !fontQuery.trim() || state.isInstallingFont ? 0.4 : 1,
            },
            pressed && styles.pressed,
          ]}
        >
          {state.isInstallingFont ? (
            <ActivityIndicator color={theme.accentInk} />
          ) : (
            <Text style={[styles.installText, { color: theme.accentInk, fontFamily: theme.fontMono }]}>
              INSTALL
            </Text>
          )}
        </Pressable>
      </View>

      <FontPicker
        label="MONOSPACE"
        choices={monoChoices}
        activeFamily={activeMono}
        theme={theme}
        onPick={font => controller.setFont("mono", font)}
      />
      <FontPicker
        label="READING FACE"
        choices={sansChoices}
        activeFamily={activeSans}
        theme={theme}
        onPick={font => controller.setFont("sans", font)}
      />
    </View>
  );

  async function install() {
    const ok = await controller.installFont(fontQuery);
    if (ok) setFontQuery("");
  }
}

/**
 * A row of installable faces. Each chip renders *in its own font*, so the choice is made
 * by looking rather than by reading a name — the preview is the control.
 */
function FontPicker({
  label,
  choices,
  activeFamily,
  theme,
  onPick,
}: {
  label: string;
  choices: FontChoice[];
  activeFamily: string;
  theme: LearningTheme;
  onPick: (font: FontChoice) => void;
}) {
  return (
    <View style={styles.pickerBlock}>
      <Text style={[styles.pickerLabel, { color: theme.textFaint, fontFamily: theme.fontMono }]}>
        {label}
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pickerRow}>
        {choices.map(font => {
          const active = font.family === activeFamily;
          return (
            <Pressable
              key={font.family}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => onPick(font)}
              style={({ pressed }) => [
                styles.fontChip,
                {
                  borderColor: active ? theme.accent : theme.line,
                  backgroundColor: active ? theme.accentSoft : theme.panelMuted,
                },
                pressed && styles.pressed,
              ]}
            >
              <Text
                numberOfLines={1}
                style={[
                  styles.fontChipText,
                  {
                    color: active ? theme.accent : theme.text,
                    // System entries have no real family name to apply.
                    fontFamily: font.source === "google" ? font.family : undefined,
                  },
                ]}
              >
                {font.source === "system" ? "System default" : font.family}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function SectionHeading({ children, theme }: { children: React.ReactNode; theme: LearningTheme }) {
  return (
    <Text style={[styles.heading, { color: theme.textMuted, fontFamily: theme.fontMono }]}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.7 },
  heading: {
    fontSize: TypeScale.label,
    fontWeight: "800",
    letterSpacing: 1.4,
    marginTop: 26,
    marginBottom: 10,
  },
  help: { fontSize: TypeScale.meta, lineHeight: 19, marginBottom: 12 },
  paletteRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: Structure.tapLarge,
    borderWidth: 1,
    borderRadius: Structure.radiusControl,
    padding: 12,
    marginBottom: 8,
  },
  swatch: {
    width: 46,
    height: 40,
    borderRadius: Structure.radiusElbow,
    borderWidth: 1,
    justifyContent: "center",
    gap: 3,
    paddingHorizontal: 6,
  },
  swatchBar: { height: 4, width: 24, borderRadius: 2 },
  paletteCopy: { flex: 1 },
  paletteLabel: { fontSize: TypeScale.body, fontWeight: "800" },
  paletteProvenance: { fontSize: TypeScale.label, lineHeight: 16, marginTop: 2 },
  check: { fontSize: TypeScale.label, fontWeight: "900", letterSpacing: 1 },
  installRow: { flexDirection: "row", gap: 8 },
  installInput: {
    flex: 1,
    minHeight: Structure.tap,
    borderWidth: 1,
    borderRadius: Structure.radiusControl,
    paddingHorizontal: 12,
    fontSize: TypeScale.body,
  },
  installButton: {
    minHeight: Structure.tap,
    minWidth: 96,
    borderRadius: Structure.radiusControl,
    alignItems: "center",
    justifyContent: "center",
  },
  installText: { fontSize: TypeScale.label, fontWeight: "900", letterSpacing: 1 },
  pickerBlock: { marginTop: 16 },
  pickerLabel: { fontSize: TypeScale.label, fontWeight: "800", letterSpacing: 1.2, marginBottom: 8 },
  pickerRow: { gap: 8, paddingRight: 8 },
  fontChip: {
    minHeight: Structure.tap,
    maxWidth: 200,
    borderWidth: 1,
    borderRadius: Structure.radiusControl,
    paddingHorizontal: 14,
    justifyContent: "center",
  },
  fontChipText: { fontSize: TypeScale.body, fontWeight: "700" },
});
