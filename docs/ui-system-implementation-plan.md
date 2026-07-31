# UI System Implementation Plan — Field Shell

Phase 0 of the `work.txt` brief. Written before broad implementation, as that brief
requires. It maps every requested surface to what already exists, names what's actually
new, and sequences the work so each phase ships independently testable and the app is
never left mid-migration.

## Reading of the brief

`work.txt` asks for a large system: a renamed shell (FIELD), an Agent Studio, a Command
Workshop, a Prompt Architect, an Appearance Studio, and a reworked Field canvas —
around 8 phases of work. Most of the *behavior* it asks for already exists in this
codebase under different names (preflights, receipts, provenance, mission module, gap
report, research bench, review). The work is real, but it is substantially an
**extension and surfacing exercise**, not a rewrite: `work.txt` itself says not to build
a second competing agent/command/theme/storage system, and the inventory below shows
almost everything it names already has a load-bearing counterpart.

Two naming conflicts to resolve up front, both cosmetic:
- `work.txt` calls the primary canvas **FIELD**; the existing screen is `SpaceScreen`
  presenting `MissionCanvasHeader` + `ContextCardRow`s. No rename of files is required —
  "FIELD" becomes the header eyebrow/system label; the underlying screen is unchanged.
- `work.txt`'s `AgentProfile` is this codebase's `AssistantProfile` with more policy
  fields. Extended, not replaced (§ Agent Studio below).

## Inventory: what already satisfies the brief

| `work.txt` asks for | Already exists as |
|---|---|
| Cards / stdin / stdout / pipelines / receipts | `Card`, `PipelineRunner`, `OperationRecord`, `OperationsWorkflow` |
| Preflight sheet with exact inputs/scope/model/web state | `AgentPreflightPresenter` + `AiPreflightSheet.tsx` |
| Provenance detail | `Provenance` entity, rendered per-card |
| Undo with edited-output refusal | `UndoOperationInteractor`, `canUndoCreate` |
| Mission module with counters + one next action | `MissionCanvasPresenter` + `MissionCanvasHeader` (built this session) |
| Status gap report (deterministic-first) | `GapReportInteractor` + `GapReportSheet.tsx` |
| Research bench / evidence cards / keep-reject-extract | `ResearchWorkflow` + `ResearchResultsSheet.tsx` |
| Cited brief gated on retained evidence | `CreateResearchBriefInteractor` |
| Goal Architect (one question at a time, working map, labelled hypotheses, no-key path, opt-in research) | `GoalArchitectWorkflow`, `entities/goalArchitect.ts`, `GoalArchitectSheet.tsx` (built this session) |
| First-run capture-first entry | `GriotController.init()` first-launch check + `markFirstRun` |
| Selection dock stating count/expansion, routing to preflight | `SelectionTray.tsx` + `selectionActions.ts` |
| Idle dock: Capture/Library/Review/Tools | `BottomNavigation` in `components.tsx` |
| Review loop, predict-then-reveal-capable | `ReviewSession`, `ReviewModal.tsx`, FSRS scheduler |
| Study generation requiring explicit enrollment | `SpaceCommand` (never auto-run) |
| Command palette / typed pipelines / aliases | `CommandRegistry`, `CommandConsoleModal.tsx`, `commandCatalog.ts` |
| Custom commands (macro / agent) | `CommandDefinition` (`agent` \| `pipeline` kinds) |
| Assistant profiles, built-in + user, per-capability | `AssistantProfile`, `resolveAssistantProfile` |
| Appearance: palettes, accent override, fonts, semantic-safe colors | `entities/appearance.ts`, `theme.ts`, `AppearanceSettings.tsx` |
| Font browser: search, preview, install, error states | `SearchFontsInteractor`, `PreviewFontInteractor`, `InstallFontInteractor` (built this session) |
| Reduced motion | `useReducedMotion.ts`, `ArrivalView` |

Everything in this table is reused as-is. The plan below only concerns the gaps.

## Real gaps

1. **Agent Studio.** `AssistantProfile` has no `scope` (builtin/global/workspace/session),
   no `contextPolicy`, `webPolicy`, or `outputPolicy`, and there's no list/detail/editor
   UI or duplication flow.
2. **Prompt Architect.** `OpenRouterAgentGateway.designAssistantProfile` already does the
   model call; there's no preflight/diff/confirm UI around it, and no provenance record
   of an agent-authored prompt revision.
3. **Command Workshop.** `CommandDefinition` has no scope, input requirements, or output
   role declarations, and there's no stage composer / template list / validation UI.
   Guided-action, research-command, and hybrid-pipeline `kind`s don't exist yet.
4. **Appearance Studio surface.** The tokens (density, surface tint presets, motion
   level, high contrast) mostly don't exist yet; the current `AppearanceSettings.tsx` is
   palette + font only.
5. **Tool Deck tile metadata.** `commandCatalog.ts` documents commands textually; it
   doesn't yet drive a tile grid with per-tile disabled-reason.
6. **FIELD label pass.** Header eyebrows across screens should read `FIELD //…` etc.,
   matching the `work.txt` HUD label list — this is copy-only, using `entities/brand.ts`.

## Phase 1 — Foundations (entities + persistence + tests)

### `entities/assistantProfile.ts` (extend, don't replace)

Add, all optional so every persisted profile predating this loads unchanged:

```ts
export type ProfileScope = "builtin" | "global" | "workspace" | "session";

export interface ContextPolicy {
  defaultScope: AgentScopeKind; // reuses usecases/agent/AgentScope's existing type
  maxCards: number;
  maxCharacters: number;
  allowSources: boolean;
  allowMission: boolean;
  allowPriorOutputs: boolean;
}

export interface OutputPolicy {
  allowCardCreation: boolean;
  allowedRoles: SemanticRole[];
  requireReviewBeforeSave: boolean;
  createGroupForOutputs: boolean;
}

// added to AssistantProfile:
scope?: ProfileScope;            // undefined -> treated as "global" (today's behavior)
workspaceId?: string;            // required when scope === "workspace"
contextPolicy?: ContextPolicy;   // undefined -> DEFAULT_SCOPE_BUDGET from AgentScope.ts
webPolicy?: "never" | "preflight-required"; // undefined -> "never"
outputPolicy?: OutputPolicy;
isEditable?: boolean;            // undefined -> !builtin
sourceProfileId?: string;        // set when duplicated from a builtin
```

`resolveAssistantProfile` gains a `workspaceId` parameter so workspace-scoped profiles
are excluded from unrelated workspaces (a `work.txt` persistence requirement); session
profiles live only in `AppSessionStore.ui` and are never passed to the repository, so
they cannot outlive the process by construction — no separate "clear on restart" logic
needed.

### `entities/commandDefinition.ts` (extend)

```ts
export type CommandScope = "session" | "workspace" | "global";

// added to BaseCommandDefinition:
scope?: CommandScope;               // undefined -> "global" (today's behavior)
workspaceId?: string;
requiredInputRoles?: SemanticRole[];
requiredInputCount?: "none" | "one-or-more";
webUse?: boolean;                   // declared, not inferred — validated at save time
outputRoles?: SemanticRole[];
pinned?: boolean;                   // replaces ad hoc pin tracking if any exists; else new
```

New `kind`s added to the discriminated union: `"guided"` (presetId + defaults),
`"research"` (always preflight-required), `"hybrid"` (ordered stage list mixing
deterministic/agent/research stages). Each is additive to the union — existing `"agent"`
and `"pipeline"` commands and every existing typed alias keep working unchanged, and the
dependency-rule/pipeline tests already guard that commands round-trip through storage.

### `entities/appearanceProfile.ts` (new, thin — extends `appearance.ts`)

Rather than a competing token system, this adds the fields `work.txt` asks for onto the
existing `AppearanceSettings`/`ResolvedAppearance` shapes:

```ts
// added to AppearanceSettings (all optional):
surfaceTint?: "neutral" | "graphite" | "deep-green" | "blue-black" | "warm-paper";
density?: "compact" | "standard" | "spacious";
motion?: "system" | "reduced" | "full";
highContrast?: boolean;
```

`resolveAppearance` grows matching resolved fields with safe defaults
(`density: "standard"`, `motion: "system"`, `highContrast: false`). Surface tint is a
*modifier* applied to the active palette's neutrals, not a new palette — it cannot touch
`danger`/`warning`/`evidence`, preserving the semantic-safety invariant the palette test
suite already enforces (`appearance.test.ts`'s "keeps every semantic state
distinguishable" test extends to assert this for every tint × palette combination).

### Persistence

No new storage engine. `AsyncStorageAssistantProfileRepository` and
`AsyncStorageCommandDefinitionRepository` already round-trip arbitrary JSON-serializable
fields; the new optional fields ride through unchanged. Workspace-scoped profiles/commands
are filtered by `workspaceId` at the presenter/workflow boundary (matching how cards are
already filtered by `workspaceId`), not by a new repository shape.

**Migration:** none required to *read* old data — every new field is optional and every
consumer treats `undefined` as the pre-existing behavior. A one-time normalization on
first load (stamp `scope: "global"` on legacy custom profiles/commands so later filtering
logic has a concrete value to compare) is applied in the repository's load path, mirroring
the existing pattern in `MemorySettingsRepository`/`AsyncStorageSettingsRepository` for
backfilling settings fields — write-on-read, never a blocking migration step.

### Tests (Phase 1)

- `entities/__tests__/assistantProfile.test.ts`: new fields default correctly; legacy
  (field-less) profiles resolve identically to before; `resolveAssistantProfile` excludes
  workspace-scoped profiles from a different `workspaceId`.
- `entities/__tests__/commandDefinition.test.ts`: new `kind`s validate; legacy `agent`/
  `pipeline` definitions still construct and normalize identically.
- `entities/__tests__/appearance.test.ts`: extend existing semantic-safety test across
  tint × palette; density/motion/highContrast default and round-trip.
- Repository tests (`AsyncStorageRepositories.test.ts`, `MemoryRepositories.test.ts`):
  round-trip the new optional fields; confirm a pre-migration fixture (fields absent)
  still loads.

## Phase 2 — Shell and Field (mostly copy + composition, low risk)

- Header eyebrows updated to the `work.txt` HUD label set via `entities/brand.ts`'s
  `systemLabel()` (already the single place these are generated).
- `MissionCanvasPresenter`/`ContextCards` already satisfy the card-grammar and
  mission-module requirements; this phase only adds the "incomplete/blocked" status
  affordance (reads `card.provenance` + open-question role, already available data — no
  new entity field).
- No new screens. `SpaceScreen` *is* FIELD.

Tests: extend `MissionCanvasPresenter.test.ts` for the new status affordance; snapshot
the header label set.

## Phase 3 — Agent Studio

New modules:
- `usecases/agent/AgentProfileWorkflow.ts` — list-by-scope, duplicate-builtin (writes a
  new profile with `sourceProfileId` set, `builtin: false`, `isEditable: true`; a builtin
  is never mutated in place — enforced by the interactor refusing writes where
  `builtin === true`), delete-with-dependents-check (refuses if a `CommandDefinition`
  references the profile, per `work.txt`'s deletion-safety requirement).
- `adapters/presenters/AgentStudioPresenter.ts` — projects profiles grouped by scope,
  each with the plain-language policy summary `work.txt` requires (derived from
  `ContextPolicy`/`OutputPolicy`/`webPolicy` — pure string formatting, unit-testable
  without a model).
- `frameworks/ui/griot/AgentStudioSheet.tsx`, `AgentEditorSheet.tsx` — list + editor,
  wired the same way `MissionEditorSheet.tsx` already is: UI reads presenter state,
  calls controller actions, never touches `AgentGateway` directly.

Prompt Architect (`usecases/agent/PromptArchitectInteractor.ts`) wraps the existing
`AgentGateway.designAssistantProfile` call behind the same preflight-then-diff-then-save
shape `GoalArchitectWorkflow` already established: nothing is written until the user
confirms, and the confirmed write's `Provenance` records `mode: "agent"` plus the model
id, satisfying `work.txt`'s "store provenance that an agent designed/revised the
profile" requirement using the existing `Provenance` shape — no new provenance variant.

Tests: profile duplication never mutates the builtin fixture; session-scoped profiles
are absent after a simulated restart (fresh `AppSessionStore`); workspace isolation;
Prompt Architect requires confirmation before persisting and performs no write on
preflight-cancel; malformed model output (reusing the `normalizeGoalArchitectTurn`-style
validate-at-the-boundary pattern) is rejected without corrupting the prior profile.

## Phase 4 — Command Workshop

New modules:
- Extends `usecases/commands/CreateCommandDefinitionInteractor.ts` (or a sibling
  `CustomCommandWorkflow.ts` if the validation surface grows past what a single
  interactor should own — decided during implementation, not the plan, per `work.txt`'s
  own "extension of existing command workflow" preference) with the new-`kind` validation
  rules: empty-command rejection, unknown-agent-profile rejection, web-without-preflight
  rejection, output-role-conflict rejection, stage-input/output type compatibility check
  (best-effort — the pipeline is otherwise untyped, so this is advisory, not exhaustive).
- `adapters/presenters/CommandWorkshopPresenter.ts` + `frameworks/ui/griot/
  CommandWorkshopSheet.tsx` — template list, stage composer, live preflight preview built
  from the same `AgentPreflightPresenter` machinery a hybrid command's agent/research
  stage would eventually run through.

Tests: every validation rule above as a rejected-input case; existing typed aliases and
built-in commands remain executable and untouched by the new validation path (regression
guard already exists in `commandCatalog.test.ts`, extended rather than replaced).

## Phase 5 — Research/evidence and preflight refinement

Mostly presenter-level additions to already-real data:
- Source-kind advisory labels (`entities/searchResult.ts` gains a pure classifier
  function — official docs / academic / tutorial / etc. — driven by domain heuristics,
  never a model call, matching the "no opaque credibility score" requirement).
- Provenance detail view surfaces every field `work.txt` lists; all already present on
  `Provenance` — this is a UI addition, `ProvenanceDetailSheet.tsx`, not a data change.

Tests: classifier is pure and unit-tested directly; provenance detail presenter test
asserts every listed field renders when present and is omitted (not shown as blank) when
absent.

## Phase 6 — Appearance Studio

UI-only, consuming the Phase 1 entity additions: `AppearanceStudioPresenter.ts` +
`AppearanceStudioSheet.tsx` (or an extension of `AppearanceSettings.tsx` — likely the
latter, since a second sheet competing with the existing one would violate `work.txt`'s
own "don't build a competing system" instruction). Surface tint swatches, density
toggle, motion toggle, high-contrast toggle, reset-to-defaults action.

Tests: extend `AppearanceSettings`-adjacent presenter tests for every new token's
default and round-trip; confirm reduced-motion and high-contrast each produce
deterministic, asserted style output (not just "doesn't crash").

## Phase 7 — Mastery surfaces

Largely already compliant (see inventory table). This phase is a targeted review pass:
confirm the review screen states scheduling is separate from card creation (copy check),
confirm study-generation drafts are never auto-enrolled (already true —
`SpaceCommand` requires an explicit run), add the "open originating card after review"
affordance if not already present (`ReviewModal.tsx` — verify during implementation).

## Phase 8 — Quality pass

Accessibility labeling audit, Android/iOS keyboard-avoidance check on every sheet with a
`TextInput` (pattern already established in `GoalArchitectSheet.tsx`/`CaptureScreen.tsx`
via `KeyboardAvoidingView`), empty-state audit, and a final full-suite run:
`bun test`, `tsc --noEmit`, and the dependency-rule test.

## Compatibility summary

Every change in every phase is additive: new optional fields, new discriminated-union
variants, new files. No existing field is removed or repurposed, no existing repository
key changes shape, and every "old data must still load" case has a named test above. A
user who never opens Agent Studio, Command Workshop, or Appearance Studio sees no
behavioral change at all — the same guarantee this repo's `goal-architect-
implementation-plan.md` made for the Goal Architect increment.

## Sequencing note

This plan is large enough that each phase should land as its own reviewable increment,
the same pattern the Goal Architect work used (entities → workflow → presenter/UI →
entry points, each its own commit with tests passing throughout). Phase 1 is the
dependency for everything after it and is where implementation starts next.
