import { StyleSheet } from "react-native";

/**
 * # Shared Screen Styles
 *
 * ## Business Value & Purpose
 * The five deck screens share one visual language — the same panel silhouettes, the same
 * gutters, the same slab proportions. Keeping their styles together is what makes them
 * read as one instrument rather than five apps stapled together: a change to the
 * console's look happens in one place instead of five.
 *
 * This is deliberately *not* a per-screen split. Duplicating these declarations across
 * five files would let the screens drift apart silently, which is the exact failure this
 * sheet prevents. What was split out of the old 1,385-line `screens.tsx` was the
 * *markup* — the part that genuinely differs per screen.
 */
export const styles = StyleSheet.create({
  screen: { flex: 1 },
  // The bottom inset clears the floating Ask and Capture affordances, stacked above the
  // nav, so the last item in a list is never stranded underneath either of them.
  content: { paddingHorizontal: 16, paddingBottom: 160 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },
  intro: { fontSize: 15, lineHeight: 22, marginHorizontal: 3, marginBottom: 4 },
  kicker: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "900",
    letterSpacing: 1.3,
  },
  pendingPanel: {
    minHeight: 68,
    borderRadius: 13,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    marginTop: 12,
  },
  pendingCopy: { marginLeft: 13, flex: 1 },
  pendingTitle: { fontSize: 14, fontWeight: "700" },
  pendingMeta: { marginTop: 2, fontSize: 12 },
  pendingAction: {
    minWidth: 48,
    minHeight: 48,
    justifyContent: "center",
    alignItems: "center",
  },
  pendingActionText: { fontSize: 12, fontWeight: "900" },
  spaceStatus: {
    minHeight: 88,
    borderRadius: 14,
    borderWidth: 1,
    padding: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  statusTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "700",
    marginTop: 3,
  },
  compactButton: {
    minHeight: 48,
    minWidth: 79,
    borderRadius: 9,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 12,
  },
  compactButtonText: { fontSize: 14, fontWeight: "800" },
  chipRow: { paddingRight: 12 },
  modeRow: { flexDirection: "row", gap: 7 },
  modeButton: {
    flex: 1,
    minHeight: 47,
    borderRadius: 9,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  modeText: { fontSize: 12, fontWeight: "900", letterSpacing: 0.8 },
  overview: { borderRadius: 15, borderWidth: 1, padding: 17, marginTop: 13 },
  overviewText: { fontSize: 19, fontWeight: "700", marginTop: 8 },
  overviewMeta: { fontSize: 12, marginTop: 6 },
  studyCommands: { marginTop: 13 },
  commandSlab: {
    minHeight: 62,
    borderRadius: 11,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  commandCode: {
    width: 65,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  commandTitle: { flex: 1, fontSize: 15, fontWeight: "700" },
  commandArrow: { fontSize: 15, fontWeight: "900" },
  contextPanel: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 13,
  },
  contextTitle: {
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1,
    marginBottom: 9,
  },
  intentGrid: { flexDirection: "row", flexWrap: "wrap", rowGap: 8 },
  terminal: {
    minHeight: 330,
    borderRadius: 17,
    borderWidth: 1,
    marginTop: 17,
    padding: 16,
  },
  terminalHead: { flexDirection: "row", justifyContent: "space-between" },
  terminalMode: { fontSize: 12, fontWeight: "900", letterSpacing: 1.1 },
  terminalCursor: { fontSize: 12 },
  terminalInput: {
    minHeight: 180,
    textAlignVertical: "top",
    fontSize: 17,
    lineHeight: 26,
    paddingTop: 22,
    paddingHorizontal: 0,
  },
  routeButton: {
    minHeight: 58,
    borderRadius: 11,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  routeGlyph: { fontSize: 18, fontWeight: "900" },
  routeText: { fontSize: 16, fontWeight: "800" },
  commandHelp: { fontSize: 13, lineHeight: 24, letterSpacing: 0.3 },
  commandHint: { fontSize: 13, lineHeight: 19, marginTop: 5 },
  empty: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 13,
    padding: 22,
    alignItems: "center",
  },
  emptyCode: { fontSize: 12, fontWeight: "800", letterSpacing: 1 },
  emptyText: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    marginTop: 7,
  },
  selectionHint: { fontSize: 12, lineHeight: 17, marginTop: 8 },
  viewAllRow: { minHeight: 44, justifyContent: "center", alignItems: "center" },
  viewAllLink: { fontSize: 12, fontWeight: "800", letterSpacing: 1 },
});
