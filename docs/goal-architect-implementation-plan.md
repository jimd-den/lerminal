# Goal Architect — implementation plan

A conversational first-run and "create goal" experience that turns an ambition into an
inspectable learning mission. This document is the plan the work follows; it is written
before the code so the boundaries are argued once rather than rediscovered per module.

## The promise this feature must not break

GRIOT's central claim is that **you can always tell where something came from.** A
goal-planning agent is the easiest place in the app to break that, because plausible
planning prose is cheap to generate and reads like authority. So the design rule is:

> Four kinds of statement, never blended: what **you** said, what the **app** computed,
> what the **agent** guessed, and what the **web** actually returned.

That is why the working map is not a bag of strings. Every entry carries an
`InsightOrigin`, and the UI renders each origin differently. A model may *propose* a
prerequisite; it may never quietly promote it to a fact the user appears to have stated.

Consequences that fall out of the same rule:

- The agent never claims to have searched. Only `SearchGateway` searches, and only after
  the user approves a preflight that shows the exact queries.
- A mission proposal creates **nothing** until accepted. The draft says so explicitly.
- A failed model call produces an actionable failure state and **preserves the answers** —
  losing eight answers to one network blip is the bug that makes people distrust the flow.
- No card is enrolled in spaced repetition automatically. Study is a later, explicit act.

## Flow

```
Stage 1  Intent          one question at a time, each with a rationale
Stage 2  Quiet assessment deterministic working map + optional labelled agent hypotheses
Stage 3  Research scan   OPTIONAL, opt-in, real SearchGateway, preflight shows queries
Stage 4  Mission proposal DRAFT — nothing created yet; edit / ask / research / accept
Stage 5  Mission canvas   back to the one canvas, with the created cards
```

Stages 1, 2, and 4 work with **no API key at all**. That is a hard requirement, not a
degraded mode: the question bank, the gap analysis, and the proposal are all deterministic
functions of the user's answers. A model, when present, adds labelled hypotheses and
better phrasing — it is never load-bearing.

## Layering

Existing machinery is reused rather than reinvented. `SemanticRole` already has exactly
the vocabulary this feature needs (`goal`, `task`, `experiment`, `concept`, `question`,
`source`, `deliverable`), `Provenance` already records mode/model/web usage, and
`OperationRecord` already carries undo snapshots.

| Layer | Module | Responsibility |
|---|---|---|
| entities | `goalArchitect.ts` | Answers, origin-tagged working map, question bank, turn validation, proposal value objects. Pure and serializable. |
| usecases | `goal/GoalArchitectWorkflow.ts` | Session orchestration: ask, answer, skip, edit, request an agent turn, build the proposal. |
| usecases | `goal/CreateMissionPlanInteractor.ts` | Accepted proposal → cards + workspace mission + receipt. The only module here that writes. |
| adapters | `presenters/GoalArchitectPresenter.ts` | Projects session state into what the sheet renders. |
| frameworks | `ui/griot/GoalArchitectSheet.tsx` | The sheet. Reads presenter state, calls controller actions, touches no gateway. |

`deriveWorkingMap(answers)` lives in **entities**, not usecases: it is a pure function of
the answers with no I/O, and keeping it pure is what makes "works without an API key"
testable in isolation.

## Question selection

The bank is a fixed list of high-leverage questions, each with `id`, `prompt`,
`rationale`, and a `needs` predicate. `selectNextQuestion` returns the first question
whose information is still missing — so answering "I want to ship a playable vertical
slice by March on a Steam Deck" satisfies the deliverable *and* constraint questions at
once and neither is asked. The spec's requirement is "ask only what materially reduces
ambiguity", and a predicate over the current map is how that becomes testable rather than
aspirational.

Skipped questions are recorded as skipped, not deleted, so they are never re-asked and the
user can go back and fill one in.

## Agent turn contract

The model is asked for a `GoalArchitectTurn` (message, optional question, working map,
optional recommended research). Model output is **validated and normalized before it
reaches the UI** — `normalizeGoalArchitectTurn` returns `null` for anything malformed
rather than letting a half-parsed object render. Everything the model contributes is
tagged `origin: "agent"` on the way in, at the boundary, so nothing downstream has to
remember to do it.

## Receipts and undo

Mission acceptance writes one `OperationRecord`: the answer ids consumed, the cards
created with as-created snapshots, whether web and/or a model were used, the model id, and
the destination. `canUndoCreate` already refuses when a created card has been edited
since, which is exactly the required behaviour — undo removes only untouched cards it
created, and a partial undo is never reported as success.

## Increments

1. **Plan** (this document).
2. **Entities** — `goalArchitect.ts` + tests. Question bank, map derivation, turn
   normalization, proposal building.
3. **Workflow** — `GoalArchitectWorkflow` + tests. Answer/skip/edit, no-key path, agent
   turn kept separate from app findings, research approval gate.
4. **Mission creation** — `CreateMissionPlanInteractor` + tests. Cards, roles, provenance,
   receipt, undo, no auto-scheduling.
5. **Presenter + sheet + entry points** — first run, command palette `goal`, capture menu.
6. **Mission Console appearance profile** — theme mode, accent, surface tint, density.
   Deliberately last: it is the only part that changes existing surfaces, and the semantic
   colours (warning, error, evidence, selection, success) must stay distinguishable under
   every setting. Tracked separately so a theme regression can't hold up the flow.

## Compatibility

Additive only. `Workspace.mission` already exists and is optional; cards gain no required
field. A workspace, card, or settings blob written before this feature loads unchanged,
and a user who never opens Goal Architect sees no behavioural difference.
