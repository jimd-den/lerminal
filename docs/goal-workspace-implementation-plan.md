# Goal Workspace Evolution — Implementation Plan

Status: living document, updated at the end of each phase.
Scope: turn Learnimal (app metadata still says "Chunk Buddy") into a goal-driven,
trustworthy, touch-first learning/capstone workspace, per the product spec. This
document is the Phase 0 deliverable: a reconnaissance map plus a phased plan.

## 0. Baseline (measured, not assumed)

- Runtime: `bun test` → **133 pass / 0 fail** across 31 files (current baseline before any change in this effort).
- Typecheck: `npx tsc --noEmit` (project `tsconfig.json` extends `expo/tsconfig.base`, `strict: true`).
  - **Zero errors in non-test `src/` files.**
  - Pre-existing errors, all confined to `__tests__/*`, already present before this effort:
    - Most files: `Cannot find module 'bun:test'` — `bun-types` isn't in `tsconfig`'s `types`, so `tsc` (not `bun test`) can't resolve the ambient test globals. `bun test` itself is unaffected; this is a `tsc`-only gap.
    - `interactors.test.ts`, `pipeline.test.ts`: workspace literals missing `fsrsConfig` (added to `Workspace` after these fixtures were written).
    - `customCommands.test.ts`: `CommandFactoryDeps` test call missing `getRunner`; a `CommandContext` literal missing required `chunkSystemPrompt`.
    - `MainLayout.test.tsx`: uses `fs`/`path`/`__dirname` without `@types/node`.
  - None of this blocks `bun test` (which passes). I will not "fix" these opportunistically outside the phases that touch those files — noting them here so regressions I introduce are distinguishable from this pre-existing noise. If a phase's own tests would collide with the `fsrsConfig`/`getRunner` gaps, I'll fix those specific fixtures as part of that phase.
- No lint script/config exists (no `.eslintrc*`, no `lint` script). Quality gates for this effort are `bun test` + `npx tsc --noEmit`.
- `bun.lock` was deleted and `package-lock.json` is modified in the working tree (pre-existing, not caused by this effort) — both `bun` and `npm` are present; I'll keep using `bun test` since it's the package.json-declared script and is faster.
- Branch `feat/prompt-designer-output-contracts` has **no commits** beyond `master` (`git merge-base master HEAD` == `HEAD`) — everything currently in `git status` (the prompt-preset/output-contract/assistant-profile/chat/FSRS-5/custom-command work) is **uncommitted working-tree state**, not yet committed. This plan's phases will be committed incrementally on top of that existing uncommitted work per the user's instruction to prefer small, reviewable commits.

## 1. Architecture map — what exists today, file by file

### Entities (`src/entities/`)
| File | Purpose |
|---|---|
| `card.ts` | `Card` — universal unit. `type: CardType` (`source,chunk,question,note,group,search,chat,cloze,elaboration,interactive`), optional `typeId` (modular type registry), optional `fields` (per-type structured data), `parentId` (tree), `sourceRef`, `cite`, `schedule?`. |
| `cardTypeDefinition.ts` | `CardTypeDefinition` registry (built-in + custom types), `LearningBehavior` (`none/flashcard/cloze/elaboration`), `isSchedulable()`. |
| `commandDefinition.ts` | User-defined commands: `AgentCommandDefinition` (custom system prompt) and `PipelineCommandDefinition` (saved macro with `$1`/`$ARG` substitution). `RESERVED_COMMAND_NAMES` lists all 16 built-ins. |
| `promptPreset.ts` | Instruction presets + the **output contract** mechanism: `composeCardPrompt(instruction, contract)` appends a strict, non-editable JSON-shape contract (`cards-v1`, `chunks-v1`) after the user/profile instruction, so any instruction still yields parseable output. |
| `assistantProfile.ts` | `AssistantProfile` (goal-specific persona: capability + systemPrompt + outputContract). `resolveAssistantProfile()` picks the active profile per capability with builtin fallback. This is the closest existing thing to a "scope" concept, but it governs *instruction*, not *context/web/output/destination* — those still don't exist. |
| `schedule.ts` | FSRS `ScheduleState`, `ReviewLog`, legacy `gradeSchedule()` fallback. |
| `cloze.ts` | Cloze template parse/answer-match helpers. |
| `workspace.ts` | `Workspace { id, name, createdAt, fsrsConfig }`. **No goal/mission fields exist yet** — this is exactly what Phase 1A adds. |

### Use cases (`src/usecases/`)
- `pipeline/Command.ts` — the port: `PipelineCommand.execute(arg, ctx): Promise<CommandResult>`, `CommandResult = {kind:"cards"|"needsInput"|"review"|"noop"}`. `CommandContext` carries `inputCards`, `workspaceId`, `parentId`, `apiKey`, `model`, profiles, card types, `expansionStack`.
- `pipeline/PipelineRunner.ts` — parses `a "x" | b | c` (quote/escape-aware), threads `cards` output → next stage's `inputCards`, halts on `needsInput`/`review`.
- `pipeline/CommandFactory.ts` — turns a `CommandDefinition` into a runnable `PipelineCommand` (the single extension point for new command kinds).
- 16 built-in commands, one file each: `AskCommand`, `SourceCommand` (URL/text ingest via `ExtractionGateway`), `ChunkCommand` (AI semantic chunk with structural-split fallback), `SplitCommand` (deterministic structural split), `RecallCommand`, `SpaceCommand` (FSRS enroll), `ReviewCommand` (halts pipeline, presenter opens review), `MoveCommand`, `GroupCommand`/`UngroupCommand`, `DeleteCommand`, `SearchCommand` (DuckDuckGo via `SearchGateway`, stores raw JSON results in a `search`-type card body), `ClozeCommand`, `ElaborateCommand`, `ChatCommand`, `NoteCommand` (zero-AI direct capture), `CustomAgentCommand`, `PipelineMacroCommand`.
- `review/` — `FsrsScheduler` (FSRS-5 math + `preview()` for the 4 grade buttons), `StartReviewInteractor` (builds due/cram queue, interleaves by topic), `GradeReviewInteractor` (applies grade, writes `ReviewLog` if a `ReviewLogRepository` is injected).
- `card/` — `CreateNote`, `ExtractUrlInteractor`, `DeleteCardInteractor` (promote-children-by-default, `recursive` flag to nuke subtree), `MarkdownChunkerService`.
- `grouping/GroupCardsInteractor.ts` — the one place that builds group nesting (`selectionRoots` avoids double-nesting existing substructure).
- `tree.ts` — pure helpers: `directChildren`, `collectDescendants`, `expandForPipe` (selecting a group pipes its whole subtree), `breadcrumbPath`, `selectionRoots`.
- `workspace/`, `cardTypes/`, `commands/`, `settings/`, `models/` — thin CRUD interactors wrapping their repositories.
- `errors.ts` — `UseCaseError` subclasses with a `userMessage` the controller maps straight to a toast.

### Adapters (`src/adapters/`)
- `gateways/AgentGateway.ts` (interface): `ask()`, `fetchModels()`, optional `streamChat()`, optional `designAssistantProfile()` (AI Prompt Architect).
- `gateways/SearchGateway.ts`: `search(query): SearchResult[]`.
- `gateways/ExtractionGateway.ts`: `extractText(url): string`.
- `presenters/LearnimalController.ts` (~1850 lines) — the one controller/presenter. Owns split `DomainState`/`UiState`, composes all interactors + the `PipelineRunner`, exposes a flat `AppState` view-model via `subscribe()`. Already has `PendingOperation` (loading/error per in-flight pipeline run) and `OperationResult` (post-run summary: count, destination, one primary action label) — **this is the seed of a run receipt, but it's generic** (`"${n} ${label}s created"`, no scope/web/citation info) and is **not persisted** (lost on app restart, no "Inspect run").
- `presenters/LearningDeckPresenter.ts` — pure view-model functions (`presentLearningDeck`, `presentDocument`, `filterMaterials`) layered on top of `AppState`; no own state.
- `repositories/*Repository.ts` — interfaces only (`CardRepository`, `WorkspaceRepository`, `SettingsRepository`, `CommandDefinitionRepository`, `CardTypeRepository`, `PromptPresetRepository`, `AssistantProfileRepository`, `ReviewLogRepository`). Each has an `AsyncStorage*` impl (`src/frameworks/storage/`) and a `Memory*` impl (tests).

### Frameworks (`src/frameworks/`)
- `network/OpenRouterAgentGateway.ts`, `DuckDuckGoSearchGateway.ts` (HTML-scrapes DDG, returns `[]` on any failure — swallowed, not thrown), `WebExtractionGateway.ts` (Wikipedia API special-case + generic HTML→Markdown via `node-html-markdown`, **throws** on failure — the only gateway that fails loud).
- `ui/MainLayout.tsx` — root screen switcher over 4 "places" (`deck | library | capture | more`) plus 3 always-mounted modals (`CardDetailModal`, `ReviewModal`, `CommandConsoleModal`+`PendingInputModal`). Hardware back button, selection-aware.
- `ui/useControllerState.ts` — subscribes the controller to React state.
- `ui/learningDeck/theme.ts` — `resolveLearningTheme(mode, accent)`: 5 accents × dark/light, HUD-toned palette (`panelStrong`, `line`, `accentSoft`, mono font selection). No reduced-motion handling anywhere yet.
- `ui/learningDeck/components.tsx` — shared primitives: `SystemHeader`, `Slab` (list row, 88pt min height, long-press-to-select), `Chip`, `OperationPanel` (renders `OperationResult` generically — no scope/receipt detail), `BottomNavigation`, `SelectionBar` (Cancel / Organize / Transform / Delete — **"Organize"/"Transform" both just open the generic command modal**, no distinct Explain/Research/Connect/Study actions yet).
- `ui/learningDeck/screens.tsx` — `DeckScreen` (home: continue-learning hero, capture dock, recent activity, pending-operation banner), `LibraryScreen`/`SpaceScreen`/`DocumentScreen` (drill-down), `CaptureScreen` (intent chips `paste/link/note/ask` + a raw `/command` escape hatch — **typing `ask "..."` here gives no preflight, no web indicator, no destination preview; it just runs**).
- `ui/learningDeck/CommandConsoleModal.tsx` — the command palette: pinned chips + a flat `BUILTIN_COMMANDS` list (name + one-line description + category) + custom-command CRUD + a raw pipeline text input. **Tapping any row calls `run(command.name)` immediately — zero preflight for any command, including `ask` and `search`.**
- `ui/learningDeck/CardDetailModal.tsx`, `ReviewModal.tsx`, `SettingsScreen.tsx` (incl. `AssistantDesignerModal` — the AI Prompt Architect UI).
- `App.tsx` — composition root: instantiates every `AsyncStorage*` repo + gateway, builds the one `LearnimalController`.
- `app.json` — `name: "Chunk Buddy"`, `slug: "chunk_buddy"`, bundle id `com.ddsrv.x-chunk-buddy`. Confirms the "still branded Chunk Buddy" note in the brief.

## 2. The trust gaps, precisely (this is what Phases 2–8 fix)

**`ask` vs `search` today:**
- `ask` (`AskCommand`) never touches the network for search — it only calls `AgentGateway.ask()` with the current selection as context. Correct separation exists in code.
- `search` (`SearchCommand`) calls `SearchGateway.search()` (DuckDuckGo) and stores raw JSON in a `search`-type card; it never calls the agent.
- **The gap is entirely in the UI**: `CommandConsoleModal`'s `BUILTIN_COMMANDS` list shows `ask` ("Generate study material with AI") and `search` ("Search configured web sources") as two rows with equal visual weight and no scope/web indicator, and both execute with zero preflight. A user cannot tell before running `ask` that it will *not* browse, or before running `search` that it *will*.

**False-"AI worked" fallback points (the single most important finding of this recon):**
1. **`OpenRouterAgentGateway.ask()`** (`src/frameworks/network/OpenRouterAgentGateway.ts:44-160`) — on **missing API key**, **any fetch/HTTP error**, **any JSON-parse failure**, or **an empty card array**, it silently calls `generateLocalFallback(query)`, which fabricates 4 generic template cards ("Core idea", "Why it matters", "How it works", "Common mistake") worded to sound like real answers. The caller (`AskCommand`, `ChunkCommand`, `CustomAgentCommand`) has no way to distinguish "the model really said this" from "the network died and this is a canned template" — both come back as a normal `AgentCardResponse[]`. This is the exact "false success" behavior item 5 in the brief is about. **Phase 2/8 fix**: the gateway must return a tagged result (or throw) so the use case/controller can label local-fallback output as such in the run receipt, never silently.
2. **`ChunkCommand`** catches AI failure per-source and falls back to `executeFaithfulSplit` (deterministic heading/paragraph split) — this fallback is *reasonable* (it's real, faithful, non-fabricated content) but is currently **invisible**: the resulting cards look identical to AI-chunked ones in the receipt. Needs labeling, not removal.
3. **`SearchCommand`** and `DuckDuckGoSearchGateway` — DDG gateway returns `[]` on any fetch error (swallowed), and `SearchCommand` throws `"No results found"` in that case — this one is honest (it fails loud), just needs a proper error UI state (Phase 8).
4. **`WebExtractionGateway`** throws on failure (also honest); `SourceCommand` catches that and stores the **error message itself** as the card body (`"Extraction failed for ${url}: ${err.message}"`) — this creates a real, persisted `source` card whose body is an error string with no visual distinction from real extracted content. Needs a failure-state card treatment, not a silent normal card.

**Undo, today:** there is no undo of any kind, no operation log persisted, no soft-delete. `OperationResult` (controller) is process-memory-only and only remembers the *last* run's created-card ids — enough to support "Undo last create" for exactly one step if nothing else has run since, but nothing more, and it vanishes on app restart or after the next operation. `DeleteCardInteractor`/`deleteSelection` permanently call `cardRepo.deleteCard()` with no snapshot kept anywhere.
- **Safe undo strategy given current repositories** (no new storage engine): persist a bounded (e.g. last 20, or last N per workspace) `OperationRecord` log via a new `OperationLogRepository` (`AsyncStorage`-backed, same pattern as every other repo). Record: `id, commandName, workspaceId, parentId, inputCardIds, createdCardIds, updatedCardBefore[] (only cards actually mutated in place), deletedCardSnapshots[] (full Card, only for delete/ungroup ops), webUsed, searchQuery?, modelUsed?, startedAt, completedAt, summary`.
  - **Undo create**: delete `createdCardIds` — but only if none of them have been "materially edited" since creation (compare current `card.body`/`title`/`fields` to the snapshot taken at record time; if changed, refuse and say why, per the spec's "do not claim undo succeeded if it only partially succeeded").
  - **Undo delete**: re-`saveCard()` the `deletedCardSnapshots` — safe because `CardRepository.saveCard` is an upsert; if a same-id card already exists (recreated meanwhile), refuse.
  - **Undo group/ungroup**: restore `parentId` on the affected cards from the pre-op snapshot; delete the group card `undo group` created only if no *other* card was reparented into it afterward.
  - **Undo move**: restore `workspaceId`/`parentId` on affected cards from snapshot.
  - This is a straightforward `AsyncStorage`-backed repository plus one new `UndoOperationInteractor` — no architecture change, fits the existing repository pattern exactly.

**Migration strategy (backwards compatibility), concretely:**
- `Card`, `Workspace`, `AppSettings` are all plain JSON blobs in `AsyncStorage` under versioned-looking but unenforced keys (`learnimal_cards_v1`, etc.) with no schema version field and no migration runner today.
- The existing pattern for adding a field safely is already established and battle-tested in this codebase: `Card.typeId` is optional and falls back to `Card.type`; `CardTypeDefinition` registries backfill missing built-ins on load (`loadCardTypes()` in the controller diffs stored vs. `BUILTIN_CARD_TYPES` and persists any that are missing). **I will follow this exact pattern**, not introduce a new migration system:
  - New `Workspace.mission?: WorkspaceMission` — optional, absent = "no mission set," every read site defaults gracefully (`workspace.mission ?? undefined`), no write-time backfill needed since `undefined` round-trips through `JSON.stringify`/`parse` cleanly (unlike `null`, no special-casing needed).
  - New `Card.role?: SemanticRole` — optional, additive, never replaces `Card.type`/`typeId` (per the spec's explicit requirement to keep them separate). Cards without it just don't show a role badge.
  - New `Card.provenance?: Provenance` — optional, additive. Old cards simply have no provenance panel (UI shows "No provenance recorded — created before this feature" rather than fabricating one).
  - New `OperationLogRepository` / `AssistantRunLog` entity — an entirely new storage key, so it starts empty; nothing to migrate.
  - No existing field is renamed, removed, or changed in required-ness anywhere in this plan.

## 3. Phase plan (files to touch, in order)

Each phase ends with `bun test` + `npx tsc --noEmit` (against non-test `src/`) and a commit. I will not start phase N+1 until phase N's tests are green.

- **Phase 0 (this document).** ✅
- **Phase 1 — Domain model.** `entities/workspace.ts` (+`WorkspaceMission`), `entities/card.ts` (+`role?`, +`provenance?` type import), new `entities/provenance.ts` (`Provenance`, `CreationMode`), new `entities/operationLog.ts` (`OperationRecord`), new `adapters/repositories/OperationLogRepository.ts` + `frameworks/storage/AsyncStorageOperationLogRepository.ts` + `Memory` impl. Entity-level tests only (no UI, no pipeline wiring yet).
- **Phase 2 — Explicit AI actions & preflight.** New `usecases/agent/AgentScope.ts` (`AgentRunRequest`), a bounded-context builder respecting max-card/char budget, 6 operation-preset request builders. New preflight bottom sheet component. Reframe `ask` in UI copy only (command stays `ask`).
- **Phase 3 — Web research workflow.** Normalized `ResearchResult`/`ResearchRun` types, a `ResearchInteractor` orchestrating `SearchGateway`→ (keep/reject/extract) → optional cited-synthesis `ask`, new research results screen.
- **Phase 4 — Mission Control + Gap Report.** Compact top-of-canvas module on `DeckScreen`/`SpaceScreen`; deterministic gap-report builder from the card graph + optional agent enrichment.
- **Phase 5 — Capture & selection flows.** Context-sensitive next-actions after capture; selection tray (Explain/Research/Connect/Study/More) replacing the current generic Organize/Transform.
- **Phase 6 — Command palette evolution.** Human-readable labels/purpose/input-output/web-indicator metadata table for all commands in `CommandConsoleModal`.
- **Phase 7 — Visual system.** Reduced-motion respect, HUD vocabulary pass, no new typography system (reuse `theme.ts`).
- **Phase 8 — Undo, error states.** `UndoOperationInteractor` per the strategy above; wire the false-fallback labeling from §2 into `AgentGateway`/`ChunkCommand`/`SourceCommand`; explicit error UI states.
- **Phase 9 — Tests, docs, quality gates.** Fill any coverage gaps named in the brief's acceptance list; update `README.md`/`terminal-learn-prd.md` implementation-status sections.

## 4. Explicit tradeoffs taken

- **No new state library, no schema-migration framework** — reusing the existing optional-field + backfill-on-load pattern already proven by `cardTypes`/`promptPresets`/`assistantProfiles`.
- **Undo is log-based, not a general command-pattern undo stack** — bounded, per-operation, safety-checked (refuses rather than partially applying), matching the brief's "do not claim undo succeeded if it only partially succeeded."
- **`ask` command name is kept** (the brief says "do not remove `ask`") — only its UI framing and preflight change; scope selection is additive UI state on top of the same `AskCommand`.

---

## 5. Final implementation notes

*Written on completion. §§1–4 above were the Phase 0 reconnaissance and are left as
written — including predictions that turned out wrong, which are noted below.*

### What shipped, by phase

| Phase | Outcome |
|---|---|
| 1 | `WorkspaceMission`, `Card.role`, `Card.provenance`, `OperationRecord` + `OperationLogRepository` — all additive and optional |
| 2 | `AgentScope` bounded-context resolution, seven operation presets, the preflight sheet |
| 3 | Real search via `SearchGateway`, inspectable candidates, save-as-source, cited briefs |
| 4 | Mission Control module, deterministic gap report, mission editor, phases |
| 5 | Capture receipts with next actions, the five-action selection tray |
| 6 | Documented command catalog, canonical actions, `/aliases` |
| 7 | Type scale, palettes, Google Fonts, communicative motion — plus the God-class refactor |
| 8 | Undo, failure cards, the global activity banner, sheet-dismissal fix |
| 9 | Docs and quality gates (this section) |

### Corrections to the Phase 0 analysis

- **The undo strategy in §2 was written as if `Card` had an `updatedAt`.** It doesn't.
  `canUndoCreate` instead compares a content signature (title, body, answer, fields,
  parentId) against an as-created snapshot. This is stricter and catches edits an
  `updatedAt` would have missed.
- **The snapshot timing was subtly wrong and only caught by a test.** Snapshots were taken
  before auto-grouping re-parented the output, so `canUndoCreate` read the changed
  `parentId` as a user edit and refused *every* grouped run. Snapshots are now taken after
  the cards settle, and the group a run creates is part of what undo removes.
- **§2 predicted the trust gap was "entirely in the UI".** It was worse. Every in-flight
  indicator was owned by the screen that started the work, so running an action from any
  screen but the deck showed *nothing at all* until output silently appeared. Fixed by
  moving the indicator into the shell.

### Migration notes

No migration runner was needed or written. Every field added is optional and resolves
through a defaulting function — `resolveAppearance`, `readFailedRunCard`, the `mission`/
`role`/`provenance` fields — so a settings or card blob written before this work loads
unchanged. `resolveLearningTheme` still honours the legacy `mode`/`accent` arguments and
only switches to a palette once one is explicitly chosen, so no existing user's appearance
changed underneath them.

Storage keys are unchanged except for one addition: `learnimal_operation_log_v1`, bounded
to the 200 most recent records.

### Quality gates

`bun test` — 352 tests across 55 files. `npx tsc --noEmit` — clean for all non-test
sources. The pre-existing test-file type errors catalogued in §0 remain (missing
`bun-types` in `tsconfig`, plus three stale fixtures); none were introduced by this work
and none affect `bun test`. There is no lint configuration in the repo.

### Recommended next steps

1. **Make `OpenRouterAgentGateway` honest.** Return a tagged result distinguishing a real
   model response from the local-fallback template, and thread `isLocalFallback` (already
   on `Provenance`) through to the receipt. This is the last place the app can imply a
   model answered when it didn't.
2. **Add `bun-types` to `tsconfig`** so `npx tsc --noEmit` is clean end-to-end and can
   become a CI gate.
3. **Extend undo beyond one step**, using the persisted log that already supports it.
4. **Revisit onboarding** — the PRD's cold-start four questions were never built, and
   missions are currently something you have to go and find.
