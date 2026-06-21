import { describe, expect, it } from "bun:test";
import {
  BUILTIN_PROMPT_PRESETS,
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
});
