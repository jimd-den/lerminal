import React, { useEffect, useState } from "react";
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
  GriotController,
} from "../../../adapters/presenters/GriotController";
import {
  FontChoice,
  PALETTES,
  SYSTEM_MONO,
  SYSTEM_SANS,
} from "../../../entities/appearance";
import { FONT_CATEGORIES } from "../../../entities/fontCatalog";
import { GriotTheme, Structure, TypeScale } from "./theme";

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
  controller: GriotController;
  state: AppState;
  theme: GriotTheme;
}) {
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
        Search Google Fonts and tap a sample to install it. Every result is shown in its
        own typeface, so you can choose by eye rather than by name. Monospace carries
        commands and system labels; the reading face carries prose.
      </Text>

      <FontBrowser controller={controller} state={state} theme={theme} />

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
}

/** How many results are shown — and therefore how many faces get downloaded per search. */
const VISIBLE_RESULTS = 10;

/** Long enough that typing a word is one search, short enough to feel immediate. */
const SEARCH_DEBOUNCE_MS = 300;

/** The pangram-ish sample line. Mixes cases, digits, and the letters that differ most. */
const SPECIMEN = "Handgloves 0123";

/**
 * # Font Browser
 *
 * ## Business Value & Purpose
 * The answer to "I don't know what the font is called." Fuzzy search over the whole Google
 * Fonts catalog, filtered by category, with every row rendered *in the face it offers* —
 * so the control and the preview are the same object and the choice is made by looking.
 *
 * ## Why previewing is not installing
 * Each visible row downloads and registers its family so it can render, but only a tap
 * writes anything to settings. Scrolling past a font must not adopt it. That boundary is
 * enforced in the use-case layer; this component only asks for previews of what it shows,
 * which is also what keeps a search from pulling down two thousand typefaces.
 */
function FontBrowser({
  controller,
  state,
  theme,
}: {
  controller: GriotController;
  state: AppState;
  theme: GriotTheme;
}) {
  const [draft, setDraft] = useState(state.fontQuery);

  // Debounced so a search runs per word, not per keystroke. The controller owns the
  // committed query; this only holds what the user is still typing.
  useEffect(() => {
    if (draft === state.fontQuery) return;
    const timer = setTimeout(() => void controller.searchFonts(draft), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [draft]);

  // Open the browser on the popular families rather than on an empty box.
  useEffect(() => {
    if (state.fontResults.length === 0 && !state.fontCatalogError) {
      void controller.searchFonts(state.fontQuery, state.fontCategory);
    }
  }, []);

  const visible = state.fontResults.slice(0, VISIBLE_RESULTS);

  // Only the rows actually on screen are fetched — see the note on previewing above.
  useEffect(() => {
    for (const result of visible) void controller.previewFont(result.summary.family);
  }, [visible.map(result => result.summary.family).join("|")]);

  const installedFamilies = new Set(
    (state.appearance.installedFonts ?? []).map(font => font.family)
  );

  return (
    <View>
      <View style={styles.installRow}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Search fonts — try 'mono', 'garamond', 'handwriting'"
          placeholderTextColor={theme.textFaint}
          autoCapitalize="none"
          autoCorrect={false}
          style={[
            styles.installInput,
            { color: theme.text, borderColor: theme.line, fontFamily: theme.fontMono },
          ]}
        />
        {state.isSearchingFonts || state.isInstallingFont ? (
          <View style={styles.searchSpinner}>
            <ActivityIndicator color={theme.accent} />
          </View>
        ) : null}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.pickerRow}
        style={styles.categoryRow}
      >
        {[null, ...FONT_CATEGORIES].map(category => {
          const active = state.fontCategory === category;
          return (
            <Pressable
              key={category ?? "all"}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => void controller.setFontCategory(category)}
              style={({ pressed }) => [
                styles.categoryChip,
                {
                  borderColor: active ? theme.accent : theme.line,
                  backgroundColor: active ? theme.accentSoft : theme.panelMuted,
                },
                pressed && styles.pressed,
              ]}
            >
              <Text
                style={[
                  styles.categoryText,
                  {
                    color: active ? theme.accent : theme.textMuted,
                    fontFamily: theme.fontMono,
                  },
                ]}
              >
                {(category ?? "All").toUpperCase()}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {state.fontCatalogError ? (
        // The catalog is unavailable — say so, rather than showing an empty list that
        // would read as "no font matches your search".
        <View style={[styles.notice, { borderColor: theme.warning, backgroundColor: theme.panelMuted }]}>
          <Text style={[styles.noticeLabel, { color: theme.warning, fontFamily: theme.fontMono }]}>
            BROWSER UNAVAILABLE
          </Text>
          <Text style={[styles.noticeBody, { color: theme.textMuted }]}>
            {state.fontCatalogError}. You can still install a family by typing its exact
            name and tapping Install.
          </Text>
          <Pressable
            accessibilityRole="button"
            disabled={!draft.trim() || state.isInstallingFont}
            onPress={() => void controller.installFont(draft)}
            style={({ pressed }) => [
              styles.installButton,
              styles.noticeButton,
              {
                backgroundColor: theme.accent,
                opacity: !draft.trim() || state.isInstallingFont ? 0.4 : 1,
              },
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.installText, { color: theme.accentInk, fontFamily: theme.fontMono }]}>
              INSTALL BY NAME
            </Text>
          </Pressable>
        </View>
      ) : null}

      {!state.fontCatalogError && visible.length === 0 && !state.isSearchingFonts ? (
        <Text style={[styles.help, { color: theme.textMuted }]}>
          No family matches “{state.fontQuery}”.
        </Text>
      ) : null}

      {visible.map(result => {
        const { family, category, designers } = result.summary;
        const previewReady = state.previewedFontFamilies.includes(family);
        const installed = installedFamilies.has(family);
        return (
          <Pressable
            key={family}
            accessibilityRole="button"
            accessibilityLabel={`Install ${family}`}
            disabled={state.isInstallingFont}
            onPress={() => void controller.installFont(family)}
            style={({ pressed }) => [
              styles.resultRow,
              {
                borderColor: installed ? theme.accent : theme.line,
                backgroundColor: installed ? theme.accentSoft : theme.panelStrong,
              },
              pressed && styles.pressed,
            ]}
          >
            <Text
              numberOfLines={1}
              style={[
                styles.specimen,
                {
                  color: theme.text,
                  // Only claim the real face once it has actually loaded; until then the
                  // system face is the honest thing to show.
                  fontFamily: previewReady ? family : undefined,
                },
              ]}
            >
              {SPECIMEN}
            </Text>
            <View style={styles.resultMeta}>
              <Text
                numberOfLines={1}
                style={[styles.resultName, { color: theme.textMuted, fontFamily: theme.fontMono }]}
              >
                {family}
              </Text>
              <Text style={[styles.resultCategory, { color: theme.textFaint, fontFamily: theme.fontMono }]}>
                {installed ? "INSTALLED" : category.toUpperCase()}
              </Text>
            </View>
            {designers.length > 0 ? (
              <Text numberOfLines={1} style={[styles.resultDesigner, { color: theme.textFaint }]}>
                {designers.join(", ")}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
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
  theme: GriotTheme;
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

function SectionHeading({ children, theme }: { children: React.ReactNode; theme: GriotTheme }) {
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
  searchSpinner: {
    minHeight: Structure.tap,
    minWidth: Structure.tap,
    alignItems: "center",
    justifyContent: "center",
  },
  categoryRow: { marginTop: 10 },
  categoryChip: {
    minHeight: 34,
    borderWidth: 1,
    borderRadius: Structure.radiusControl,
    paddingHorizontal: 12,
    justifyContent: "center",
  },
  categoryText: { fontSize: TypeScale.label, fontWeight: "800", letterSpacing: 1 },
  notice: {
    borderWidth: 1,
    borderRadius: Structure.radiusControl,
    padding: 12,
    marginTop: 12,
    gap: 6,
  },
  noticeLabel: { fontSize: TypeScale.label, fontWeight: "900", letterSpacing: 1.2 },
  noticeBody: { fontSize: TypeScale.meta, lineHeight: 18 },
  noticeButton: { marginTop: 6, alignSelf: "flex-start", paddingHorizontal: 16 },
  resultRow: {
    minHeight: Structure.tapLarge,
    borderWidth: 1,
    borderRadius: Structure.radiusControl,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 8,
    justifyContent: "center",
    gap: 2,
  },
  // Large enough that the letterforms are actually legible as letterforms.
  specimen: { fontSize: 22, lineHeight: 30 },
  resultMeta: { flexDirection: "row", alignItems: "center", gap: 8 },
  resultName: { flex: 1, fontSize: TypeScale.label, fontWeight: "700" },
  resultCategory: { fontSize: TypeScale.label, fontWeight: "800", letterSpacing: 0.8 },
  resultDesigner: { fontSize: TypeScale.label, lineHeight: 15 },
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
