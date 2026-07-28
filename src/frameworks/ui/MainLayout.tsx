import React, { useEffect, useState } from "react";
import { Alert, BackHandler, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { LearnimalController } from "../../adapters/presenters/LearnimalController";
import {
  presentDocument,
  presentLearningDeck,
} from "../../adapters/presenters/LearningDeckPresenter";
import { useControllerState } from "./useControllerState";
import { BottomNavigation, CorePlace } from "./learningDeck/components";
import { SelectionTray } from "./learningDeck/SelectionTray";
import {
  CaptureIntent,
  CaptureScreen,
  DeckScreen,
  DocumentScreen,
  LibraryScreen,
  SpaceScreen,
} from "./learningDeck/screens";
import { resolveLearningTheme } from "./learningDeck/theme";
import { CardDetailModal } from "./learningDeck/CardDetailModal";
import { ReviewModal } from "./learningDeck/ReviewModal";
import {
  CommandConsoleModal,
  PendingInputModal,
} from "./learningDeck/CommandConsoleModal";
import { AiPreflightSheet } from "./learningDeck/AiPreflightSheet";
import { ResearchResultsSheet } from "./learningDeck/ResearchResultsSheet";
import { MissionEditorSheet } from "./learningDeck/MissionEditorSheet";
import { GapReportSheet } from "./learningDeck/GapReportSheet";
import { SettingsScreen } from "./learningDeck/SettingsScreen";

type LibraryLevel = "index" | "space" | "document";

interface MainLayoutProps {
  controller: LearnimalController;
}

export function MainLayout({ controller }: MainLayoutProps) {
  const state = useControllerState(controller);
  const theme = resolveLearningTheme(state.theme, state.accent);
  const deck = presentLearningDeck(state);
  const [place, setPlace] = useState<CorePlace>("deck");
  const [libraryLevel, setLibraryLevel] = useState<LibraryLevel>("index");
  const [captureIntent, setCaptureIntent] = useState<CaptureIntent>("note");
  const [captureDraft, setCaptureDraft] = useState("");
  const [captureWorking, setCaptureWorking] = useState(false);
  const [captureAwaitingInput, setCaptureAwaitingInput] = useState(false);
  useEffect(() => {
    if (state.isSettingsSheetOpen) {
      setPlace("more");
      controller.setSettingsSheetOpen(false);
    }
  }, [controller, state.isSettingsSheetOpen]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        if (state.selection.size > 0) {
          controller.clearSelection();
          return true;
        }
        if (place === "capture" && captureWorking) return true;
        if (place === "library" && libraryLevel === "document") {
          backFromDocument();
          return true;
        }
        if (place === "library" && libraryLevel === "space") {
          setLibraryLevel("index");
          return true;
        }
        if (place !== "deck") {
          controller.navigateToGroup(null);
          setPlace("deck");
          return true;
        }
        return false;
      },
    );
    return () => subscription.remove();
  }, [
    captureWorking,
    controller,
    libraryLevel,
    place,
    state.currentGroupId,
    state.selection.size,
  ]);

  const openSpace = async (spaceId: string) => {
    if (spaceId !== state.activeWorkspaceId)
      await controller.switchWorkspace(spaceId);
    controller.navigateToGroup(null);
    controller.clearSelection();
    setPlace("library");
    setLibraryLevel("space");
  };

  const openDocument = (groupId: string) => {
    controller.navigateToGroup(groupId);
    setPlace("library");
    setLibraryLevel("document");
  };

  const backFromDocument = () => {
    const current = state.cards.find(
      (card) => card.id === state.currentGroupId,
    );
    if (current?.parentId) {
      controller.navigateToGroup(current.parentId);
      setLibraryLevel("document");
    } else {
      controller.navigateToGroup(null);
      setLibraryLevel("space");
    }
  };

  const openCard = (cardId: string) => {
    controller.openCard(cardId);
  };

  const openCapture = (
    intent: CaptureIntent,
    parentId: string | null = null,
  ) => {
    controller.navigateToGroup(parentId);
    setCaptureIntent(intent);
    setPlace("capture");
  };

  const openOperationResult = async () => {
    const result = state.operationResult;
    if (!result) return;
    await controller.openOperationResult();
    if (result.destination.cardId && !result.destination.groupId) {
      controller.openCard(result.destination.cardId);
      return;
    }
    setPlace("library");
    setLibraryLevel(result.destination.groupId ? "document" : "space");
  };

  const openSettings = () => {
    setPlace("more");
  };


  const confirmSelectionDelete = () => {
    const selectedCards = state.cards.filter((card) =>
      state.selection.has(card.id),
    );
    const groupCount = selectedCards.filter(
      (card) => card.type === "group",
    ).length;
    const count = selectedCards.length;
    const title = `Delete ${count} item${count === 1 ? "" : "s"}?`;
    if (groupCount > 0) {
      Alert.alert(
        title,
        "Selected groups contain other material. Keep contents moves their children up one level; Delete all removes groups and everything inside them.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Keep contents",
            onPress: () => void controller.deleteSelection(false),
          },
          {
            text: "Delete all",
            style: "destructive",
            onPress: () => void controller.deleteSelection(true),
          },
        ],
      );
      return;
    }
    Alert.alert(
      title,
      "Their notes and practice material will be permanently removed.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => void controller.deleteSelection(true),
        },
      ],
    );
  };

  const document = state.currentGroupId
    ? presentDocument(state.cards, state.currentGroupId)
    : null;
  let screen: React.ReactNode;

  if (place === "deck") {
    screen = (
      <DeckScreen
        controller={controller}
        state={state}
        theme={theme}
        model={deck}
        onOpenSpace={(spaceId) => void openSpace(spaceId)}
        onOpenDocument={openDocument}
        onCapture={openCapture}
        onOpenResult={() => void openOperationResult()}
        onOpenSettings={openSettings}
      />
    );
  } else if (place === "library" && libraryLevel === "index") {
    screen = (
      <LibraryScreen
        theme={theme}
        model={deck}
        onOpenSpace={(spaceId) => void openSpace(spaceId)}
      />
    );
  } else if (place === "library" && libraryLevel === "document" && document) {
    screen = (
      <DocumentScreen
        controller={controller}
        state={state}
        theme={theme}
        document={document}
        onBack={backFromDocument}
        onOpenGroup={openDocument}
        onOpenCard={openCard}
        onCapture={(intent) => openCapture(intent, document.group.id)}
      />
    );
  } else if (place === "library") {
    screen = (
      <SpaceScreen
        controller={controller}
        state={state}
        theme={theme}
        model={deck}
        onBack={() => setLibraryLevel("index")}
        onOpenDocument={openDocument}
        onOpenCard={openCard}
        onCapture={openCapture}
      />
    );
  } else if (place === "capture") {
    screen = (
      <CaptureScreen
        controller={controller}
        theme={theme}
        initialIntent={captureIntent}
        value={captureDraft}
        working={captureWorking}
        onChangeText={setCaptureDraft}
        onWorkingChange={setCaptureWorking}
        onInputRequired={() => setCaptureAwaitingInput(true)}
        onComplete={() => {
          setCaptureDraft("");
          setCaptureAwaitingInput(false);
          controller.navigateToGroup(null);
          setPlace("deck");
        }}
      />
    );
  } else {
    screen = (
      <SettingsScreen controller={controller} state={state} theme={theme} />
    );
  }

  const changePlace = (nextPlace: CorePlace) => {
    if (captureWorking) return;
    controller.navigateToGroup(null);
    setPlace(nextPlace);
    if (nextPlace === "library") setLibraryLevel("index");
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <StatusBar style={state.theme === "dark" ? "light" : "dark"} animated />
      <SafeAreaView
        style={styles.safeArea}
        edges={["top", "left", "right", "bottom"]}
      >
        <View
          style={[
            styles.frame,
            { backgroundColor: theme.background, borderColor: theme.line },
          ]}
        >
          <View pointerEvents="none" style={styles.instrumentGrid}>
            <View
              style={[styles.gridLineVertical, { backgroundColor: theme.line }]}
            />
            <View
              style={[
                styles.gridLineHorizontal,
                { backgroundColor: theme.line },
              ]}
            />
            <View style={[styles.gridNode, { borderColor: theme.line }]} />
          </View>
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
          {state.selection.size > 0 ? (
            <SelectionTray
              controller={controller}
              state={state}
              theme={theme}
              onDelete={confirmSelectionDelete}
            />
          ) : (
            <BottomNavigation
              place={place}
              theme={theme}
              onChange={changePlace}
            />
          )}
        </View>
      </SafeAreaView>
      <CardDetailModal controller={controller} state={state} theme={theme} />
      <ReviewModal controller={controller} state={state} theme={theme} />
      <CommandConsoleModal
        controller={controller}
        state={state}
        theme={theme}
      />
      <AiPreflightSheet controller={controller} state={state} theme={theme} />
      <ResearchResultsSheet controller={controller} state={state} theme={theme} />
      <MissionEditorSheet controller={controller} state={state} theme={theme} />
      <GapReportSheet controller={controller} state={state} theme={theme} />
      <PendingInputModal
        controller={controller}
        state={state}
        theme={theme}
        onCancel={() => setCaptureAwaitingInput(false)}
        onPipelineComplete={() => {
          if (!captureAwaitingInput) return;
          setCaptureDraft("");
          setCaptureAwaitingInput(false);
          controller.navigateToGroup(null);
          setPlace("deck");
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
  instrumentGrid: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    opacity: 0.18,
  },
  gridLineVertical: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: "72%",
    width: StyleSheet.hairlineWidth,
  },
  gridLineHorizontal: {
    position: "absolute",
    left: 0,
    right: 0,
    top: "38%",
    height: StyleSheet.hairlineWidth,
  },
  gridNode: {
    position: "absolute",
    left: "72%",
    top: "38%",
    width: 9,
    height: 9,
    marginLeft: -4,
    marginTop: -4,
    borderWidth: 1,
    borderRadius: 5,
  },
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
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
    textAlign: "center",
  },
  pressed: { opacity: 0.7 },
});
