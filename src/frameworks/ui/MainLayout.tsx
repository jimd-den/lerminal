import React, { useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { LearnimalController } from "../../adapters/presenters/LearnimalController";
import {
  presentDocument,
  presentLearningDeck,
} from "../../adapters/presenters/LearningDeckPresenter";
import { useControllerState } from "./useControllerState";
import { useDeckNavigation } from "./useDeckNavigation";
import { BottomNavigation } from "./learningDeck/components";
import { SelectionTray } from "./learningDeck/SelectionTray";
import { ActivityBanner } from "./learningDeck/ActivityBanner";
import { ModalStack } from "./learningDeck/ModalStack";
import {
  CaptureScreen,
  DeckScreen,
  DocumentScreen,
  LibraryScreen,
  SpaceScreen,
} from "./learningDeck/screens";
import { SettingsScreen } from "./learningDeck/SettingsScreen";
import { resolveLearningTheme } from "./learningDeck/theme";

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
 * screens in `learningDeck/screens/`. What remains is layout, which is what a component
 * called `MainLayout` should be.
 */
export function MainLayout({ controller }: { controller: LearnimalController }) {
  const state = useControllerState(controller);
  const theme = resolveLearningTheme(state.theme, state.accent, state.appearance);
  const deck = presentLearningDeck(state);

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
    controller.navigateToGroup(null);
    nav.changePlace("deck");
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
          onCapture={nav.openCapture}
          onOpenResult={() => void nav.openOperationResult()}
          onOpenSettings={nav.openSettings}
        />
      );
    }

    if (nav.place === "capture") {
      return (
        <CaptureScreen
          controller={controller}
          theme={theme}
          initialIntent={nav.captureIntent}
          value={captureDraft}
          working={captureWorking}
          onChangeText={setCaptureDraft}
          onWorkingChange={setCaptureWorking}
          onInputRequired={() => setCaptureAwaitingInput(true)}
          onComplete={finishCapture}
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
          onCapture={intent => nav.openCapture(intent, document.group.id)}
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
        onCapture={nav.openCapture}
      />
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <StatusBar style={state.theme === "dark" ? "light" : "dark"} animated />
      <SafeAreaView style={styles.safeArea} edges={["top", "left", "right", "bottom"]}>
        <View
          style={[
            styles.frame,
            { backgroundColor: theme.background, borderColor: theme.line },
          ]}
        >
          <View style={styles.screenSlot}>{screen}</View>

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

          {/* Always mounted: in-flight work outlives the screen that started it, so the
              shell reports it rather than each screen owning its own indicator. */}
          <ActivityBanner controller={controller} state={state} theme={theme} />

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
      </SafeAreaView>

      <ModalStack
        controller={controller}
        state={state}
        theme={theme}
        onPendingInputCancel={() => setCaptureAwaitingInput(false)}
        onPendingInputComplete={() => {
          if (!captureAwaitingInput) return;
          finishCapture();
        }}
      />
    </View>
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
  toast: {
    position: "absolute",
    left: 24,
    right: 24,
    bottom: 86,
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
