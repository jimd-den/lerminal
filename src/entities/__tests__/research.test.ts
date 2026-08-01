import { describe, expect, it } from "bun:test";
import { assessRelevance, classifyEvidenceKind, normalizeSearchResults } from "../research";

describe("classifyEvidenceKind", () => {
  it("classifies .gov/.edu/arxiv as academic", () => {
    expect(classifyEvidenceKind("https://www.nist.gov/page")).toBe("academic");
    expect(classifyEvidenceKind("https://cs.stanford.edu/paper")).toBe("academic");
    expect(classifyEvidenceKind("https://arxiv.org/abs/1234")).toBe("academic");
  });

  it("classifies wikipedia as reference", () => {
    expect(classifyEvidenceKind("https://en.wikipedia.org/wiki/FSRS")).toBe("reference");
  });

  it("classifies docs./developer./github as official-docs", () => {
    expect(classifyEvidenceKind("https://docs.expo.dev/versions/latest")).toBe("official-docs");
    expect(classifyEvidenceKind("https://developer.mozilla.org/en-US/")).toBe("official-docs");
    expect(classifyEvidenceKind("https://github.com/facebook/react")).toBe("official-docs");
  });

  it("classifies stackoverflow/reddit as forum", () => {
    expect(classifyEvidenceKind("https://stackoverflow.com/questions/1")).toBe("forum");
  });

  it("falls back to unknown for an unrecognized domain", () => {
    expect(classifyEvidenceKind("https://some-random-site.example/post")).toBe("unknown");
  });
});

describe("assessRelevance", () => {
  it("rates high relevance when most query words appear in the result", () => {
    const label = assessRelevance("eigenvectors linear algebra", "Eigenvectors in Linear Algebra Explained", "A guide to eigenvectors and linear algebra basics");
    expect(label).toBe("High relevance");
  });

  it("rates low relevance when the result shares almost no words with the query", () => {
    const label = assessRelevance("eigenvectors linear algebra", "Best pizza recipes", "How to make a great pizza at home");
    expect(label).toBe("Low relevance");
  });
});

describe("normalizeSearchResults", () => {
  it("defaults every candidate to keepState 'undecided' and assigns 1-based rank", () => {
    const results = normalizeSearchResults(
      [
        { title: "A", url: "https://a.example/x", snippet: "s" },
        { title: "B", url: "https://b.example/y", snippet: "s" },
      ],
      "query",
      1000
    );

    expect(results[0].rank).toBe(1);
    expect(results[1].rank).toBe(2);
    expect(results.every(r => r.keepState === "undecided")).toBe(true);
    expect(results.every(r => r.accessedAt === 1000)).toBe(true);
  });

  it("flags a second result from the same domain as a duplicate-domain caution", () => {
    const results = normalizeSearchResults(
      [
        { title: "A", url: "https://example.com/a", snippet: "s" },
        { title: "B", url: "https://example.com/b", snippet: "s" },
      ],
      "query"
    );

    expect(results[0].cautions).not.toContain("Same domain as an earlier result in this list");
    expect(results[1].cautions).toContain("Same domain as an earlier result in this list");
  });

  it("carries the query and raw fields through onto each normalized result", () => {
    const [result] = normalizeSearchResults(
      [{ title: "Title", url: "https://docs.expo.dev/x", snippet: "Snippet text" }],
      "expo sdk"
    );

    expect(result.title).toBe("Title");
    expect(result.snippet).toBe("Snippet text");
    expect(result.query).toBe("expo sdk");
    expect(result.evidenceKind).toBe("official-docs");
    expect(result.extractedText).toBeUndefined();
  });
});
