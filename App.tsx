import React, { useEffect, useState } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { StatusBar } from "expo-status-bar";
import { LearnimalController } from "./src/adapters/presenters/LearnimalController";
import { AsyncStorageCardRepository } from "./src/frameworks/storage/AsyncStorageCardRepository";
import { AsyncStorageWorkspaceRepository } from "./src/frameworks/storage/AsyncStorageWorkspaceRepository";
import { AsyncStorageSettingsRepository } from "./src/frameworks/storage/AsyncStorageSettingsRepository";
import { OpenRouterAgentGateway } from "./src/frameworks/network/OpenRouterAgentGateway";
import { MainLayout } from "./src/frameworks/ui/MainLayout";

/**
 * # Learnimal Application Bootstrapper
 * 
 * ## Business Value & Purpose
 * This is the Composition Root of the application (Frameworks & Drivers layer).
 * It instantiates database connections (AsyncStorage repositories), the network client
 * (OpenRouter Agent Gateway), and registers them into the core Learnimal state controller.
 * Dependencies are injected downwards to preserve Clean Architecture decoupling.
 */
export default function App() {
  const [controller, setController] = useState<LearnimalController | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const logTimestamp = new Date().toISOString();
    console.log(`[${logTimestamp}] [App] Instantiating application composition root...`);

    const cardRepo = new AsyncStorageCardRepository();
    const workspaceRepo = new AsyncStorageWorkspaceRepository();
    const settingsRepo = new AsyncStorageSettingsRepository();
    const agentGateway = new OpenRouterAgentGateway();

    const appController = new LearnimalController({
      cardRepo,
      workspaceRepo,
      settingsRepo,
      agentGateway,
    });

    appController.init().then(() => {
      setController(appController);
      setLoading(false);
      console.log(`[${new Date().toISOString()}] [App] Application successfully loaded.`);
    });
  }, []);

  if (loading || !controller) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4EC7C0" />
      </View>
    );
  }

  // Choose the status bar style depending on active theme settings
  const currentTheme = controller.getState().theme;
  const statusBarStyle = currentTheme === "dark" ? "light" : "dark";

  return (
    <View style={styles.container}>
      <StatusBar style={statusBarStyle} />
      <MainLayout controller={controller} />
    </View>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: "#0A0B0F",
    alignItems: "center",
    justifyContent: "center",
  },
  container: {
    flex: 1,
  },
});

