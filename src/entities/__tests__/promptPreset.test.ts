import { describe, expect, it } from "bun:test";
import {
  BUILTIN_PROMPT_PRESETS,
  CHUNK_RESPONSE_FORMAT_PROMPT,
  composeCardPrompt,
  createPromptPreset,
  DEFAULT_CARD_INSTRUCTION,
  RESPONSE_FORMAT_PROMPT,
} from "../promptPreset";

describe("Card prompt composition", () => {
  it("always appends the strict format contract after the instruction", () => {
    const out = composeCardPrompt("Make playful cards");
    expect(out.startsWith("Make playful cards")).toBe(true);
    expect(out).toContain(RESPONSE_FORMAT_PROMPT);
    expect(out).toContain("Respond ONLY with a valid JSON array");
    expect(out).toContain("return at least one useful card");
  });

  it("falls back to the default instruction when none is given", () => {
    expect(composeCardPrompt("")).toContain(DEFAULT_CARD_INSTRUCTION);
  });

  it("seeds named, format-free instruction presets", () => {
    expect(BUILTIN_PROMPT_PRESETS.length).toBeGreaterThan(0);
    expect(BUILTIN_PROMPT_PRESETS.every(p => p.builtin)).toBe(true);
    // Presets are pure instructions — they don't carry JSON boilerplate.
    expect(BUILTIN_PROMPT_PRESETS.every(p => !p.prompt.includes("JSON array"))).toBe(true);
  });

  it("creates user presets as non-builtin", () => {
    const p = createPromptPreset({ name: "Mine", prompt: "do a thing" });
    expect(p.builtin).toBe(false);
    expect(p.name).toBe("Mine");
  });

  it("appends the chunks-v1 contract (with provenance fields) when requested", () => {
    const out = composeCardPrompt("Break this into chunks", "chunks-v1");
    expect(out.startsWith("Break this into chunks")).toBe(true);
    expect(out).toContain(CHUNK_RESPONSE_FORMAT_PROMPT);
    expect(out).toContain("sourceCardId");
    expect(out).toContain("sourceExcerpt");
    // Never silently falls back to the generic card shape.
    expect(out).not.toContain(RESPONSE_FORMAT_PROMPT);
  });

  it("appends no format contract for conversation-v1 (free-text chat)", () => {
    const out = composeCardPrompt("Be a Socratic tutor", "conversation-v1");
    expect(out).toBe("Be a Socratic tutor");
    expect(out).not.toContain("Respond ONLY with a valid JSON array");
  });

  it("defaults to the cards-v1 contract when no contract kind is given", () => {
    const out = composeCardPrompt("Make playful cards");
    expect(out).toContain(RESPONSE_FORMAT_PROMPT);
  });
});
