# Learnimal

Learnimal turns a goal into an evidence-backed capstone. You capture small units of
knowledge, investigate them, practise them, and build from them — and at every step the
app tells you exactly what it is about to do, what it read, and where the result went.

It's a mobile learning console built on the Unix philosophy: **cards are the universal
stream, selection is stdin, new results are stdout, and commands compose.** The agent is
one visible, inspectable stage in that pipeline — never an invisible force.

## The promise this app makes

Most AI tools leave you guessing whether an answer came from your notes, from the web, or
from the model's imagination. Learnimal's core commitment is that you can always tell:

- **Every AI action states its scope before it runs.** A preflight sheet names what will
  be read, whether the web is enabled, what will be created, and where it will land.
- **`Ask` and `Research web` are different operations, and the UI says so.** `ask` calls a
  model but never browses. `search` browses but never calls a model. The command catalog
  records both facts separately (`usesModel`, `usesWeb`) and the interface badges them.
- **Work in flight is always visible.** One activity banner lives in the app shell, so a
  run started on any screen stays visible when you navigate away — labelled `MODEL`,
  `WEB`, or neither.
- **Failures become cards, not disappearing banners.** A failed run lands where its output
  would have gone, survives restart, and carries everything needed to run it again with
  the *original* inputs.
- **Nothing fabricates success.** A missing API key is reported, not silently replaced. A
  research brief that cites nothing is rejected rather than saved. Heuristics are labelled
  as heuristics.

## Core flows

**Capture → next actions.** Add a note, source, or question and you get a receipt naming
where it landed plus two or three context-sensitive follow-ups, so capture leads somewhere
instead of dead-ending in a toast.

**Mission and gap report.** Give a workspace a goal, success criteria, and a target
deliverable. Mission Control summarises progress; the Status report answers "what do I
have, what's missing, what next?" — computed entirely from your card graph, with **no API
key required**. AI enrichment is a separate, clearly-labelled step on top.

**Research.** A real web search via the search gateway, returning inspectable source
candidates with evidence-kind classification and plain-language cautions. Keep, reject,
extract, or open each one. "Save as source" persists a card immediately with no model
involved; "Create cited brief" is the only step that calls one, and it only ever sees the
sources you kept.

**Study.** Chunk, recall, cloze, and elaborate turn material into practice; `space` enrols
it into FSRS-5 spaced repetition; `review` runs the due queue. Semantic roles never affect
what's studiable — only a card type's learning behaviour does.

**Undo.** The last run can be reversed. If a created card has been edited since, undo
refuses *and explains why* rather than discarding your work — it never applies partially.

## The command line is still there

Every capability is reachable by touch *and* as a composable command:

```text
ask "React hooks" | chunk | recall | space
```

The palette documents each command's purpose, what it needs, what it produces, and whether
it touches the web or a model. Canonical actions have `/aliases` (`/research`, `/prereqs`,
`/experiment`, `/study`, `/status`, `/build`). Custom commands and pipeline macros work
alongside the built-ins.

## Make it yours

Settings ships DOS-heritage palettes (Amber Phosphor, Green Phosphor, CGA) alongside a
modern dark/light pair, and installs any Google Fonts family by name — no key, no build
step. Palettes apply whole rather than as free-form colour pickers, so no combination can
make a warning read as a heading.

Motion is informational: content that just arrived animates in, the selection count pulses
when it changes, and an indeterminate bar shows work in flight (never a fake percentage —
the app cannot know how far a model call is). All of it collapses under the OS
reduce-motion setting, and every animation duplicates something the layout already says in
words.

## Architecture

Strict clean architecture, enforced by the dependency rule — inner layers never import
outward:

```
entities/    Cards, workspaces, missions, provenance, schedules, palettes — pure domain
usecases/    Pipeline commands, agent scope, research, gap report, undo — pure application
adapters/    Controller, presenters, repository + gateway ports
frameworks/  React Native UI, AsyncStorage, OpenRouter, DuckDuckGo, Google Fonts
```

The UI never imports `usecases/` directly and never calls a gateway; it reads view-models
from presenters and calls controller methods. Presenters derive on read rather than storing
snapshots, so a panel can never describe a card that no longer exists.

Local-first: everything persists to AsyncStorage on device. No backend, no accounts, no
sync. Bring your own OpenRouter key.

## Getting started

```bash
npm install
npm start          # or: npx expo start --tunnel   to test on a device
```

Add an OpenRouter API key in Settings to enable model-backed commands. Everything
deterministic — capture, split, recall, cloze, review, grouping, search, the status
report — works without one.

## Tests

```bash
bun test           # 352 tests
npx tsc --noEmit   # type check
```
