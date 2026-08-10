import React from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { Text, TextInput } from "../Typography";
import {
  AppState,
  GriotController,
} from "../../../../adapters/presenters/GriotController";
import {
  DUTY_BRIEFS,
  DUTY_LABELS,
  MAX_DEPTH_CAP,
  STATION_DUTIES,
  StationDuty,
  Watch,
  dutyNeedsSubject,
  isOfflineDuty,
} from "../../../../entities/bridge";
import { ModalSurface } from "../ModalSurface";
import { GriotTheme, Structure, TypeScale } from "../theme";
import { dutyTone } from "./instruments";

/**
 * # Commission Sheet — putting a post on watch
 *
 * ## Business Value & Purpose
 * The captain's one authoring surface. Everything else on the bridge is a tap on something
 * that already exists; this is where a new station comes from, and it is deliberately the
 * only place on the panel with a text field in it.
 *
 * ## Why the duty menu shows what each post *does*
 * A grid of six words — Sensors, Science, Engineering — is the discoverability failure of
 * a blank prompt box wearing different clothes. So every duty carries its brief, in the
 * captain's terms, and the two that need no model and no network say so. The captain
 * should be able to crew a post correctly the first time without having tried all six.
 *
 * ## Why the watch is three choices and not a schedule builder
 * A cron expression is a promise the captain cannot verify. Three legible cadences —
 * when ordered, on report, on a clock — cover what a learning workspace actually needs,
 * and each one can be stated in a phrase the rail then repeats back verbatim.
 */
export function CommissionSheet({
  controller,
  state,
  theme,
}: {
  controller: GriotController;
  state: AppState;
  theme: GriotTheme;
}) {
  const bridge = state.bridge;
  const draft = bridge.draft;
  const needsSubject = dutyNeedsSubject(draft.duty);
  const canCommission = !needsSubject || draft.subject.trim().length > 0;

  return (
    <Modal
      visible={bridge.isCommissionOpen}
      animationType="slide"
      onRequestClose={() => controller.closeCommission()}
    >
      {/* Bottom inset is left to the keyboard avoider, which already accounts for it. */}
      <ModalSurface theme={theme} edges={["top", "left", "right"]}>
        <KeyboardAvoidingView style={styles.root} behavior="padding">
          <View style={[styles.header, { borderBottomColor: theme.line }]}>
            <Text style={[styles.eyebrow, { color: theme.accent, fontFamily: theme.fontMono }]}>
              CREW A POST
            </Text>
            <Pressable onPress={() => controller.closeCommission()} style={styles.close}>
              <Text style={[styles.closeText, { color: theme.accent, fontFamily: theme.fontMono }]}>
                CLOSE
              </Text>
            </Pressable>
          </View>

          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
          >
            <Field label="DUTY" theme={theme}>
              {STATION_DUTIES.map(duty => (
                <DutyOption
                  key={duty}
                  duty={duty}
                  theme={theme}
                  selected={draft.duty === duty}
                  onPress={() => controller.updateStationDraft({ duty })}
                />
              ))}
            </Field>

            {needsSubject ? (
              <Field label="SUBJECT" theme={theme}>
                <TextInput
                  value={draft.subject}
                  onChangeText={subject => controller.updateStationDraft({ subject })}
                  placeholder={subjectPlaceholder(draft.duty)}
                  placeholderTextColor={theme.textFaint}
                  multiline={draft.duty === "comms"}
                  style={[
                    draft.duty === "comms" ? styles.textarea : styles.input,
                    { color: theme.text, borderColor: theme.line },
                  ]}
                />
                <Text style={[styles.hint, { color: theme.textFaint, fontFamily: theme.fontSans }]}>
                  {draft.duty === "comms"
                    ? "Written in your own words. This post stands watch on it."
                    : "What this post keeps its eye on."}
                </Text>
              </Field>
            ) : (
              <Field label="SUBJECT" theme={theme}>
                <Text style={[styles.hint, { color: theme.textMuted, fontFamily: theme.fontSans }]}>
                  {DUTY_LABELS[draft.duty]} reads the whole workspace, so there is nothing to
                  point it at. It needs no model and no network.
                </Text>
              </Field>
            )}

            <Field label="NAME (OPTIONAL)" theme={theme}>
              <TextInput
                value={draft.name}
                onChangeText={name => controller.updateStationDraft({ name })}
                placeholder={`${DUTY_LABELS[draft.duty]}${draft.subject.trim() ? ` — ${draft.subject.trim()}` : ""}`}
                placeholderTextColor={theme.textFaint}
                style={[styles.input, { color: theme.text, borderColor: theme.line }]}
              />
            </Field>

            <Field label="WATCH" theme={theme}>
              <WatchOption
                label="When ordered"
                detail="Sits quiet until you task it from a contact."
                theme={theme}
                selected={draft.watch.kind === "standing"}
                onPress={() => controller.updateStationDraft({ watch: { kind: "standing" } })}
              />
              <WatchOption
                label="On report"
                detail="Runs when you come to the bridge, at most once every five minutes."
                theme={theme}
                selected={draft.watch.kind === "on-report"}
                onPress={() => controller.updateStationDraft({ watch: { kind: "on-report" } })}
              />
              <WatchOption
                label="On a clock"
                detail="Wakes on an interval while you have the bridge open. It does not run in the background."
                theme={theme}
                selected={draft.watch.kind === "interval"}
                onPress={() =>
                  controller.updateStationDraft({ watch: { kind: "interval", everyMinutes: 30 } })
                }
              />

              {draft.watch.kind === "interval" ? (
                <View style={styles.intervalRow}>
                  {[15, 30, 60, 180].map(minutes => (
                    <Pressable
                      key={minutes}
                      accessibilityRole="button"
                      accessibilityState={{
                        selected:
                          draft.watch.kind === "interval" && draft.watch.everyMinutes === minutes,
                      }}
                      onPress={() =>
                        controller.updateStationDraft({
                          watch: { kind: "interval", everyMinutes: minutes },
                        })
                      }
                      style={({ pressed }) => [
                        styles.intervalChip,
                        {
                          borderColor:
                            draft.watch.kind === "interval" && draft.watch.everyMinutes === minutes
                              ? theme.accent
                              : theme.line,
                          backgroundColor:
                            draft.watch.kind === "interval" && draft.watch.everyMinutes === minutes
                              ? theme.accentSoft
                              : "transparent",
                        },
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text
                        style={[
                          styles.intervalText,
                          { color: theme.text, fontFamily: theme.fontMono },
                        ]}
                      >
                        {minutes < 60 ? `${minutes}M` : `${minutes / 60}H`}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </Field>

            {/* Depth is meaningless for a post that never expands anything, so it is only
                offered where it changes something. */}
            {!isOfflineDuty(draft.duty) ? (
              <Field label="HOW DEEP, UNPROMPTED" theme={theme}>
                <View style={styles.intervalRow}>
                  {Array.from({ length: MAX_DEPTH_CAP + 1 }, (_, level) => (
                    <Pressable
                      key={level}
                      accessibilityRole="button"
                      accessibilityState={{ selected: draft.depthCap === level }}
                      onPress={() => controller.updateStationDraft({ depthCap: level })}
                      style={({ pressed }) => [
                        styles.intervalChip,
                        {
                          borderColor: draft.depthCap === level ? theme.accent : theme.line,
                          backgroundColor:
                            draft.depthCap === level ? theme.accentSoft : "transparent",
                        },
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text
                        style={[
                          styles.intervalText,
                          { color: theme.text, fontFamily: theme.fontMono },
                        ]}
                      >
                        {level}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={[styles.hint, { color: theme.textFaint, fontFamily: theme.fontSans }]}>
                  {draft.depthCap === 0
                    ? "It raises what it finds and stops. You choose what gets sounded deeper."
                    : `It follows its own findings ${draft.depthCap} ${draft.depthCap === 1 ? "level" : "levels"} down before waiting for you.`}
                </Text>
              </Field>
            ) : null}

            {bridge.error ? (
              <Text style={[styles.error, { color: theme.danger, fontFamily: theme.fontMono }]}>
                {bridge.error}
              </Text>
            ) : null}
          </ScrollView>

          <View style={[styles.footer, { borderTopColor: theme.line }]}>
            <Pressable
              accessibilityRole="button"
              disabled={!canCommission}
              onPress={() => void controller.commissionStation()}
              style={({ pressed }) => [
                styles.commitButton,
                { backgroundColor: theme.accent, opacity: canCommission ? 1 : 0.4 },
                pressed && { opacity: 0.7 },
              ]}
            >
              <Text
                style={[
                  styles.commitText,
                  { color: theme.accentInk, fontFamily: theme.fontMono },
                ]}
              >
                PUT ON WATCH
              </Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </ModalSurface>
    </Modal>
  );
}

function DutyOption({
  duty,
  theme,
  selected,
  onPress,
}: {
  duty: StationDuty;
  theme: GriotTheme;
  selected: boolean;
  onPress: () => void;
}) {
  const tone = dutyTone(duty, theme);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.option,
        {
          borderColor: selected ? tone : theme.line,
          backgroundColor: selected ? theme.accentSoft : theme.panel,
        },
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.optionRail, { backgroundColor: tone }]} />
      <View style={styles.optionBody}>
        <View style={styles.optionHead}>
          <Text style={[styles.optionLabel, { color: theme.text, fontFamily: theme.fontMono }]}>
            {DUTY_LABELS[duty].toUpperCase()}
          </Text>
          {isOfflineDuty(duty) ? (
            <Text
              style={[styles.offlineTag, { color: theme.evidence, fontFamily: theme.fontMono }]}
            >
              NO MODEL
            </Text>
          ) : null}
        </View>
        <Text style={[styles.optionBrief, { color: theme.textMuted, fontFamily: theme.fontSans }]}>
          {DUTY_BRIEFS[duty]}
        </Text>
      </View>
    </Pressable>
  );
}

function WatchOption({
  label,
  detail,
  theme,
  selected,
  onPress,
}: {
  label: string;
  detail: string;
  theme: GriotTheme;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.option,
        {
          borderColor: selected ? theme.accent : theme.line,
          backgroundColor: selected ? theme.accentSoft : theme.panel,
        },
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.optionBody}>
        <Text style={[styles.optionLabel, { color: theme.text, fontFamily: theme.fontMono }]}>
          {label.toUpperCase()}
        </Text>
        <Text style={[styles.optionBrief, { color: theme.textMuted, fontFamily: theme.fontSans }]}>
          {detail}
        </Text>
      </View>
    </Pressable>
  );
}

function subjectPlaceholder(duty: StationDuty): string {
  switch (duty) {
    case "science":
      return "Eigenvectors";
    case "engineering":
      return "WebGPU rendering";
    case "navigation":
      return "Ship a real-time renderer";
    case "comms":
      return "Keep pushing me on the parts I avoid";
    default:
      return "";
  }
}

function Field({
  label,
  theme,
  children,
}: {
  label: string;
  theme: GriotTheme;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: theme.textMuted, fontFamily: theme.fontMono }]}>
        {label}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  pressed: { opacity: 0.75 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 56,
    paddingHorizontal: 18,
    borderBottomWidth: 1,
  },
  eyebrow: { fontSize: TypeScale.label, fontWeight: "900", letterSpacing: 1.4 },
  close: { minHeight: Structure.tap, justifyContent: "center" },
  closeText: { fontSize: TypeScale.label, fontWeight: "800" },
  body: { flex: 1 },
  content: { padding: 18 },
  field: { marginBottom: 22, gap: 8 },
  fieldLabel: { fontSize: TypeScale.label, fontWeight: "800", letterSpacing: 1 },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: Structure.radiusControl,
    paddingHorizontal: 12,
    fontSize: TypeScale.body,
  },
  textarea: {
    minHeight: 88,
    borderWidth: 1,
    borderRadius: Structure.radiusControl,
    paddingHorizontal: 12,
    paddingTop: 12,
    fontSize: TypeScale.meta,
    textAlignVertical: "top",
  },
  hint: { fontSize: TypeScale.meta, lineHeight: 19 },
  option: {
    borderWidth: 1,
    borderRadius: Structure.radiusControl,
    flexDirection: "row",
    overflow: "hidden",
    minHeight: Structure.tap,
  },
  optionRail: { width: Structure.rail, alignSelf: "stretch" },
  optionBody: { flex: 1, paddingHorizontal: 12, paddingVertical: 10, gap: 3 },
  optionHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  optionLabel: { fontSize: TypeScale.meta, fontWeight: "900", letterSpacing: 1 },
  offlineTag: { fontSize: TypeScale.label, fontWeight: "800", letterSpacing: 0.8 },
  optionBrief: { fontSize: TypeScale.meta, lineHeight: 19 },
  intervalRow: { flexDirection: "row", gap: 8 },
  intervalChip: {
    minWidth: 52,
    minHeight: Structure.tap,
    borderWidth: 1,
    borderRadius: Structure.radiusElbow,
    alignItems: "center",
    justifyContent: "center",
  },
  intervalText: { fontSize: TypeScale.meta, fontWeight: "900", letterSpacing: 0.6 },
  error: { fontSize: TypeScale.meta, lineHeight: 19, marginBottom: 12 },
  footer: { padding: 16, borderTopWidth: 1 },
  commitButton: {
    minHeight: Structure.tapLarge,
    borderRadius: Structure.radiusControl,
    justifyContent: "center",
    alignItems: "center",
  },
  commitText: { fontSize: TypeScale.bodyStrong, fontWeight: "900", letterSpacing: 1 },
});
