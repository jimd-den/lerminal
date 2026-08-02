import React, { useEffect, useState } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { SafeAreaProvider, initialWindowMetrics } from "react-native-safe-area-context";
import { KeyboardProvider } from "react-native-keyboard-controller";
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
 *
 * ## Why KeyboardProvider wraps everything
 * Android has been edge-to-edge by default since Expo SDK 54, which means the app window
 * no longer resizes when the keyboard opens — `adjustResize` and a bare
 * `KeyboardAvoidingView` stop working, and content inside a `Modal` (the Ask GRIOT sheet)
 * simply gets covered. `react-native-keyboard-controller` is what Expo recommends in its
 * place: it reads the real IME inset and works inside modals. The provider must sit above
 * everything that needs it, so it lives here.
 *
 * Both translucency flags are on because the app is edge-to-edge: they tell the provider
 * not to double-count the status and navigation bar insets it is already drawing under.
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
    <KeyboardProvider statusBarTranslucent navigationBarTranslucent>
      <SafeAreaProvider initialMetrics={initialWindowMetrics} style={styles.container}>
        <MainLayout controller={controller} />
      </SafeAreaProvider>
    </KeyboardProvider>
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
