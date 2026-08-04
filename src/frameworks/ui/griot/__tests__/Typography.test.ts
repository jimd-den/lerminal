import { describe, expect, it } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { resolveTextStyle, specifiesFontFamily } from "../fontStyle";

/**
 * Choosing a typeface used to change roughly the two-thirds of the app's text that had
 * `theme.fontMono` threaded in by hand; everything else silently kept the platform font,
 * so the setting read as broken. These tests pin both halves of the fix: the merge rule
 * that makes the default safe, and the structural rule that keeps it universal.
 */
describe("resolveTextStyle", () => {
  it("applies the chosen face when the caller named none", () => {
    expect(resolveTextStyle({ fontSize: 12 }, "Inter")).toEqual([
      { fontFamily: "Inter" },
      { fontSize: 12 },
    ]);
  });

  it("leaves a deliberate face alone, so mono labels stay mono", () => {
    const style = { fontSize: 12, fontFamily: "Menlo" };
    expect(resolveTextStyle(style, "Inter")).toBe(style);
  });

  it("sees a face named anywhere in an array style", () => {
    const style = [{ fontSize: 12 }, { fontFamily: "Menlo" }];
    expect(resolveTextStyle(style, "Inter")).toBe(style);
    expect(specifiesFontFamily(style)).toBe(true);
  });

  it("puts the default first, so the caller's other properties still win", () => {
    const resolved = resolveTextStyle({ color: "red" }, "Inter") as unknown[];
    expect(resolved[0]).toEqual({ fontFamily: "Inter" });
  });

  it("changes nothing when the user is on the platform font", () => {
    const style = { fontSize: 12 };
    expect(resolveTextStyle(style, undefined)).toBe(style);
  });
});

describe("every text element goes through the themed components", () => {
  const uiDir = path.join(__dirname, "..", "..");

  const sourceFiles = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return entry.name === "__tests__" ? [] : sourceFiles(full);
      return entry.name.endsWith(".tsx") ? [full] : [];
    });

  it("never imports Text or TextInput straight from react-native", () => {
    const offenders = sourceFiles(uiDir).filter((file) => {
      if (file.endsWith("Typography.tsx")) return false;
      const source = fs.readFileSync(file, "utf-8");
      const rnImport = source.match(/import \{([^}]*)\} from "react-native";/);
      if (!rnImport) return false;
      return /(^|[\s,])(Text|TextInput)([\s,]|$)/.test(rnImport[1]);
    });
    expect(offenders).toEqual([]);
  });

  it("names a face on the markdown body, which builds its own text elements", () => {
    const detail = fs.readFileSync(path.join(uiDir, "griot", "CardDetailModal.tsx"), "utf-8");
    const body = detail.match(/body: \{ color: theme\.text[^}]*\}/)?.[0] ?? "";
    expect(body).toContain("fontFamily: theme.fontSans");
  });
});
