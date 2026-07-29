import { describe, expect, it } from "bun:test";
import {
  createAssistantProfile,
  resolveAssistantProfile,
  BUILTIN_ASSISTANT_PROFILES,
  AssistantProfile,
} from "../assistantProfile";

/**
 * # Assistant Profile Domain Unit Tests
 *
 * ## Business Value & Rationale
 * Validates the instantiation, normalization, built-in seeding, and capability resolution
 * of goal-specific AI Assistance Profiles.
 */
describe("Assistant Profile Domain Entity", () => {
  it("should create a valid custom AssistantProfile entity with defaults", () => {
    const profile = createAssistantProfile({
      name: "Graphics Implementation Coach",
      description: "Focuses on vulkan, metal, and rendering pipeline tradeoffs",
      goal: "Turn graphics articles into actionable C++ architectural cards",
      capability: "generate-cards",
      systemPrompt: "Prioritize memory alignment, GPU pipeline barriers, and draw call batching.",
    });

    expect(profile.id).toBeDefined();
    expect(profile.name).toBe("Graphics Implementation Coach");
    expect(profile.capability).toBe("generate-cards");
    expect(profile.systemPrompt).toContain("GPU pipeline barriers");
    expect(profile.builtin).toBe(false);
    expect(profile.createdAt).toBeGreaterThan(0);
  });

  it("should provide built-in profiles for generate-cards, chunk-document, chat, and cloze", () => {
    expect(BUILTIN_ASSISTANT_PROFILES.length).toBeGreaterThan(0);
    expect(BUILTIN_ASSISTANT_PROFILES.some(p => p.capability === "generate-cards")).toBe(true);
    expect(BUILTIN_ASSISTANT_PROFILES.some(p => p.capability === "chunk-document")).toBe(true);
    expect(BUILTIN_ASSISTANT_PROFILES.some(p => p.capability === "chat")).toBe(true);
    expect(BUILTIN_ASSISTANT_PROFILES.some(p => p.capability === "cloze")).toBe(true);
  });

  it("resolveAssistantProfile should find active profile by capability or fallback to built-in default", () => {
    const customProfiles: AssistantProfile[] = [
      createAssistantProfile({
        id: "p-custom-chunk",
        name: "Custom Chunker",
        description: "Custom",
        goal: "Goal",
        capability: "chunk-document",
        systemPrompt: "Custom chunking prompt.",
      }),
    ];

    const activeProfileIds = { "chunk-document": "p-custom-chunk" };

    const resolved = resolveAssistantProfile(
      "chunk-document",
      activeProfileIds,
      customProfiles,
      BUILTIN_ASSISTANT_PROFILES
    );

    expect(resolved.id).toBe("p-custom-chunk");
    expect(resolved.systemPrompt).toBe("Custom chunking prompt.");
  });

  it("resolveAssistantProfile should support lookup by profile name or id override", () => {
    const custom = createAssistantProfile({
      id: "p-exam",
      name: "Exam Prep Coach",
      description: "Exam",
      goal: "Goal",
      capability: "generate-cards",
      systemPrompt: "Exam prompt",
    });

    const byName = resolveAssistantProfile(
      "generate-cards",
      {},
      [custom],
      BUILTIN_ASSISTANT_PROFILES,
      "Exam Prep Coach"
    );

    expect(byName.id).toBe("p-exam");
  });
});
