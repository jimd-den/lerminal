import React from "react";
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { AppState, GriotController } from "../../../adapters/presenters/GriotController";
import { evidenceKindLabel, ResearchResult } from "../../../entities/research";
import { ModalSurface } from "./ModalSurface";
import { GriotTheme } from "./theme";

/**
 * # Research Results Sheet
 *
 * ## Business Value & Purpose
 * The inspectable results screen for "Research on the web" (Phase 3): every candidate
 * shows its evidence kind, a heuristic relevance label, and plain-language cautions —
 * never an opaque credibility score. Keep/Reject/Extract/Open are large, labeled actions.
 * "Create cited brief" only enables once at least one candidate is kept, and the brief is
 * synthesized strictly from kept (optionally extracted) evidence — see
 * `CreateResearchBriefInteractor`.
 */
export function ResearchResultsSheet({
  controller,
  state,
  theme,
}: {
  controller: GriotController;
  state: AppState;
  theme: GriotTheme;
}) {
  const keptCount = state.researchResults.filter(r => r.keepState === "kept").length;

  return (
    <Modal
      visible={state.isResearchOpen}
      animationType="slide"
      onRequestClose={() => controller.closeResearch()}
    >
      <ModalSurface theme={theme} style={styles.root}>
        <View style={[styles.header, { borderBottomColor: theme.line }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.eyebrow, { color: theme.accent, fontFamily: theme.fontMono }]}>
              WEB EVIDENCE
            </Text>
            <Text numberOfLines={1} style={[styles.title, { color: theme.text }]}>
              {state.researchQuery || "Research"}
            </Text>
          </View>
          <Pressable onPress={() => controller.closeResearch()} style={styles.close}>
            <Text style={[styles.closeText, { color: theme.accent, fontFamily: theme.fontMono }]}>
              CLOSE
            </Text>
          </Pressable>
        </View>

        {state.researchLoading && state.researchResults.length === 0 ? (
          <View style={styles.centerFill}>
            <ActivityIndicator color={theme.accent} />
            <Text style={[styles.loadingText, { color: theme.textMuted }]}>Searching the web…</Text>
          </View>
        ) : state.researchError ? (
          <View style={styles.centerFill}>
            <Text style={[styles.errorTitle, { color: theme.danger }]}>Search failed</Text>
            <Text style={[styles.errorBody, { color: theme.textMuted }]}>{state.researchError}</Text>
          </View>
        ) : (
          <ScrollView style={styles.body} contentContainerStyle={styles.content}>
            {state.researchResults.length === 0 ? (
              <Text style={[styles.errorBody, { color: theme.textMuted }]}>No results.</Text>
            ) : (
              state.researchResults.map((result) => (
                <ResultCard
                  key={result.url}
                  result={result}
                  theme={theme}
                  onKeep={() => controller.setResearchKeepState(result.url, result.keepState === "kept" ? "undecided" : "kept")}
                  onReject={() => controller.setResearchKeepState(result.url, result.keepState === "rejected" ? "undecided" : "rejected")}
                  onOpen={() => void Linking.openURL(result.url)}
                  onExtract={() => void controller.extractResearchResult(result.url)}
                  onSaveAsSource={() => void controller.saveResearchResultAsSource(result.url)}
                  extracting={state.researchLoading}
                />
              ))
            )}
          </ScrollView>
        )}

        <View style={[styles.footer, { borderTopColor: theme.line, backgroundColor: theme.panelMuted }]}>
          <Text style={[styles.footerCount, { color: theme.textMuted, fontFamily: theme.fontMono }]}>
            {keptCount} KEPT
          </Text>
          <Pressable
            disabled={keptCount === 0 || state.isCreatingBrief}
            onPress={() => void controller.createResearchBrief()}
            style={({ pressed }) => [
              styles.briefButton,
              { backgroundColor: theme.accent, opacity: keptCount === 0 || state.isCreatingBrief ? 0.4 : 1 },
              pressed && { opacity: 0.7 },
            ]}
          >
            {state.isCreatingBrief ? (
              <ActivityIndicator color={theme.accentInk} />
            ) : (
              <Text style={[styles.briefButtonText, { color: theme.accentInk, fontFamily: theme.fontMono }]}>
                CREATE CITED BRIEF
              </Text>
            )}
          </Pressable>
        </View>
      </ModalSurface>
    </Modal>
  );
}

function ResultCard({
  result,
  theme,
  onKeep,
  onReject,
  onOpen,
  onExtract,
  onSaveAsSource,
  extracting,
}: {
  result: ResearchResult;
  theme: GriotTheme;
  onKeep: () => void;
  onReject: () => void;
  onOpen: () => void;
  onExtract: () => void;
  onSaveAsSource: () => void;
  extracting: boolean;
}) {
  const kept = result.keepState === "kept";
  const rejected = result.keepState === "rejected";
  const borderColor = kept ? theme.accent : rejected ? theme.danger : theme.line;

  return (
    <View style={[styles.card, { backgroundColor: theme.panelStrong, borderColor }]}>
      <Text style={[styles.cardDomain, { color: theme.textFaint, fontFamily: theme.fontMono }]}>
        {result.domain} · {evidenceKindLabel(result.evidenceKind)}
      </Text>
      <Text numberOfLines={2} style={[styles.cardTitle, { color: theme.text }]}>{result.title}</Text>
      <Pressable onPress={onOpen} hitSlop={4}>
        <Text
          selectable
          numberOfLines={1}
          style={[styles.cardUrl, { color: theme.accent, fontFamily: theme.fontMono }]}
        >
          {result.url}
        </Text>
      </Pressable>
      <Text selectable numberOfLines={3} style={[styles.cardSnippet, { color: theme.textMuted }]}>
        {result.extractedText ? result.extractedText.slice(0, 220) : result.snippet}
      </Text>
      <Text style={[styles.relevance, { color: relevanceColor(result.relevance, theme) }]}>
        {result.relevance}
      </Text>
      {result.cautions.map((caution, i) => (
        <Text key={i} style={[styles.caution, { color: theme.warning }]}>⚠ {caution}</Text>
      ))}
      {result.extractedText ? (
        <Text style={[styles.extractedBadge, { color: theme.accent, fontFamily: theme.fontMono }]}>
          FULL TEXT EXTRACTED
        </Text>
      ) : null}
      {result.savedCardId ? (
        <Text style={[styles.extractedBadge, { color: theme.accent, fontFamily: theme.fontMono }]}>
          ✓ SAVED AS SOURCE CARD
        </Text>
      ) : null}

      <View style={styles.actions}>
        <ActionButton label={kept ? "KEPT" : "KEEP"} active={kept} theme={theme} onPress={onKeep} />
        <ActionButton label={rejected ? "REJECTED" : "REJECT"} active={rejected} danger theme={theme} onPress={onReject} />
        <ActionButton label="OPEN" theme={theme} onPress={onOpen} />
        {!result.extractedText ? (
          <ActionButton label="EXTRACT" theme={theme} onPress={onExtract} disabled={extracting} />
        ) : null}
        <ActionButton
          label={result.savedCardId ? "SAVED" : "SAVE AS SOURCE"}
          active={Boolean(result.savedCardId)}
          theme={theme}
          onPress={onSaveAsSource}
          disabled={Boolean(result.savedCardId)}
        />
      </View>
    </View>
  );
}

function relevanceColor(relevance: ResearchResult["relevance"], theme: GriotTheme): string {
  if (relevance === "High relevance") return theme.accent;
  if (relevance === "Possibly relevant") return theme.textMuted;
  return theme.textFaint;
}

function ActionButton({
  label,
  theme,
  onPress,
  active,
  danger,
  disabled,
}: {
  label: string;
  theme: GriotTheme;
  onPress: () => void;
  active?: boolean;
  danger?: boolean;
  disabled?: boolean;
}) {
  const color = active ? (danger ? theme.danger : theme.accent) : theme.textMuted;
  return (
    <Pressable
      disabled={disabled}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        { borderColor: active ? color : theme.line, opacity: disabled ? 0.4 : 1 },
        pressed && { opacity: 0.7 },
      ]}
    >
      <Text style={[styles.actionButtonText, { color, fontFamily: theme.fontMono }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", minHeight: 64, paddingHorizontal: 18, borderBottomWidth: 1 },
  eyebrow: { fontSize: 12, fontWeight: "900", letterSpacing: 1.4 },
  title: { fontSize: 18, fontWeight: "700", marginTop: 2 },
  close: { minHeight: 44, minWidth: 44, justifyContent: "center", alignItems: "flex-end" },
  closeText: { fontSize: 12, fontWeight: "800" },
  centerFill: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, padding: 24 },
  loadingText: { fontSize: 13 },
  errorTitle: { fontSize: 16, fontWeight: "700" },
  errorBody: { fontSize: 13, textAlign: "center", lineHeight: 19 },
  body: { flex: 1 },
  content: { padding: 16 },
  card: { borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 12 },
  cardDomain: { fontSize: 12, fontWeight: "800", letterSpacing: 0.6, marginBottom: 4 },
  cardTitle: { fontSize: 15, fontWeight: "700", lineHeight: 20 },
  cardUrl: { fontSize: 12, marginTop: 4, minHeight: 18 },
  cardSnippet: { fontSize: 13, lineHeight: 18, marginTop: 6 },
  relevance: { fontSize: 12, fontWeight: "800", marginTop: 8 },
  caution: { fontSize: 12, lineHeight: 16, marginTop: 3 },
  extractedBadge: { fontSize: 12, fontWeight: "800", marginTop: 6 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  actionButton: { minHeight: 44, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, justifyContent: "center", alignItems: "center" },
  actionButtonText: { fontSize: 12, fontWeight: "800", letterSpacing: 0.5 },
  footer: { flexDirection: "row", alignItems: "center", minHeight: 72, paddingHorizontal: 16, borderTopWidth: 1, gap: 12 },
  footerCount: { fontSize: 12, fontWeight: "800" },
  briefButton: { flex: 1, minHeight: 48, borderRadius: 10, justifyContent: "center", alignItems: "center" },
  briefButtonText: { fontSize: 13, fontWeight: "800" },
});
