/**
 * # Workspace Agent SLM Eval
 *
 * Not a unit test — a real-network evaluation of whether the app's *actual* system
 * prompt and tag grammar (`entities/agentTags`) hold up against small, free-tier models,
 * which is the eventual target (2B-4B local models; see the "griot target is local slm"
 * project memory). This calls OpenRouter for real, so it is gated behind an env var and
 * excluded from `bun test` — run it explicitly:
 *
 *   OPENROUTER_TEST_API_KEY=... bun run scripts/evalWorkspaceAgentTags.ts
 *
 * (or rely on `.env.local`, which Bun loads automatically and which is git-ignored).
 *
 * It sends the same `composeSystemPrompt("workspace-agent", ...)` output and the same
 * numbered-briefing shape `WorkspaceAgentWorkflow` builds, against a shortlist of
 * currently-free OpenRouter models chosen for being small/SLM-class (checked against
 * OpenRouter's live catalog on 2026-08-01, not guessed from memory):
 *
 * - google/gemma-4-26b-a4b-it:free   (~4B active params, MoE)
 * - nvidia/nemotron-3-nano-30b-a3b:free (~3B active params, MoE)
 * - nvidia/nemotron-nano-9b-v2:free  (9B dense — smallest fully-dense free option)
 *
 * Each response is run through the real `parseAgentTags` parser (not a re-implementation)
 * and scored on exactly the properties the app depends on:
 * - does it ever leak raw `[[`/`]]` bracket noise into the visible text (a parser miss)
 * - does it hallucinate a card reference that doesn't exist (safe-by-construction if
 *   `resolveCardRefs` is doing its job — this checks the *model's* behaviour, not the
 *   parser's, since a hallucinated ref should simply fail to resolve)
 * - does it stay conversational (zero tags) on a prompt with nothing concrete to tag
 * - does it produce a usable syllabus/mastery breakdown when asked to
 *
 * Output: a console summary table plus a full JSON+Markdown report under
 * `docs/eval/` for human review.
 */

import { composeSystemPrompt } from "../src/entities/agentPrompts";
import { parseAgentTags, AgentTagCardRef } from "../src/entities/agentTags";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const MODELS = [
  "google/gemma-4-26b-a4b-it:free",
  "nvidia/nemotron-3-nano-30b-a3b:free",
  "nvidia/nemotron-nano-9b-v2:free",
] as const;

/** A stand-in workspace: enough cards to make card-reference behaviour observable. */
const FAKE_CARDS: AgentTagCardRef[] = [
  { id: "c1", title: "Spaced repetition basics" },
  { id: "c2", title: "Forgetting curve" },
  { id: "c3", title: "WebGPU pipeline overview" },
];

function briefing(userMessage: string): string {
  const lines: string[] = ["Cards in scope, numbered:"];
  FAKE_CARDS.forEach((card, i) => lines.push(`${i + 1}. ${card.title}: (placeholder body)`));
  lines.push("\nConversation so far:");
  lines.push(`user: ${userMessage}`);
  return lines.join("\n");
}

interface EvalCase {
  name: string;
  message: string;
  /** What we actually care about for this case — human-readable, not a strict assertion. */
  expectation: string;
  /** If true, a model that produces zero tags is the CORRECT behaviour, not a miss. */
  zeroTagsIsCorrect?: boolean;
}

const CASES: EvalCase[] = [
  {
    name: "mastery-syllabus-breakdown",
    message:
      "I want to learn WebGPU rendering to mastery, starting from nothing. Can you break this into a syllabus I can work through and add to over time?",
    expectation: "A group tag (syllabus container) and/or several note tags forming ordered steps.",
  },
  {
    name: "single-fact-worth-keeping",
    message: "Explain why spacing beats massing for memory in one sentence, and save it.",
    expectation: "Exactly one note tag carrying the explanation.",
  },
  {
    name: "plain-question-no-artifact",
    message: "What's the difference between recall and recognition, just curious?",
    expectation: "Zero tags — a plain conversational answer.",
    zeroTagsIsCorrect: true,
  },
  {
    name: "group-existing-notes",
    message: "Group my WebGPU notes together, they all belong in one place.",
    expectation: "A group tag, ideally referencing card 3 (WebGPU pipeline overview) by number or title.",
  },
  {
    name: "multi-question-generation",
    message:
      "Turn the forgetting-curve idea into two or three quiz questions I can test myself with later.",
    expectation: "Two or three question tags.",
  },
];

interface CaseResult {
  model: string;
  case: string;
  ok: boolean;
  rawText: string;
  tagCount: number;
  tagTypes: string[];
  unresolvedTagCount: number;
  leakedBracketNoise: boolean;
  notes: string[];
}

async function callModel(model: string, message: string): Promise<string> {
  const apiKey = process.env.OPENROUTER_TEST_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_TEST_API_KEY is not set (check .env.local).");
  }
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://github.com/dbslim/lerminal",
      "X-Title": "GRIOT SLM eval",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: composeSystemPrompt("workspace-agent", undefined) },
        { role: "user", content: briefing(message) },
      ],
    }),
  });
  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`HTTP ${response.status}: ${errText.slice(0, 300)}`);
  }
  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error(`No text content in response: ${JSON.stringify(data).slice(0, 300)}`);
  }
  return content;
}

function evaluate(model: string, testCase: EvalCase, rawText: string): CaseResult {
  const parsed = parseAgentTags(rawText, {
    cards: FAKE_CARDS,
    contextCardIds: [],
  });

  // A parser miss looks like literal, unconsumed bracket syntax surviving into the
  // rendered text — the thing a user must never see.
  const leakedBracketNoise = /\[\[|\]\]/.test(parsed.text);

  const unresolvedTagCount = parsed.tags.filter(t => !t.intent).length;

  const notes: string[] = [];
  if (testCase.zeroTagsIsCorrect && parsed.tags.length > 0) {
    notes.push(`Expected zero tags but got ${parsed.tags.length} — model over-tagged a plain question.`);
  }
  if (!testCase.zeroTagsIsCorrect && parsed.tags.length === 0) {
    notes.push("Expected at least one tag but got none — model stayed purely conversational.");
  }
  if (leakedBracketNoise) {
    notes.push("Raw [[ or ]] survived into rendered text — a real user-facing defect.");
  }
  if (unresolvedTagCount > 0) {
    notes.push(`${unresolvedTagCount} tag(s) referenced something that didn't resolve to a real card.`);
  }

  return {
    model,
    case: testCase.name,
    ok: notes.length === 0,
    rawText,
    tagCount: parsed.tags.length,
    tagTypes: parsed.tags.map(t => t.kindLabel ?? t.type ?? "?"),
    unresolvedTagCount,
    leakedBracketNoise,
    notes,
  };
}

async function main() {
  mkdirSync(join(process.cwd(), "docs", "eval"), { recursive: true });
  const results: CaseResult[] = [];

  for (const model of MODELS) {
    for (const testCase of CASES) {
      process.stdout.write(`Running ${model} / ${testCase.name}... `);
      try {
        const rawText = await callModel(model, testCase.message);
        const result = evaluate(model, testCase, rawText);
        results.push(result);
        console.log(result.notes.length === 0 ? "OK" : `FLAGGED (${result.notes.length})`);
      } catch (error: any) {
        results.push({
          model,
          case: testCase.name,
          ok: false,
          rawText: "",
          tagCount: 0,
          tagTypes: [],
          unresolvedTagCount: 0,
          leakedBracketNoise: false,
          notes: [`REQUEST FAILED: ${error?.message ?? error}`],
        });
        console.log(`REQUEST FAILED: ${error?.message ?? error}`);
      }
    }
  }

  // Console summary table.
  console.log("\n=== SUMMARY ===");
  console.log("model".padEnd(38), "case".padEnd(28), "tags", "flags");
  for (const r of results) {
    console.log(
      r.model.padEnd(38),
      r.case.padEnd(28),
      String(r.tagCount).padEnd(4),
      r.notes.length,
    );
  }

  const byModel: Record<string, { total: number; flagged: number }> = {};
  for (const r of results) {
    byModel[r.model] ??= { total: 0, flagged: 0 };
    byModel[r.model].total += 1;
    if (r.notes.length > 0) byModel[r.model].flagged += 1;
  }
  console.log("\n=== PER-MODEL FLAG RATE ===");
  for (const [model, stats] of Object.entries(byModel)) {
    console.log(`${model}: ${stats.total - stats.flagged}/${stats.total} clean`);
  }

  const jsonPath = join(process.cwd(), "docs", "eval", "slm-tag-grammar-results.json");
  writeFileSync(jsonPath, JSON.stringify(results, null, 2));

  const md = [
    "# Workspace Agent SLM tag-grammar eval",
    "",
    `Run at ${new Date().toISOString()}. Real OpenRouter calls against the app's actual`,
    "system prompt (`composeSystemPrompt(\"workspace-agent\")`) and the real",
    "`parseAgentTags` parser — see `scripts/evalWorkspaceAgentTags.ts`.",
    "",
    "| Model | Case | Tags | Flags |",
    "|---|---|---|---|",
    ...results.map(
      r => `| ${r.model} | ${r.case} | ${r.tagCount} | ${r.notes.length > 0 ? r.notes.join("; ") : "—"} |`,
    ),
    "",
    "## Raw responses",
    "",
    ...results.flatMap(r => [
      `### ${r.model} — ${r.case}`,
      "",
      "```",
      r.rawText || "(request failed)",
      "```",
      "",
    ]),
  ].join("\n");
  const mdPath = join(process.cwd(), "docs", "eval", "slm-tag-grammar-results.md");
  writeFileSync(mdPath, md);

  console.log(`\nWrote ${jsonPath}`);
  console.log(`Wrote ${mdPath}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
