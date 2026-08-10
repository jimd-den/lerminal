# Bridge v2 — design plan

Status: **Phase 1 implemented.** Phases 2–5 are scoped, not built — each needs either a
product decision or a new native dependency this doc flags explicitly, so none of them get
pulled in silently.

## The request, as actually said

> the bridge should be an agentic message board, and think tank should actually be able to
> use multiple different models... scores sources... never trust AI but allow ai to do
> anything... push almost like a full featured Wikipedia, get rid of the time constraints,
> the user should be able to add timed events... leave the app for ai to do it's thing
> async... create it's own agents... highlighting any sentence and piping it... another
> agent that is skeptical of everything ai

Nine distinct capabilities. Three got clarified directly (see below); the rest are scoped
here so "implement fully, no shortcuts" means something real per item instead of a shallow
pass across all nine.

## What got clarified, and what that settles

**Async, decided:** scheduled watches queue proposals; nothing ever touches the workspace
without a tap. The Bridge's stations already work exactly this way — Phase 2 is *only*
about letting a watch fire while the app isn't in foreground, which is a platform question
(below), not a trust-model question. The trust model does not move.

**Multi-model, decided:** both directions apply — voices keep their own pinned models
(already true) *and* a new "ask N models, compare" capability is real scope (Phase 3) —
*and* every agent call gets a reasoning/"non-thinking" toggle (Phase 1, done).

**"Scores sources", replaced:** the actual ask was raw-format ingestion — upload a file,
keep it exactly as given, index it by its *own* structure (PDF bookmarks, EPUB TOC), and
offer OCR/ranking as an annotation layer that can never delete text. This is Phase 4, and
it is the single largest item in this list — real PDF/EPUB parsing needs a real dependency
decision before a line of it gets written.

## Phase 1 — implemented this pass

Three pieces, each complete, each consistent with the app's existing architecture, none
needing a new dependency.

### 1. The Skeptic — a standing voice that challenges, not agrees

Every roundtable `roundtable-architect` designs is told to write voices that disagree —
but nothing *guarantees* one of them actually pushes back rather than three variations on
agreeable. The Skeptic is a **built-in persona**, always offerable, whose entire job is
"assume every claim in this room is wrong until it's been checked" — reachable from any
think tank as a one-tap addition, not something the architect has to be trusted to invent
correctly every time.

- `entities/assistantProfile.ts` — a `BUILTIN_SKEPTIC_PROFILE`, seeded the same way
  `BUILTIN_CHAT_PROFILE` already is, never deletable, always available to add to a table.
- `ThinkTankSheet` — an "ADD THE SKEPTIC" toggle alongside the topic field, so convening a
  table can seat it from the start rather than requiring a second trip.

### 2. The reasoning toggle — "non-thinking" per send

`OpenRouterAgentGateway` already requests extended reasoning by default
(`REASONING_REQUEST`). There was no way to turn it off per-call, which matters because
reasoning tokens cost real money and real latency on a call the user may just want fast —
a quick "push deeper" ping doesn't need the model to deliberate.

- `AgentGateway.designWorkspaceAgentTurn` — new optional `reasoning?: boolean` input,
  default `true` (unchanged behavior when omitted).
- `ThinkTankWorkflow.post`/`convene` — takes an optional `reasoning` flag, threaded to the
  gateway call.
- `ThinkTankBoard` — a small 🧠/⚡ toggle in the composer, persisted per-thread (a table
  convened "fast" stays fast for follow-ups unless switched).

### 3. The universal pipe — highlight any sentence, anywhere an agent wrote one

The think tank board already had tap-a-sentence-to-critique. Generalized into a small,
reusable menu — `entities/sentencePipe.ts` + `griot/SentencePipeMenu.tsx` — offering
**Critique**, **Save as note**, **Ask a specific voice**, and **Search the web**, attached
to *any* rendered agent reply (think tank posts, and — newly — Ask GRIOT's own bubbles,
which only had critique before). One component, one behavior, everywhere text came from a
model.

## Phase 2 — scheduled watches while the app is backgrounded

**Not started. Needs a platform decision first.**

Bridge stations already run on a schedule — but only while the Bridge screen is mounted
(`BridgeScreen`'s own `setInterval`, torn down the instant you navigate away). "Leave the
app and let it work" means a watch has to fire with **no screen mounted at all**, which is
a different mechanism entirely:

- **`expo-task-manager` + `expo-background-fetch`** — the standard Expo path. OS-scheduled,
  runs on its own budget (Android: flexible interval, often 15+ minutes; iOS: opportunistic,
  no guaranteed cadence — Apple decides when, not the app). A user who commissions a
  30-minute clock watch would not actually get one on iOS; the honest framing is "runs when
  the OS lets it," not "runs every 30 minutes."
- Every constraint the app already enforces (`REPORT_COOLDOWN_MS`, `MIN_WATCH_MINUTES`,
  `MAX_STATIONS`) still applies — background execution changes *when* a watch fires, not
  *whether* it's allowed to act unattended, which it still isn't: a background watch still
  only raises contacts, never dispatches.

This needs a go/no-go on adding a new native dependency before any code gets written.

## Phase 3 — multi-model comparison

**Not started. Needs a UI decision first.**

Distinct from "different voices, different models" (already true): one prompt, fanned out
to several models in parallel, shown side by side with none marked "the" answer.

- `usecases/thinkTank/CompareModelsInteractor.ts` — takes a prompt + a list of models,
  returns N independent `designWorkspaceAgentTurn` results, no synthesis, no ranking.
- A new `ThinkTankReadout` shape (`{ shape: "comparison", answers: [...] }`) — a genuinely
  new column layout, not a reuse of the existing post stream, since "compare" only means
  something read side by side, not scrolled past sequentially.

## Phase 4 — raw-format ingestion

**Not started. The largest item, and the one most in need of scoping before a line is
written.**

- **Plain text** — trivial, no new dependency: save exactly what was uploaded, expose it
  unmodified.
- **PDF, indexed by its own bookmarks** — needs a PDF outline parser. No pure-JS option in
  this codebase's current dependency set reads a PDF outline reliably; this is a real
  library decision (`pdf-lib`, `pdfjs-dist`, or a native module) and a real bundle-size
  cost on a mobile app.
- **EPUB, indexed by its own TOC, per version** — EPUB's TOC format changed between
  versions (NCX in EPUB 2, a nav document in EPUB 3); "respecting each version's specific
  TOC" means parsing both, correctly, which is its own scoped piece of work.
- **OCR / ranker API, annotate-only, never delete text** — OCR needs either a device-native
  API (`expo-image-picker` + a vision API, or a cloud OCR call) or a bundled model; a
  "ranker" that indexes without ever removing the source text is a real invariant to
  design against from the start (the same non-destructive discipline `agentTags.ts` already
  applies to the tag grammar — visible, never silently dropped).

None of this should start without confirming which format matters first and which
dependency is acceptable — PDF and EPUB parsing are not small additions.

## Phase 5 — user-created custom agents

**Partially exists, not extended this pass.** `AssistantProfile` + the roundtable architect
already let a user write or generate a persona. What's missing, if the ask goes further
than that: a **station duty** the user defines themselves (today's six are a closed,
code-defined set — `entities/bridge.ts`'s `StationDuty` union). Making that open means a
custom duty needs its own brief-template and its own readout-assembly rule (see
`usecases/bridge/stationDuty.ts`), which is real per-duty logic, not just a name and a
system prompt. Needs a decision on how much of that the user actually gets to define versus
picking a template.

## What's still open

- **"Get rid of the time constraints"** — unclear which constraints. If it means
  `REPORT_COOLDOWN_MS`/`MIN_WATCH_MINUTES`, those exist specifically so returning to the
  Bridge repeatedly doesn't burn the API budget; removing them needs to be a deliberate
  choice, not a default.
- **"Never trust AI but allow AI to do anything"** — as stated this reads as two opposite
  instructions. The app's whole design already lives in the middle: AI can propose
  anything, the user decides what's trusted enough to keep. If something more specific was
  meant, it needs its own sentence.
