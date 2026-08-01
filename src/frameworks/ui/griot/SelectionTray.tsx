import React from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  AppState,
  GriotController,
} from "../../../adapters/presenters/GriotController";
import {
  SelectionAction,
  presentSelectionTray,
} from "../../../adapters/presenters/CaptureReceiptPresenter";
import { CountPulse } from "../motion/communicative";
import { GriotTheme, Structure, TypeScale } from "./theme";
import { TrashIcon } from "./Icons";

/**
 * # Selection Tray
 *
 * ## Business Value & Purpose
 * The touch-first counterpart to typing a pipeline. It replaces a tray whose two middle
 * buttons ("Organize", "Transform") both merely opened the command palette — telling the
 * user nothing about what was possible — with the five named moves from
 * `selectionActions.ts`, each labelled, each either enabled or visibly disabled with a
 * reason.
 *
 * Layout, again, is the whole job: which actions exist and whether they apply is decided
 * in the use-case layer and read here through {@link presentSelectionTray}.
 */
export function SelectionTray({
  controller,
  state,
  theme,
  onDelete,
}: {
  controller: GriotController;
  state: AppState;
  theme: GriotTheme;
  onDelete: () => void;
}) {
  const tray = presentSelectionTray(state);

  return (
    <View style={[styles.wrap, { backgroundColor: theme.panelStrong, borderColor: theme.accent }]}>
      <View style={styles.head}>
        <Pressable
          accessibilityRole="button"
          onPress={() => controller.clearSelection()}
          hitSlop={8}
          style={styles.clear}
        >
          <Text style={[styles.clearText, { color: theme.accent, fontFamily: theme.fontMono }]}>
            CLEAR
          </Text>
        </Pressable>
        <CountPulse value={tray.count}>
          <Text style={[styles.count, { color: theme.text, fontFamily: theme.fontMono }]}>
            {tray.count} SELECTED
          </Text>
        </CountPulse>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Delete selected items"
          onPress={onDelete}
          hitSlop={8}
          style={styles.delete}
        >
          <TrashIcon color={theme.danger} size={20} />
        </Pressable>
      </View>

      {/* Horizontally scrollable so five 44pt targets never crush on a narrow phone. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.actions}
        keyboardShouldPersistTaps="handled"
      >
        {tray.actions.map((action) => (
          <TrayButton
            key={action.id}
            action={action}
            theme={theme}
            onPress={() => {
              if (!action.enabled) {
                // A disabled tap is a teaching moment, not a no-op: say why.
                Alert.alert(action.label, action.disabledReason ?? "Not available right now.");
                return;
              }
              void controller.dispatchSuggestedAction(action.dispatch);
            }}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function TrayButton({
  action,
  theme,
  onPress,
}: {
  action: SelectionAction;
  theme: GriotTheme;
  onPress: () => void;
}) {
  const color = action.enabled ? theme.text : theme.textFaint;
  return (
    <Pressable
      accessibilityRole="button"
      // Reported as disabled to assistive tech while staying tappable, so a screen-reader
      // user can still hear the reason rather than meeting a button that does nothing.
      accessibilityState={{ disabled: !action.enabled }}
      accessibilityHint={action.disabledReason ?? undefined}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          borderColor: action.enabled ? theme.line : `${theme.line}80`,
          backgroundColor: action.enabled ? theme.panelMuted : "transparent",
        },
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.buttonText, { color, fontFamily: theme.fontMono }]}>{action.label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.7 },
  wrap: { borderTopWidth: 1, paddingHorizontal: 12, paddingTop: 6, paddingBottom: 10 },
  head: { minHeight: 40, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  clear: { minHeight: 40, minWidth: 56, justifyContent: "center" },
  clearText: { fontSize: TypeScale.label, fontWeight: "800", letterSpacing: 1 },
  count: { fontSize: TypeScale.label, fontWeight: "800", letterSpacing: 1 },
  delete: { minHeight: 40, minWidth: 44, alignItems: "flex-end", justifyContent: "center" },
  actions: { gap: 8, paddingVertical: 4, paddingRight: 4 },
  button: {
    minHeight: Structure.tapLarge,
    minWidth: 96,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: { fontSize: TypeScale.label, fontWeight: "800", letterSpacing: 0.4 },
});
