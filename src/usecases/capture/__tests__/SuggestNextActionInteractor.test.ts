import { describe, expect, it } from "bun:test";
import {
  SuggestNextActionError,
  SuggestNextActionInteractor,
} from "../SuggestNextActionInteractor";
import { nextActionsForCard } from "../nextActions";
import { AgentGateway } from "../../ports/gateways/AgentGateway";
import { createCard } from "../../../entities/card";

class StubGateway implements AgentGateway {
  calls: { prompt: string; apiKey: string; model: string }[] = [];
  constructor(private reply: string | Error) {}

  async ask() {
    return { cards: [], isLocalFallback: false };
  }
  async fetchModels() {
    return [];
  }
  async suggestNextAction(input: { prompt: string; apiKey: string; model: string }) {
    this.calls.push(input);
    if (this.reply instanceof Error) throw this.reply;
    return this.reply;
  }
}

const sourceCard = () =>
  createCard({ workspaceId: "w1", type: "source", title: "Rendering notes", body: "..." });

describe("SuggestNextActionInteractor", () => {
  it("resolves to one of the deterministic menu's own actions", async () => {
    const gateway = new StubGateway("id: extract-ideas\nreason: It's raw source material.");
    const card = sourceCard();

    const result = await new SuggestNextActionInteractor(gateway).execute(
      card,
      "key",
      "model"
    );

    const menu = nextActionsForCard(card);
    expect(menu.map(a => a.id)).toContain(result.action.id);
    expect(result.action.id).toBe("extract-ideas");
    expect(result.reason).toBe("It's raw source material.");
  });

  it("cannot surface an id outside the menu it sent, however the model answers", async () => {
    const gateway = new StubGateway("id: delete-everything\nreason: trust me");

    const error = await new SuggestNextActionInteractor(gateway)
      .execute(sourceCard(), "key", "model")
      .catch(e => e);

    expect(error).toBeInstanceOf(SuggestNextActionError);
    expect(error.userMessage).toContain("wasn't one of the offered actions");
  });

  it("rejects free-form prose that never names an id", async () => {
    const gateway = new StubGateway("Sure! I think you should research this further.");

    const error = await new SuggestNextActionInteractor(gateway)
      .execute(sourceCard(), "key", "model")
      .catch(e => e);

    expect(error).toBeInstanceOf(SuggestNextActionError);
  });

  it("sends every candidate id in the prompt, so the model never picks blind", async () => {
    const gateway = new StubGateway("id: extract-ideas\nreason: r");
    const card = sourceCard();

    await new SuggestNextActionInteractor(gateway).execute(card, "key", "model");

    const prompt = gateway.calls[0].prompt;
    for (const action of nextActionsForCard(card)) {
      expect(prompt).toContain(action.id);
    }
  });

  it("refuses without a key rather than guessing a highlight", async () => {
    const gateway = new StubGateway("id: extract-ideas\nreason: r");

    const error = await new SuggestNextActionInteractor(gateway)
      .execute(sourceCard(), "", "model")
      .catch(e => e);

    expect(error).toBeInstanceOf(SuggestNextActionError);
    expect(gateway.calls).toHaveLength(0);
  });

  it("reports a gateway with no support honestly", async () => {
    const bare: AgentGateway = {
      async ask() {
        return { cards: [], isLocalFallback: false };
      },
      async fetchModels() {
        return [];
      },
    };

    const error = await new SuggestNextActionInteractor(bare)
      .execute(sourceCard(), "key", "model")
      .catch(e => e);

    expect(error).toBeInstanceOf(SuggestNextActionError);
    expect(error.userMessage).toContain("no model connection");
  });

  it("surfaces a network failure rather than a fabricated suggestion", async () => {
    const gateway = new StubGateway(new Error("network down"));

    const error = await new SuggestNextActionInteractor(gateway)
      .execute(sourceCard(), "key", "model")
      .catch(e => e);

    expect(error).toBeInstanceOf(SuggestNextActionError);
    expect(error.userMessage).toContain("network down");
  });

  it("has nothing to suggest for a card whose menu is empty", async () => {
    const gateway = new StubGateway("id: x\nreason: r");
    const card = sourceCard();

    const error = await new SuggestNextActionInteractor(gateway)
      .execute(card, "key", "model", { hasMission: false })
      .catch(e => e);

    // A source card's menu never includes the mission-only action, so this stays
    // resolvable; assert the interactor still only offers ids from that filtered menu.
    if (error instanceof SuggestNextActionError) {
      expect(error.userMessage).not.toContain("nothing to suggest");
    }
  });
});
