import React, { useState } from "react";
import {
  Alert,
  StyleSheet,
  View,
} from "react-native";
import { FontProvider, Text } from "./griot/Typography";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { GriotController } from "../../adapters/presenters/GriotController";
import {
  presentDocument,
  presentGriotDeck,
} from "../../adapters/presenters/GriotDeckPresenter";
import { useControllerState } from "./useControllerState";
import { useDeckNavigation } from "./useDeckNavigation";
import { AskAffordance, BottomNavigation, CaptureAffordance } from "./griot/components";
import { SelectionTray } from "./griot/SelectionTray";
import { ActivityBanner } from "./griot/ActivityBanner";
import { WorkspacePulse } from "./griot/WorkspacePulse";
import { PlaceTransition } from "./motion/communicative";
import { ModalStack } from "./griot/ModalStack";
import {
  CaptureIntent,
  DeckScreen,
  DocumentScreen,
  LibraryScreen,
  SpaceScreen,
} from "./griot/screens";
import { SettingsScreen } from "./griot/SettingsScreen";
import { resolveGriotTheme } from "./griot/theme";
import { useReducedMotion } from "./useReducedMotion";

/**
 * # Main Layout — the shell
 *
 * ## Business Value & Purpose
 * The one screen the product promises: a canvas, a bottom bar, and whatever sheet is
 * open. Its only jobs are choosing which screen occupies the slot, and swapping the
 * bottom bar for the selection tray when cards are selected.
 *
 * Everything it used to also do now lives where it belongs — navigation state and the
 * back-button policy in {@link useDeckNavigation}, the sheets in {@link ModalStack}, the
 * screens in `griot/screens/`. What remains is layout, which is what a component
 * called `MainLayout` should be.
 */
export function MainLayout({ controller }: { controller: GriotController }) {
  const state = useControllerState(controller);
  const theme = resolveGriotTheme(state.theme, state.accent, state.appearance);
  const deck = presentGriotDeck(state);
  const reducedMotion = useReducedMotion();

  // The capture draft lives here rather than in the screen: a pending-input prompt can
  // interrupt a capture, and the draft has to outlive that round trip.
  const [captureDraft, setCaptureDraft] = useState("");
  const [captureWorking, setCaptureWorking] = useState(false);
  const [captureAwaitingInput, setCaptureAwaitingInput] = useState(false);

  const nav = useDeckNavigation({ controller, state, captureWorking });

  const document = state.currentGroupId
    ? presentDocument(state.cards, state.currentGroupId)
    : null;

  /**
   * Deleting is the one irreversible action reachable in a single tap, so it always
   * confirms — and when groups are involved it asks the question that actually matters:
   * do the contents come too?
   */
  const confirmSelectionDelete = () => {
    const selectedCards = state.cards.filter(card => state.selection.has(card.id));
    const groupCount = selectedCards.filter(card => card.type === "group").length;
    const count = selectedCards.length;
    const title = `Delete ${count} item${count === 1 ? "" : "s"}?`;

    if (groupCount > 0) {
      Alert.alert(
        title,
        "Selected groups contain other material. Keep contents moves their children up one level; Delete all removes groups and everything inside them.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Keep contents", onPress: () => void controller.deleteSelection(false) },
          {
            text: "Delete all",
            style: "destructive",
            onPress: () => void controller.deleteSelection(true),
          },
        ]
      );
      return;
    }

    Alert.alert(title, "Their notes and practice material will be permanently removed.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => void controller.deleteSelection(true),
      },
    ]);
  };

  const finishCapture = () => {
    setCaptureDraft("");
    setCaptureAwaitingInput(false);
    controller.closeCaptureSheet();
  };

  const openCapture = (intent: CaptureIntent, parentId: string | null = null) => {
    controller.openCaptureSheet(intent, parentId);
  };

  const screen = renderScreen();

  function renderScreen(): React.ReactNode {
    if (nav.place === "deck") {
      return (
        <DeckScreen
          controller={controller}
          state={state}
          theme={theme}
          model={deck}
          onOpenSpace={spaceId => void nav.openSpace(spaceId)}
          onOpenDocument={nav.openDocument}
          onCapture={openCapture}
          onOpenResult={() => void nav.openOperationResult()}
          onOpenSettings={nav.openSettings}
        />
      );
    }

    // Settings is a full screen rather than a sheet, so it occupies the slot like any place.
    if (nav.place === "more") {
      return <SettingsScreen controller={controller} state={state} theme={theme} />;
    }

    // Library, at whichever depth the drill has reached.
    if (nav.libraryLevel === "index") {
      return (
        <LibraryScreen
          theme={theme}
          model={deck}
          onOpenSpace={spaceId => void nav.openSpace(spaceId)}
        />
      );
    }

    if (nav.libraryLevel === "document" && document) {
      return (
        <DocumentScreen
          controller={controller}
          state={state}
          theme={theme}
          document={document}
          onBack={nav.backFromDocument}
          onOpenGroup={nav.openDocument}
          onOpenCard={controller.openCard.bind(controller)}
          onCapture={intent => openCapture(intent, document.group.id)}
        />
      );
    }

    return (
      <SpaceScreen
        controller={controller}
        state={state}
        theme={theme}
        model={deck}
        onBack={nav.showLibraryIndex}
        onOpenDocument={nav.openDocument}
        onOpenCard={controller.openCard.bind(controller)}
        onCapture={openCapture}
      />
    );
  }

  return (
    // The font provider wraps the whole shell, modals included: a typeface the user chose
    // has to reach every `<Text>` in the app, not the two-thirds that happened to be
    // wired by hand. See `Typography.tsx`.
    <FontProvider theme={theme}>
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <StatusBar style={state.theme === "dark" ? "light" : "dark"} animated />
      <SafeAreaView style={styles.safeArea} edges={["top", "left", "right", "bottom"]}>
        <View
          style={[
            styles.frame,
            { backgroundColor: theme.background, borderColor: theme.line },
          ]}
        >
          {/* Keyed on place *and* group, so moving between screens and being dropped
              into a newly created group both read as movement rather than a silent swap. */}
          <PlaceTransition
            place={`${nav.place}:${nav.libraryLevel}:${state.currentGroupId ?? ""}`}
            style={styles.screenSlot}
          >
            {screen}
          </PlaceTransition>

          {state.toastMessage ? (
            <View
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
              pointerEvents="none"
              style={[
                styles.toast,
                { backgroundColor: theme.text, borderColor: theme.accent },
              ]}
            >
              <Text
                style={[
                  styles.toastText,
                  { color: theme.background, fontFamily: theme.fontMono },
                ]}
              >
                {state.toastMessage}
              </Text>
            </View>
          ) : null}

          {/* The bottom cluster: banners, then either the selection tray or the nav.
              Ask and Capture float above whatever the cluster currently is, anchored
              to the cluster's own top edge rather than to a fixed offset from the bar —
              so neither can ever land on top of the pulse or the activity banner, and
              both are unaffected by how many items the nav has. */}
          <View style={styles.bottomCluster}>
            {/* Always mounted: in-flight work outlives the screen that started it, so the
                shell reports it rather than each screen owning its own indicator. */}
            <ActivityBanner controller={controller} state={state} theme={theme} />
            <WorkspacePulse controller={controller} state={state} theme={theme} />

            {/* Hidden while either sheet is up (they would be stranded under the modal)
                and while cards are selected, where the tray owns the bottom of the screen. */}
            {!state.workspaceAgent.isOpen && !state.isCaptureSheetOpen && state.selection.size === 0 ? (
              <View style={styles.floatingSlot} pointerEvents="box-none">
                <CaptureAffordance
                  theme={theme}
                  reducedMotion={reducedMotion}
                  onPress={() => openCapture("note")}
                />
                <AskAffordance
                  theme={theme}
                  reducedMotion={reducedMotion}
                  onPress={() => controller.openWorkspaceAgent()}
                />
              </View>
            ) : null}

            {state.selection.size > 0 ? (
              <SelectionTray
                controller={controller}
                state={state}
                theme={theme}
                onDelete={confirmSelectionDelete}
              />
            ) : (
              <BottomNavigation place={nav.place} theme={theme} onChange={nav.changePlace} />
            )}
          </View>
        </View>
      </SafeAreaView>

      <ModalStack
        controller={controller}
        state={state}
        theme={theme}
        captureDraft={captureDraft}
        captureWorking={captureWorking}
        onCaptureChangeText={setCaptureDraft}
        onCaptureWorkingChange={setCaptureWorking}
        onCaptureInputRequired={() => setCaptureAwaitingInput(true)}
        onCaptureComplete={finishCapture}
        onPendingInputCancel={() => setCaptureAwaitingInput(false)}
        onPendingInputComplete={() => {
          if (!captureAwaitingInput) return;
          finishCapture();
        }}
      />
    </View>
    </FontProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safeArea: { flex: 1 },
  frame: {
    flex: 1,
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  screenSlot: { flex: 1 },
  // `relative` so the Ask affordance can hang off the cluster's top edge; the cluster
  // itself stays in normal flow beneath the screen.
  bottomCluster: { position: "relative" },
  // Ask and Capture stacked in one column, Capture above Ask — the user's chosen layout
  // rather than two buttons side by side. Height is two 52pt circles plus the gap between
  // them, so the offset above the cluster's top edge is derived from that, not from the
  // nav's width or item count.
  floatingSlot: {
    position: "absolute",
    right: 14,
    top: -140,
    alignItems: "flex-end",
    gap: 12,
  },
  toast: {
    position: "absolute",
    left: 24,
    right: 24,
    // Clears Ask and Capture, stacked just above the bottom cluster.
    bottom: 210,
    minHeight: 48,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: "center",
    paddingHorizontal: 15,
  },
  toastText: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.5,
    textAlign: "center",
  },
});
