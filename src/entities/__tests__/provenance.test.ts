import { describe, expect, it } from "bun:test";
import { createProvenance } from "../provenance";

describe("Provenance Entity Factory", () => {
  it("should default createdAt and leave optional fields unset when omitted", () => {
    const prov = createProvenance({ mode: "manual" });

    expect(prov.mode).toBe("manual");
    expect(prov.createdAt).toBeLessThanOrEqual(Date.now());
    expect(prov.sourceCardIds).toBeUndefined();
    expect(prov.isLocalFallback).toBeUndefined();
  });

  it("should capture agent provenance including local-fallback labeling", () => {
    const prov = createProvenance({
      mode: "agent",
      operationId: "op-1",
      sourceCardIds: ["c1", "c2"],
      assistantProfileId: "builtin-generate-cards",
      model: "openrouter/some-model",
      isLocalFallback: true,
    });

    expect(prov.mode).toBe("agent");
    expect(prov.sourceCardIds).toEqual(["c1", "c2"]);
    expect(prov.isLocalFallback).toBe(true);
  });

  it("should capture search provenance with query and retained URLs", () => {
    const prov = createProvenance({
      mode: "search",
      searchQuery: "eigenvectors intuition",
      sourceUrls: ["https://example.com/a", "https://example.com/b"],
    });

    expect(prov.mode).toBe("search");
    expect(prov.searchQuery).toBe("eigenvectors intuition");
    expect(prov.sourceUrls?.length).toBe(2);
  });

  it("should carry citations linking excerpts back to sources", () => {
    const prov = createProvenance({
      mode: "extraction",
      citations: [{ excerpt: "Mitochondria are the powerhouse...", url: "https://example.com" }],
    });

    expect(prov.citations?.[0].excerpt).toContain("Mitochondria");
  });
});
