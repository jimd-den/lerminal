import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative, resolve } from "path";

/**
 * # Dependency Rule
 *
 * ## Business Value & Purpose
 * Clean Architecture only pays off while dependencies point inward. This test is the
 * enforcement mechanism: it reads every source file, resolves its imports, and fails
 * the build when an inner layer reaches out to an outer one. Without it, a single
 * convenience import silently couples the domain to AsyncStorage or React Native and
 * the boundary erodes one commit at a time.
 */

const SRC_ROOT = resolve(import.meta.dir, "..");

/** Layers ordered innermost-first; a layer may only import from itself and layers before it. */
const LAYERS = ["entities", "usecases", "adapters", "frameworks"] as const;
type Layer = (typeof LAYERS)[number];

const layerRank = (layer: Layer): number => LAYERS.indexOf(layer);

/** Maps a repo-relative source path onto the layer that owns it, if any. */
function layerOf(path: string): Layer | null {
  const [head] = path.split("/");
  return (LAYERS as readonly string[]).includes(head) ? (head as Layer) : null;
}

/** Test files are exempt: a test may reach outward to assemble real implementations. */
const isTestFile = (path: string): boolean =>
  path.includes("__tests__/") || path.endsWith(".test.ts") || path.endsWith(".test.tsx");

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (/\.tsx?$/.test(entry)) yield full;
  }
}

const IMPORT_PATTERN = /(?:from|import)\s+["'](\.[^"']+)["']/g;

/** Extracts the relative import specifiers of a file, resolved to repo-relative paths. */
function relativeImports(absPath: string, source: string): string[] {
  const fromDir = resolve(absPath, "..");
  return [...source.matchAll(IMPORT_PATTERN)].map((match) =>
    relative(SRC_ROOT, resolve(fromDir, match[1])).replace(/\\/g, "/"),
  );
}

interface Violation {
  file: string;
  imported: string;
  from: Layer;
  to: Layer;
}

function findViolations(): Violation[] {
  const violations: Violation[] = [];

  for (const absPath of walk(SRC_ROOT)) {
    const file = relative(SRC_ROOT, absPath).replace(/\\/g, "/");
    if (isTestFile(file)) continue;

    const from = layerOf(file);
    if (!from) continue;

    for (const imported of relativeImports(absPath, readFileSync(absPath, "utf8"))) {
      const to = layerOf(imported);
      if (!to) continue;
      if (layerRank(to) > layerRank(from)) {
        violations.push({ file, imported, from, to });
      }
    }
  }

  return violations;
}

const describeViolation = (v: Violation): string =>
  `${v.file} (${v.from}) imports ${v.imported} (${v.to})`;

/**
 * Layers that must not decide *how* to log. They report through the `Logger` port and the
 * composition root chooses the implementation; a stray `console.*` both bypasses that
 * choice and, in this app, tends to serialize the user's own card content to a log.
 */
const NO_CONSOLE_LAYERS: readonly Layer[] = ["entities", "usecases", "adapters"];

function findConsoleUses(): string[] {
  const offenders: string[] = [];
  for (const absPath of walk(SRC_ROOT)) {
    const file = relative(SRC_ROOT, absPath).replace(/\\/g, "/");
    if (isTestFile(file)) continue;

    const layer = layerOf(file);
    if (!layer || !NO_CONSOLE_LAYERS.includes(layer)) continue;

    const source = readFileSync(absPath, "utf8");
    source.split("\n").forEach((line, index) => {
      if (/\bconsole\.(log|warn|error|info|debug)\(/.test(line)) {
        offenders.push(`${file}:${index + 1}`);
      }
    });
  }
  return offenders;
}

describe("dependency rule", () => {
  it("never lets an inner layer import an outer one", () => {
    const violations = findViolations();
    expect(violations.map(describeViolation)).toEqual([]);
  });

  it("scans a meaningful number of files (guards against a broken walker)", () => {
    expect([...walk(SRC_ROOT)].length).toBeGreaterThan(50);
  });

  it("keeps logging policy out of the inner layers", () => {
    expect(findConsoleUses()).toEqual([]);
  });
});
