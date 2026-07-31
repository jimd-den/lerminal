import { describe, expect, it } from "bun:test";
import {
  createAssistantProfile,
  duplicateAssistantProfile,
  resolveAssistantProfile,
  resolveContextPolicy,
  resolveOutputPolicy,
  resolveWebPolicy,
  resolveProfileScope,
  isProfileEditable,
  DEFAULT_CONTEXT_POLICY,
  DEFAULT_OUTPUT_POLICY,
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

  it("defaults policies for a profile that predates them", () => {
    const legacy = BUILTIN_ASSISTANT_PROFILES[0];

    expect(resolveContextPolicy(legacy)).toEqual(DEFAULT_CONTEXT_POLICY);
    expect(resolveOutputPolicy(legacy)).toEqual(DEFAULT_OUTPUT_POLICY);
    expect(resolveWebPolicy(legacy)).toBe("never");
    expect(resolveProfileScope(legacy)).toBe("global");
  });

  it("treats a builtin as not editable, and everything else as editable, by default", () => {
    expect(isProfileEditable(BUILTIN_ASSISTANT_PROFILES[0])).toBe(false);

    const custom = createAssistantProfile({
      name: "x",
      capability: "generate-cards",
      systemPrompt: "x",
    });
    expect(isProfileEditable(custom)).toBe(true);
  });

  it("duplicating a builtin never mutates it, and marks the copy editable", () => {
    const source = BUILTIN_ASSISTANT_PROFILES[0];
    const original = { ...source };

    const copy = duplicateAssistantProfile(source);

    expect(source).toEqual(original);
    expect(copy.id).not.toBe(source.id);
    expect(copy.builtin).toBe(false);
    expect(copy.isEditable).toBe(true);
    expect(copy.sourceProfileId).toBe(source.id);
    expect(copy.systemPrompt).toBe(source.systemPrompt);
  });

  it("excludes a workspace-scoped profile from a different workspace", () => {
    const ws1Profile = createAssistantProfile({
      name: "WS1 only",
      capability: "chat",
      systemPrompt: "x",
      scope: "workspace",
      workspaceId: "ws-1",
    });

    const forWs2 = resolveAssistantProfile(
      "chat",
      {},
      [ws1Profile],
      BUILTIN_ASSISTANT_PROFILES,
      undefined,
      "ws-2"
    );
    const forWs1 = resolveAssistantProfile(
      "chat",
      {},
      [ws1Profile],
      BUILTIN_ASSISTANT_PROFILES,
      undefined,
      "ws-1"
    );

    expect(forWs2.id).not.toBe(ws1Profile.id);
    expect(forWs1.id).toBe(ws1Profile.id);
  });
});
