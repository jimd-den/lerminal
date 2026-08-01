import { describe, expect, it } from "bun:test";
import {
  CANONICAL_ACTIONS,
  COMMAND_DOCS,
  commandAvailability,
  findCommandDoc,
  resolveCommandAlias,
} from "../commandCatalog";
import { RESERVED_COMMAND_NAMES } from "../../../entities/commandDefinition";

describe("COMMAND_DOCS", () => {
  it("documents every reserved built-in keyword, so no command is undiscoverable", () => {
    const documented = new Set(COMMAND_DOCS.map(d => d.name));
    for (const reserved of RESERVED_COMMAND_NAMES) {
      expect(documented.has(reserved)).toBe(true);
    }
  });

  it("gives every command a label, purpose, input description, and output", () => {
    for (const doc of COMMAND_DOCS) {
      expect(doc.label.length).toBeGreaterThan(0);
      expect(doc.purpose.length).toBeGreaterThan(0);
      expect(doc.input.description.length).toBeGreaterThan(0);
      expect(doc.output.length).toBeGreaterThan(0);
    }
  });

  it("marks only the genuinely networked commands as using the web", () => {
    const web = COMMAND_DOCS.filter(d => d.usesWeb).map(d => d.name).sort();
    // `ask` must NOT be here: it reads the selection and calls a model, but never browses.
    expect(web).toEqual(["search", "source"]);
  });

  it("finds a doc case-insensitively", () => {
    expect(findCommandDoc("CHUNK")?.name).toBe("chunk");
    expect(findCommandDoc("nope")).toBeUndefined();
  });
});

describe("commandAvailability", () => {
  it("blocks a selection-hungry command when nothing is selected, and says what it needs", () => {
    const chunk = findCommandDoc("chunk")!;

    const result = commandAvailability(chunk, 0);

    expect(result.runnable).toBe(false);
    expect(result.reason).toContain("Needs a selection");
  });

  it("allows a selection-hungry command once something is selected", () => {
    expect(commandAvailability(findCommandDoc("chunk")!, 2).runnable).toBe(true);
  });

  it("treats argument commands as runnable with no selection — they open the input sheet", () => {
    expect(commandAvailability(findCommandDoc("search")!, 0).runnable).toBe(true);
    expect(commandAvailability(findCommandDoc("note")!, 0).runnable).toBe(true);
  });

  it("treats fresh-start commands as always runnable", () => {
    expect(commandAvailability(findCommandDoc("review")!, 0).runnable).toBe(true);
    expect(commandAvailability(findCommandDoc("ask")!, 0).runnable).toBe(true);
  });
});

describe("CANONICAL_ACTIONS", () => {
  it("covers the ten canonical user-facing actions", () => {
    expect(CANONICAL_ACTIONS.map(a => a.id)).toEqual([
      "capture",
      "explain",
      "research",
      "prereqs",
      "connect",
      "experiment",
      "study",
      "review",
      "status",
      "build",
    ]);
  });

  it("routes every AI-backed action through the preflight, never a direct run", () => {
    const aiBacked = CANONICAL_ACTIONS.filter(a => a.dispatch.kind === "preflight");
    expect(aiBacked.length).toBeGreaterThan(0);
    for (const action of CANONICAL_ACTIONS) {
      expect(["preflight", "pipeline", "mission", "palette", "status", "capture"]).toContain(
        action.dispatch.kind
      );
    }
  });

  it("marks only Research web as touching the web", () => {
    expect(CANONICAL_ACTIONS.filter(a => a.usesWeb).map(a => a.id)).toEqual(["research"]);
  });

  it("gives every action a unique /alias", () => {
    const aliases = CANONICAL_ACTIONS.map(a => a.alias);
    expect(new Set(aliases).size).toBe(aliases.length);
    expect(aliases.every(alias => alias.startsWith("/"))).toBe(true);
  });
});

describe("resolveCommandAlias", () => {
  it("resolves each documented alias", () => {
    expect(resolveCommandAlias("/research")?.id).toBe("research");
    expect(resolveCommandAlias("/prereqs")?.id).toBe("prereqs");
    expect(resolveCommandAlias("/experiment")?.id).toBe("experiment");
    expect(resolveCommandAlias("/study")?.id).toBe("study");
    expect(resolveCommandAlias("/status")?.id).toBe("status");
    expect(resolveCommandAlias("/build")?.id).toBe("build");
  });

  it("is case- and whitespace-insensitive", () => {
    expect(resolveCommandAlias("  /RESEARCH  ")?.id).toBe("research");
  });

  it("ignores anything without a leading slash", () => {
    expect(resolveCommandAlias("research")).toBeNull();
  });

  it("leaves an alias with an argument alone, so it falls through to the pipeline parser", () => {
    expect(resolveCommandAlias('/research "eigenvectors"')).toBeNull();
  });

  it("returns null for an unknown alias", () => {
    expect(resolveCommandAlias("/nonsense")).toBeNull();
  });
});
