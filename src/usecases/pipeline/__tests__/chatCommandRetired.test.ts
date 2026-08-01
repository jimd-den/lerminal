import { describe, expect, it } from "bun:test";
import { CommandRegistry } from "../CommandRegistry";
import { UnknownCommandError } from "../../errors";
import { COMMAND_DOCS } from "../../commands/commandCatalog";
import { RESERVED_COMMAND_NAMES } from "../../../entities/commandDefinition";
import { BUILTIN_CARD_TYPES } from "../../../entities/cardTypeDefinition";

/**
 * The per-card "Discuss" surface (a `chat` card you talked to) is retired in favour of
 * the workspace agent. These tests pin the two halves of that retirement: nothing can
 * *create* a chat session any more, but the `chat` card type survives so conversations
 * users already saved still load.
 */
const registry = () =>
  new CommandRegistry({
    cardRepo: {} as any,
    settingsRepo: {} as any,
    agentGateway: {} as any,
    searchGateway: {} as any,
    extractionGateway: {} as any,
    createNote: {} as any,
    groupCards: {} as any,
  });

describe("retired chat command", () => {
  it("is no longer registered — running it is an unknown command", async () => {
    const runner = registry().getRunner();

    await expect(
      runner.run('chat "eigenvectors discussion"', {
        workspaceId: "w1",
        parentId: null,
        initialInputCards: [],
        workspaces: [],
        apiKey: "",
        model: "",
      } as any),
    ).rejects.toBeInstanceOf(UnknownCommandError);
  });

  it("is gone from the command catalog and the reserved keyword list", () => {
    expect(COMMAND_DOCS.some((doc) => doc.name === "chat")).toBe(false);
    expect(RESERVED_COMMAND_NAMES).not.toContain("chat");
  });

  it("keeps `chat` as a card type so existing chat cards are not orphaned", () => {
    const chatType = BUILTIN_CARD_TYPES.find((type) => type.id === "chat");
    expect(chatType).toBeDefined();
    expect(chatType!.builtin).toBe(true);
  });
});
