# Architecture

Learnimal is built as four layers with a single rule: **dependencies only ever point
inward.** `src/__tests__/dependencyRule.test.ts` enforces it on every run, so the rule is
part of the build rather than a convention people remember.

```
entities/    Pure domain. Cards, workspaces, missions, schedules, provenance,
             chunking, recall, cloze. No I/O, no framework, no logging.
usecases/    Application logic. Interactors, pipeline commands, workflows, and the
             ports (interfaces) the outer layers implement.
adapters/    The controller, the session store, the presenter, in-memory repositories.
frameworks/  React Native UI, AsyncStorage, OpenRouter, DuckDuckGo, fonts, composition.
```

## Where things live, and why

### `entities/` — what the app is about

Pure data and the rules that operate on it. A function belongs here when its answer
depends only on its arguments: `chunkCard`, `makeCloze`, `recallCard`, `gradeSchedule`,
`createOperationRecord`, `normalizeSearchResults`, and the card-tree helpers in
`tree.ts`.

Entities perform no I/O and do not log. They used to print every card they created, which
serialized the user's own notes to the console; the dependency test now fails the build if
that comes back.

### `usecases/` — what the app does

Three kinds of module live here:

**Interactors** — one operation each, depending only on ports:
`RunResearchInteractor`, `GradeReviewInteractor`, `UndoOperationInteractor`,
`GapReportInteractor`.

**Pipeline commands** — one stage each, behind the `PipelineCommand` interface. The
`CommandRegistry` knows which exist and builds a `PipelineRunner` from them, so adding a
command touches one file that is not the controller.

**Workflows** — a cohesive feature that owns its own state and orchestrates several
interactors. Each exposes `state`, a set of methods, and a `Host` interface describing
what it needs from the app around it:

| Workflow | Owns |
|---|---|
| `research/ResearchWorkflow` | search → keep/reject → extract → cited brief |
| `mission/MissionWorkflow` | mission draft, deterministic gap report, syllabus |
| `operations/OperationsWorkflow` | in-flight activity, receipts, undo |
| `review/ReviewSession` | the study queue, reveal state, grading |

The `Host` is the seam. A workflow never receives the controller; it receives a small
object saying how to read context (`activeWorkspaceId()`, `apiKey()`) and how to cause
effects (`notify()`, `refreshCards()`, `onChange()`). That is what makes each one testable
with a recording fake and no application around it.

**Ports** live in `usecases/ports/`, not in `adapters/`. Ports are defined by the layer
that *needs* them, and implemented further out — that is what keeps the arrows pointing
inward.

### `adapters/` — translating between the app and its delivery

- **`LearnimalController`** — the single object the UI talks to. Its methods are thin;
  the work belongs to workflows and interactors.
- **`AppSessionStore`** — holds `domain` (persisted or derived) and `ui` (on-screen)
  state, owns subscription and the toast timer, and provides the shared edits
  (`select`, `forgetCards`) that more than one feature needs.
- **`presentAppState`** — a pure function projecting domain + ui + every workflow's state
  into the `AppState` the UI renders. Every collection is copied on the way out, so a
  component cannot mutate the session through what it rendered.
- **`repositories/Memory*`** — in-memory implementations used by tests and as safe
  defaults.

### `frameworks/` — the outside world

AsyncStorage repositories, the OpenRouter/DuckDuckGo/extraction gateways, fonts, the React
Native UI, and `composition/composeController.ts` — the one module that decides which
concrete implementation stands behind each port.

## Rules the code keeps

**Storage failure is never disguised as emptiness.** `JsonCollectionStore` /
`JsonDocumentStore` return an empty collection or `null` *only* when nothing was ever
stored; a failed or corrupt read throws a `PersistenceError`. Read-modify-write is
serialized per store and writes only after a successful read, so a transient read error
cannot truncate the user's cards. A failure at startup surfaces as `storageError` with a
retry, never as a blank library.

**Logging policy lives at the edge.** Inner layers report through the `Logger` port;
`ConsoleLogger` in the composition root decides what is printed, and drops `debug`
outside development.

**The UI gets copies, not references.** See `presentAppState`.

**Refusal beats a partial result.** Undo checks everything before touching anything and
explains why it declined. A research brief that cites nothing is rejected rather than
saved. A missing API key is reported, not silently replaced by a local fallback.

## Testing

```bash
bun test           # unit + architecture tests
npx tsc --noEmit   # type check
```

Tests sit in `__tests__/` beside the code they cover. The layering is what makes them
cheap: entities are pure, interactors take fakes, workflows take a recording host, and
`presentAppState` is a function from data to data. `dependencyRule.test.ts` covers the
structure itself — import direction and the no-`console` rule in inner layers.

## Adding things

**A pipeline command** — implement `PipelineCommand`, register it in `CommandRegistry`.

**A stored collection** — define the port in `usecases/ports/repositories/`, implement it
in `frameworks/storage/` on top of `JsonCollectionStore`, wire it in `composeController`.

**A feature with its own state** — write a workflow in `usecases/<feature>/` with a `Host`
interface, build it in a `build…()` method on the controller, and read its state in
`presentAppState`.
