import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { GriotDeckModel } from "../../../../adapters/presenters/GriotDeckPresenter";
import { SectionLabel, Slab } from "../components";
import { GriotTheme, TypeScale } from "../theme";
import { EmptyReadout } from "./shared";
import { styles } from "./screenStyles";
import { BRAND_NAME } from "../../../../entities/brand";

/**
 * # Library Screen
 *
 * ## Business Value & Purpose
 * The index of every workspace — each one a bounded system for its own sources, notes,
 * transformations, and practice. Restyled to the same compact brand header the other
 * primary screens use (Capture, Deck), rather than the earlier LCARS-style
 * `SystemHeader`, so switching between them reads as one instrument.
 */
export function LibraryScreen({
  theme,
  model,
  onOpenSpace,
}: {
  theme: GriotTheme;
  model: GriotDeckModel;
  onOpenSpace: (spaceId: string) => void;
}) {
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={[localStyles.topBar, { borderBottomColor: theme.line }]}>
        <View style={{ flex: 1 }}>
          <View style={localStyles.brandRow}>
            <View style={[localStyles.brandDot, { backgroundColor: theme.accent }]} />
            <Text style={[localStyles.brandName, { color: theme.text, fontFamily: theme.fontSans }]}>
              {BRAND_NAME}
            </Text>
          </View>
          <Text style={[localStyles.brandSub, { color: theme.textMuted }]}>
            Every workspace, one bounded system each.
          </Text>
        </View>
        <Text style={[localStyles.tag, { color: theme.accent, fontFamily: theme.fontMono }]}>
          LIBRARY
        </Text>
      </View>

      <SectionLabel
        theme={theme}
        code={`${model.spaces.length.toString().padStart(2, "0")} SPACES`}
      >
        ALL WORKSPACES
      </SectionLabel>

      {model.spaces.length === 0 ? (
        <EmptyReadout theme={theme} text="No workspaces yet." />
      ) : (
        model.spaces.map((space) => (
          <Slab
            key={space.id}
            title={space.name}
            label={space.active ? "ACTIVE" : "STANDBY"}
            meta={
              space.active
                ? `${space.materialCount ?? 0} materials · ${space.dueCount ?? 0} due`
                : "Tap to open"
            }
            theme={theme}
            onPress={() => onOpenSpace(space.id)}
          />
        ))
      )}
    </ScrollView>
  );
}

const localStyles = StyleSheet.create({
  topBar: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingTop: 14,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  brandDot: { width: 9, height: 9, borderRadius: 3 },
  brandName: { fontSize: 17, fontWeight: "800", letterSpacing: 0.5 },
  brandSub: { fontSize: TypeScale.meta, marginTop: 3, lineHeight: 18 },
  tag: { fontSize: TypeScale.label, fontWeight: "900", letterSpacing: 1.3, marginTop: 3 },
});
