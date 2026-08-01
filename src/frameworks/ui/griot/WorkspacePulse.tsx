import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  AppState,
  GriotController,
} from "../../../adapters/presenters/GriotController";
import { GriotTheme, Structure, TypeScale } from "./theme";

/**
 * # Workspace Pulse
 *
 * ## Business Value & Purpose
 * A small, calm banner that names one thing worth noticing about the current workspace —
 * never more than one, and never anything the app didn't actually check. The text and
 * chip labels come pre-computed from `WorkspaceAgentPresenter.presentWorkspacePulse`,
 * itself fed by the deterministic, model-free `observeWorkspace`. This component renders
 * what it's given; it does not decide what's worth surfacing.
 *
 * Phase B: chip presses only open/close the Ask GRIOT sheet or dismiss the banner —
 * grouping/extraction/search execution lands in a later phase.
 */
export function WorkspacePulse({
  controller,
  state,
  theme,
}: {
  controller: GriotController;
  state: AppState;
  theme: GriotTheme;
}) {
  const pulse = state.workspacePulse;
  const [dismissed, setDismissed] = React.useState(false);

  React.useEffect(() => {
    setDismissed(false);
  }, [pulse?.message]);

  if (!pulse || dismissed) return null;

  return (
    <View
      style={[
        styles.banner,
        { backgroundColor: theme.panel, borderColor: theme.accent },
      ]}
    >
      <View style={[styles.rail, { backgroundColor: theme.accent }]} />
      <View style={styles.body}>
        <Text
          style={[styles.eyebrow, { color: theme.accent, fontFamily: theme.fontMono }]}
        >
          WORKSPACE PULSE
        </Text>
        <Text
          numberOfLines={3}
          style={[styles.message, { color: theme.text, fontFamily: theme.fontSans }]}
        >
          {pulse.message}
        </Text>

        <View style={styles.chips}>
          {pulse.chips.slice(0, 3).map((chip) => (
            <Pressable
              key={chip.id}
              accessibilityRole="button"
              accessibilityLabel={chip.label}
              hitSlop={10}
              onPress={() => {
                if (chip.id === "dismiss") {
                  setDismissed(true);
                  return;
                }
                // Phase B: any non-dismiss chip opens the conversation sheet, scoped
                // to the cards the observation is about. Execution lands later.
                controller.openWorkspaceAgent();
              }}
              style={[styles.chip, { borderColor: theme.line }]}
            >
              <Text
                style={[styles.chipText, { color: theme.text, fontFamily: theme.fontMono }]}
              >
                {chip.label.toUpperCase()}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    borderWidth: 1,
    borderRadius: Structure.radiusControl,
    marginHorizontal: 12,
    marginBottom: 8,
    overflow: "hidden",
  },
  rail: {
    width: Structure.rail,
    alignSelf: "stretch",
  },
  body: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
  },
  eyebrow: {
    fontSize: TypeScale.label,
    fontWeight: "800",
    letterSpacing: 1,
  },
  message: {
    fontSize: TypeScale.body,
    lineHeight: 19,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 2,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    minHeight: Structure.tap * 0.6,
    justifyContent: "center",
  },
  chipText: {
    fontSize: TypeScale.label,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
});
