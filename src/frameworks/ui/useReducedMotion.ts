import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

/**
 * # useReducedMotion
 *
 * ## Business Value & Purpose
 * Reports the OS-level "reduce motion" accessibility setting, so animated affordances can
 * present their end state instantly instead of sliding, fading, or pulsing. For users who
 * enable it — commonly because motion triggers nausea or migraine — an animation isn't a
 * flourish, it's a symptom.
 *
 * Nothing in this app animates *information*: motion only ever decorates a transition
 * that has already happened. That makes honouring the setting purely a matter of skipping
 * the decoration, with no state left unreachable.
 *
 * ## Why a hook and not a theme field
 * It's a live OS subscription, not a design token — it can flip while the app is open,
 * and it must be read per-component so a screen re-renders when it changes.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let active = true;

    // The initial read is async; guard against resolving after unmount.
    AccessibilityInfo.isReduceMotionEnabled().then(enabled => {
      if (active) setReduced(enabled);
    });

    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduced
    );

    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return reduced;
}

/**
 * The `animationType` a modal should use, given the setting. `"none"` is what RN offers
 * as "appear immediately" — the sheet still opens, it just doesn't travel to get there.
 */
export function modalAnimation(reducedMotion: boolean, preferred: "slide" | "fade"): "slide" | "fade" | "none" {
  return reducedMotion ? "none" : preferred;
}
