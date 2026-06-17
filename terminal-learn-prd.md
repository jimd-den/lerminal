# Terminal — Product Requirements Document

*Working title. A learning tool built on the Unix philosophy, for mobile and the agent economy.*

---

## 1. One line

A single-canvas mobile app where everything is a **card**, every action is a small **command**, and cards **pipe** from one command into the next. You ask an agent, it returns chunked cards, and you compose those cards into recall and review — all from one screen.

---

## 2. Philosophy: Unix for mobile, Unix for the agent economy

The whole product is one idea applied honestly: **small composable parts over one big app.** Three Unix values, carried over from the sketches:

- **Freedom** — bring your own model (OpenRouter). No lock-in, no house AI you can't swap. You pick the model per command; you hold the key.
- **Piping** — the output of one command is the input to the next. Cards are the universal stream the way text is in Unix. `ask → chunk → recall → space` is a pipeline, not four separate features.
- **Customization** — you set your own easy-access command list, the way you'd set your `PATH` or write aliases. Your toolbar is yours.

Two design laws fall out of this:

1. **Each command does one thing.** No command is a mode or a screen. A command takes cards in and emits cards out: `command: [Card] → [Card]`.
2. **The card is the universal interface.** Sources, agent answers, questions, notes — all the same primitive, all full-screen, all pipeable. If you can see it, you can pipe it.

The "agent economy" angle: the agent is just another command in the pipe. It reads cards as input and writes cards as output like any other tool. That means an agent step composes with non-agent steps freely, and you can chain models from different providers in one pipeline.

---

## 3. Goals and non-goals

**Goals**

- Reach real understanding using only the three highest-leverage techniques: **chunking, active recall, spaced repetition.**
- Stay ultra-minimal: **one screen, one UI.** Complexity lives in composition, never in chrome.
- Make composition effortless: any card pipes into any compatible command in two taps.
- Start from nothing in under a minute, guided by four questions.

**Non-goals**

- No second screen, no tab bar, no nested navigation. The canvas is the app.
- No points, streaks, badges, or feeds.
- No bundled model and no model lock-in. The app ships without an AI of its own; it talks to whatever you connect.
- Not a general note-taking app. Every card belongs to a learning workspace.

---

## 4. The learning core (only three things)

These are the only learning mechanics in v1, chosen because they have the strongest evidence behind them and the cleanest fit to a pipe model.

| Primitive | Command | What it does | Why it's here |
|---|---|---|---|
| **Chunking** | `chunk` | Splits a source or long card into small, atomic, screen-sized cards | The single strongest readability lever on a small screen; one idea per card |
| **Active recall** | `recall` | Turns cards into questions with the answer hidden until you attempt | Retrieval beats rereading for durable memory; effort first |
| **Spaced repetition** | `space` / `review` | Schedules cards over expanding intervals and runs the due queue | Distributed practice is among the most robust findings in learning science |

Everything else (synthesis, interleaving, elaboration) is deliberately left out of the core and treated as **optional commands you can add later** — because the pipe model means new techniques are just new tools, not new screens. The core stays small on purpose.

---

## 5. Core objects

Five primitives. That's the whole model.

**Card** — the atomic unit. Full-screen when open. Holds markdown content and a type. Pipeable. Belongs to exactly one workspace; can carry tags.
- Types: `source`, `chunk`, `question`, `note`, `answer`. (Type only affects which commands accept it as input.)

**Command (function)** — a small tool with the signature `[Card] → [Card]`. Takes the current selection as input, emits new cards onto the canvas as output. Stateless and composable.

**Pipe** — a chain of commands. The output cards of one command become the input selection of the next. Built by tapping commands in sequence, or typed as one line.

**Workspace** — a named scope (a "directory") holding the cards and sources for one learning goal. Switching workspace is the only context switch in the app.

**Source** — material you bring in: a fetched URL or an uploaded file. Enters the app as one or more `source` cards. Everything the agent says can cite back to a source.

The agent is not a sixth primitive — it's a command (`ask`) that happens to be backed by a model.

---

## 6. The one screen

Image 1 is the spec: a canvas of cards with a command drawer on the right edge.

**The canvas.** A single vertical flow of cards for the current workspace. Tap a card to open it **full-screen**; swipe down or tap away to return to the flow. There is no other navigation. Cards are not draggable; order is logical (newest pipeline output near where you're working).

**The command drawer (right edge).** A thin handle on the right, reachable by the thumb. Tap it and it opens a **command modal in the middle of the screen** — a focused palette floating over the canvas. This is the only modal in the app.

Inside the modal:
- Your **easy-access list** at the top — the commands you've pinned, in your order. This is the customizable `PATH`.
- The full command list below it, searchable.
- A **command line** at the bottom: type a single command, or type a whole pipeline (`ask "eigenvectors" | chunk | recall | space`). Voice dictation feeds the same line.
- A mic button for speaking the command or the agent query.

So there are two ways to do everything — **tap the pinned command** (recognition, for the 90% case) or **type the pipe** (composition, for power users). Same actions, same names, both feed the same engine.

**Selection = stdin.** Before opening the drawer, you select zero or more cards by tapping their corner. The command consumes that selection. Select nothing and run `ask`, and you get a fresh query. Select three chunks and run `recall`, and you get three questions. The selection is the input stream.

**Output = stdout.** New cards land on the canvas, highlighted, already selected — so you can immediately pipe them into the next command without re-selecting. That immediate re-selection is what makes `ask → chunk → recall → space` feel like one gesture.

That's the entire interface: canvas, right drawer, center command modal. One screen, one UI.

---

## 7. Cold start (the four questions)

Image 3 is the onboarding. Open the app for the first time with nothing, and the agent asks, one card at a time:

1. **What do you want to learn?**
2. **Why?**
3. **What do you want to do?**
4. **What will you need to learn?**

You answer by typing or speaking. From your answers the agent:
- creates your first **workspace**, named after the goal,
- runs an implicit `ask → chunk` to produce your first set of chunked cards,
- and leaves them on the canvas, selected, ready to pipe into `recall`.

You learn the whole interface by doing this once. No tutorial, no manual — the first real action *is* the onboarding.

---

## 8. Command library (v1)

The minimal set. Each does one thing; each is a pipe stage.

| Command | Input | Output | One job |
|---|---|---|---|
| `ask` | optional selection as context | `answer` + `chunk` cards | Query the agent; return a chunked, cited answer |
| `source` | a URL or file | `source` card(s) | Bring material in |
| `chunk` | `source` or long card | `chunk` cards | Split into atomic, one-idea cards |
| `recall` | any content cards | `question` cards | Make active-recall questions, answers hidden |
| `space` | `question` cards | scheduled cards | Add to the spaced-repetition schedule |
| `review` | (the due queue) | graded cards | Run today's due reviews |
| `pin` | a command | — | Add a command to your easy-access list |
| `move` | cards | cards | Send cards to another workspace |

Three of these (`chunk`, `recall`, `space`/`review`) *are* the learning core. The rest are plumbing. Future commands (`explain`, `quiz`, `interleave`, `summarize`) slot in as new pipe stages without touching the UI.

---

## 9. Piping in practice

A pipeline is just commands run in order, with each output feeding the next input. Examples:

- **Learn something new:** `ask "how do eigenvectors work" | chunk | recall | space` → ask the agent, break the answer into atomic cards, turn each into a recall question, schedule them all. One typed line, or four taps with auto-reselection.
- **Study a PDF you uploaded:** `source paper.pdf | chunk | recall | space`.
- **Just read, no testing yet:** `ask "..." | chunk` and stop. Pipe into `recall` later when you're ready.

Tapping and typing produce identical pipelines. Tapping is the default; typing is there because the Unix promise is real composition, and some users will want it.

---

## 10. The agent (OpenRouter)

The agent is model-agnostic by design.

- **Bring your own key.** The user connects an OpenRouter key in settings. The app ships with no model of its own.
- **Pick the model per command.** A default model for `ask`, overridable inline (e.g. a cheaper model for `chunk`, a stronger one for `ask`). Cost and model name are shown before a run when a call will incur cost.
- **Chunked, cited output.** `ask` is prompted to return short, atomic cards rather than walls of text, and to attach a citation to each claim that traces back to a `source` card when sources are present. Claims it can't ground are labeled as such.
- **The agent is a pipe stage.** It reads the selected cards as context and writes cards as output, so it composes with every other command.

> Integration specifics (available models, pricing, key handling) should be verified against current OpenRouter documentation before build; this PRD specifies intent, not a fixed model list.

---

## 11. Data model (minimal)

- `Workspace(id, name, created_at)`
- `Card(id, workspace_id, type, markdown, tags[], created_at, source_ref?)`
- `Command(name, signature, is_pinned, pin_order)`
- `Pipeline(id, steps[], created_at)` — optional, for re-running a saved pipe
- `Schedule(card_id, due_at, stability, difficulty, history[])` — spaced-repetition state (FSRS-style)
- `Source(card_id, kind: url|upload, origin, citation_meta)`

Local-first: the card graph and schedule live on device and sync if the user opts in. Sources and study data are scoped to the user.

---

## 12. Visual design

Carries the minimal direction, stripped to match the new model.

- **One surface, dark, calm.** Near-black canvas, one elevated panel level for cards. No decorative framing.
- **Color means command type, nothing else.** A small accent set maps to the core actions (recall, space, source, agent) so a card's spine tells you what it is at a glance. Color is never decoration.
- **Two type voices.** A clean system grotesque for all human content; monospace reserved for the command line and data (intervals, model names, IDs) — the honest Unix citation.
- **Full-screen cards.** Open content fills the screen for distraction-free reading on a phone. The drawer handle is the only persistent chrome.
- **Reachability.** Drawer on the right, command modal centered — everything primary sits in the thumb zone.

---

## 13. v1 scope

Ship the smallest thing that proves the model:

1. One canvas, full-screen cards, right drawer → center command modal.
2. The cold-start four questions → first workspace + first chunked cards.
3. Commands: `ask`, `source`, `chunk`, `recall`, `space`, `review`, `pin`, `move`.
4. Tap-to-pipe with auto-reselection **and** the typed command line.
5. OpenRouter key + per-command model selection.
6. FSRS-style scheduling and a review flow with two thumb choices.
7. Pinned easy-access list.

Explicitly deferred: extra learning commands beyond the three, saved/named pipelines, multi-device sync, collaboration.

---

## 14. Open questions

1. **Implicit vs. explicit pipes** — should tapping a command always re-select its output automatically (frictionless but magical), or require a confirm tap (predictable but slower)?
2. **How opinionated is `chunk`?** Fixed atomic granularity, or a size the user can dial per run?
3. **Selection model** — is a single "current card" enough for most pipes, or is multi-select essential from day one?
4. **Where does review live?** As a command you run (`review`), or a gentle ambient prompt when items are due — without becoming a notification feed?
5. **Failed recall** — should a missed question auto-pipe back into `ask` for a re-explanation, or stay manual?
