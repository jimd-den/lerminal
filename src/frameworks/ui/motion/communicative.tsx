import React, { useEffect, useRef } from "react";
import { Animated, Easing, ViewStyle } from "react-native";
import { useReducedMotion } from "../useReducedMotion";

/**
 * # Communicative Motion
 *
 * ## Business Value & Purpose
 * Every animation here answers a question the user would otherwise have to ask. None of
 * them exist to look expensive.
 *
 * - {@link ArrivalView} — *"what just appeared?"* New output rises and fades in, so the
 *   eye is drawn to what the run produced rather than hunting a changed list.
 * - {@link CountPulse} — *"did that register?"* The selection count flicks when it
 *   changes, confirming a tap landed even when the number moves by one.
 * - {@link WorkingBar} — *"is it still going?"* A sweeping bar during a run, which stops
 *   the moment the work does.
 *
 * ## The rule
 * Motion may direct attention or confirm a change. It may never *imply capability* — no
 * fake progress percentages, no spinner that keeps spinning after the work finished, no
 * pulsing that suggests activity where there is none. A user must be able to ignore every
 * animation in this file and lose no information: each one duplicates something the
 * layout already says in words.
 *
 * All three collapse to their end state when the OS asks for reduced motion.
 */

/** Shared timing. Short enough to feel like feedback rather than choreography. */
const DURATION = 220;

/**
 * Fades and lifts its children in on mount — for content that has just been created.
 *
 * `key` the element on the run's identity so re-renders don't re-animate: an arrival
 * animation that replays on every state change stops meaning "this is new".
 */
export function ArrivalView({
  children,
  style,
  delay = 0,
}: {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  /** Stagger for lists, so several arrivals read as a sequence rather than a flash. */
  delay?: number;
}) {
  const reducedMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(reducedMotion ? 1 : 0)).current;

  useEffect(() => {
    if (reducedMotion) {
      progress.setValue(1);
      return;
    }
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: DURATION,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [delay, progress, reducedMotion]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: [
            { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/**
 * Briefly scales its children whenever `value` changes — confirmation that an action
 * registered. Skips the first render, because appearing is not the same as changing.
 */
export function CountPulse({
  value,
  children,
  style,
}: {
  value: number | string;
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
}) {
  const reducedMotion = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const previous = useRef(value);

  useEffect(() => {
    if (previous.current === value) return;
    previous.current = value;
    if (reducedMotion) return;

    const animation = Animated.sequence([
      Animated.timing(scale, {
        toValue: 1.12,
        duration: 90,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 1,
        duration: 130,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [reducedMotion, scale, value]);

  return <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>;
}

/**
 * A bar that sweeps while work is genuinely in flight.
 *
 * Deliberately not a progress bar: the app cannot know how far along a model call is, and
 * a bar that fills to 90% and waits is a lie told smoothly. This one only ever says
 * "still working", and stops the instant `active` goes false.
 */
export function WorkingBar({
  active,
  color,
  trackColor,
}: {
  active: boolean;
  color: string;
  trackColor: string;
}) {
  const reducedMotion = useReducedMotion();
  const sweep = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active || reducedMotion) {
      sweep.setValue(0);
      return;
    }
    const animation = Animated.loop(
      Animated.timing(sweep, {
        toValue: 1,
        duration: 1100,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      })
    );
    animation.start();
    return () => animation.stop();
  }, [active, reducedMotion, sweep]);

  if (!active) return null;

  return (
    <Animated.View
      accessibilityRole="progressbar"
      // Indeterminate on purpose — there is no honest percentage to report.
      accessibilityValue={{ text: "Working" }}
      style={{ height: 3, backgroundColor: trackColor, overflow: "hidden", borderRadius: 2 }}
    >
      <Animated.View
        style={{
          height: 3,
          width: "40%",
          backgroundColor: color,
          transform: [
            {
              translateX: sweep.interpolate({
                inputRange: [0, 1],
                // Reduced motion leaves the bar parked, still visibly present.
                outputRange: reducedMotion ? [0, 0] : [-80, 240],
              }),
            },
          ],
        }}
      />
    </Animated.View>
  );
}
