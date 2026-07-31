import React, { useEffect, useState } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { SafeAreaProvider, initialWindowMetrics } from "react-native-safe-area-context";
import { GriotController } from "./src/adapters/presenters/GriotController";
import { composeController } from "./src/frameworks/composition/composeController";
import { MainLayout } from "./src/frameworks/ui/MainLayout";

/**
 * # GRIOT Application Bootstrapper
 *
 * ## Business Value & Purpose
 * The app's entry point. It asks `composeController` for a fully wired controller —
 * all knowledge of *which* storage and network implementations back the ports lives
 * there — then renders once startup has settled. Startup never hangs: an initialization
 * failure still hands the user a running app that can report what went wrong.
 */
export default function App() {
  const [controller, setController] = useState<GriotController | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const appController = composeController();

    // `init` contains its own failure handling and surfaces problems through app state;
    // the `finally` is the guarantee that we leave the splash screen either way.
    appController
      .init()
      .finally(() => {
        setController(appController);
        setLoading(false);
      });
  }, []);

  if (loading || !controller) {
    return (
      <SafeAreaProvider initialMetrics={initialWindowMetrics} style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4EC7C0" />
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics} style={styles.container}>
      <MainLayout controller={controller} />
    </SafeAreaProvider>
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
