import { describe, expect, it } from "bun:test";
import {
  FontFamilySummary,
  rankFontFamilies,
  scoreFontFamily,
} from "../fontCatalog";

const family = (
  name: string,
  popularity: number,
  category: FontFamilySummary["category"] = "Sans Serif"
): FontFamilySummary => ({
  family: name,
  category,
  popularity,
  designers: [],
  axes: [],
});

const CATALOG: FontFamilySummary[] = [
  family("Roboto", 1),
  family("Open Sans", 2),
  family("Roboto Condensed", 5),
  family("Lato", 6),
  family("Inter", 8),
  family("JetBrains Mono", 120, "Monospace"),
  family("Roboto Mono", 40, "Monospace"),
  family("EB Garamond", 200, "Serif"),
  family("Cormorant Garamond", 300, "Serif"),
  family("Dancing Script", 150, "Handwriting"),
];

const names = (query: string, options = {}) =>
  rankFontFamilies(query, CATALOG, options).map(r => r.summary.family);

describe("scoreFontFamily", () => {
  it("ranks an exact match above a prefix, and a prefix above a substring", () => {
    const exact = scoreFontFamily("roboto", "Roboto")!;
    const prefix = scoreFontFamily("roboto", "Roboto Mono")!;
    const substring = scoreFontFamily("mono", "Roboto Mono")!;

    expect(exact).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(substring);
  });

  it("ignores case and punctuation, which are the user's least reliable input", () => {
    expect(scoreFontFamily("JETBRAINS-MONO", "JetBrains Mono")).toBe(
      scoreFontFamily("jetbrains mono", "JetBrains Mono")
    );
  });

  it("matches a word in the middle of a name", () => {
    expect(scoreFontFamily("garamond", "Cormorant Garamond")).not.toBeNull();
  });

  it("tolerates dropped letters, so a misremembered name still finds the font", () => {
    expect(scoreFontFamily("garamnd", "EB Garamond")).not.toBeNull();
    expect(scoreFontFamily("jetbrans", "JetBrains Mono")).not.toBeNull();
  });

  it("matches words in any order", () => {
    expect(scoreFontFamily("mono jetbrains", "JetBrains Mono")).not.toBeNull();
  });

  it("rejects a family that shares no ordered run of letters", () => {
    expect(scoreFontFamily("zzzz", "Roboto")).toBeNull();
  });

  it("treats an empty query as matching everything equally", () => {
    expect(scoreFontFamily("", "Roboto")).toBe(0);
  });
});

describe("rankFontFamilies", () => {
  it("puts the exact match first even when a rival is far more popular", () => {
    // Roboto Condensed is more popular than Cormorant Garamond by a wide margin; an
    // exact hit must still win, or search would only ever surface famous fonts.
    expect(names("cormorant garamond")[0]).toBe("Cormorant Garamond");
  });

  it("prefers the shortest name among equally-good prefix matches", () => {
    // "Roboto Mono" is a tighter fit for "roboto" than "Roboto Condensed", even though
    // Condensed is the more popular family — closeness of match outranks fame.
    expect(names("roboto")).toEqual(["Roboto", "Roboto Mono", "Roboto Condensed"]);
  });

  it("breaks a genuine tie by popularity", () => {
    const tied = [family("Alpha Sans", 90), family("Omega Sans", 4)];

    // Identical name length and match tier, so only popularity can separate them.
    expect(rankFontFamilies("sans", tied).map(r => r.summary.family)).toEqual([
      "Omega Sans",
      "Alpha Sans",
    ]);
  });

  it("lists the most popular families when nothing has been typed", () => {
    expect(names("", { limit: 3 })).toEqual(["Roboto", "Open Sans", "Roboto Condensed"]);
  });

  it("restricts results to a category when one is chosen", () => {
    expect(names("", { category: "Monospace" })).toEqual([
      "Roboto Mono",
      "JetBrains Mono",
    ]);
  });

  it("applies the category filter and the query together", () => {
    expect(names("roboto", { category: "Monospace" })).toEqual(["Roboto Mono"]);
  });

  it("honours the result limit, since every shown row costs a font download", () => {
    expect(names("", { limit: 2 })).toHaveLength(2);
  });

  it("returns nothing when the query genuinely matches nothing", () => {
    expect(names("qqqqzzzz")).toEqual([]);
  });

  it("treats a kind of font as a search term", () => {
    // "handwriting" is nobody's family name — describing the look has to work.
    expect(names("handwriting")).toEqual(["Dancing Script"]);
    expect(names("hand writing")).toEqual(["Dancing Script"]);
  });

  it("puts monospace faces above display fonts that merely start with 'mono'", () => {
    const withDecoy = [...CATALOG, family("Monoton", 150, "Display")];

    const ranked = rankFontFamilies("mono", withDecoy).map(r => r.summary.family);

    expect(ranked.slice(0, 2)).toEqual(["Roboto Mono", "JetBrains Mono"]);
    expect(ranked).toContain("Monoton");
  });

  it("still finds a family whose full name is typed, even if it looks like a category", () => {
    const withDecoy = [...CATALOG, family("Monoton", 150, "Display")];

    expect(rankFontFamilies("monoton", withDecoy)[0].summary.family).toBe("Monoton");
  });
});
