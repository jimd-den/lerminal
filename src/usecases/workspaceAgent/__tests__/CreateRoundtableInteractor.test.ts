import { describe, expect, it } from "bun:test";
import { CreateRoundtableInteractor } from "../CreateRoundtableInteractor";
import { AssistantProfile } from "../../../entities/assistantProfile";
import { Roundtable, createRoundtable, resolveRoundtableMembers } from "../../../entities/roundtable";
import { RoundtableDesignResponse } from "../../ports/gateways/AgentGateway";

class MemoryProfileRepo {
  profiles: AssistantProfile[] = [];
  async getProfiles() {
    return this.profiles;
  }
  async saveProfile(profile: AssistantProfile) {
    this.profiles.push(profile);
  }
  async deleteProfile(id: string) {
    this.profiles = this.profiles.filter(p => p.id !== id);
  }
}

class MemoryRoundtableRepo {
  roundtables: Roundtable[] = [];
  async getRoundtables() {
    return this.roundtables;
  }
  async saveRoundtable(roundtable: Roundtable) {
    this.roundtables.push(roundtable);
  }
  async deleteRoundtable(id: string) {
    this.roundtables = this.roundtables.filter(r => r.id !== id);
  }
}

const design = (members: RoundtableDesignResponse["members"]): RoundtableDesignResponse => ({
  nameSuggestion: "The Panel",
  members,
});

function build(
  designRoundtable?: (input: any) => Promise<RoundtableDesignResponse>
) {
  const profileRepo = new MemoryProfileRepo();
  const roundtableRepo = new MemoryRoundtableRepo();
  const interactor = new CreateRoundtableInteractor({
    agentGateway: { designRoundtable } as any,
    profileRepo,
    roundtableRepo,
  });
  return { interactor, profileRepo, roundtableRepo };
}

const request = {
  name: "",
  brief: "Feynman and a skeptical statistician",
  apiKey: "key",
  model: "some/model",
};

describe("CreateRoundtableInteractor", () => {
  it("turns each character into an ordinary chat profile the user can also ask alone", async () => {
    const { interactor, profileRepo } = build(async () =>
      design([
        { name: "Feynman", description: "Explains by taking it apart", systemPrompt: "Be Feynman." },
        { name: "The Statistician", description: "Distrusts the sample", systemPrompt: "Be skeptical." },
      ])
    );

    const result = await interactor.execute(request);

    expect(result.members.map(m => m.name)).toEqual(["Feynman", "The Statistician"]);
    expect(profileRepo.profiles.length).toBe(2);
    for (const profile of profileRepo.profiles) {
      expect(profile.capability).toBe("chat");
      expect(profile.outputContract).toBe("conversation-v1");
      // Unpinned, so the panel follows whatever model the app is set to.
      expect(profile.model).toBeUndefined();
    }
  });

  it("keeps the panel in the order the characters were designed", async () => {
    const { interactor, roundtableRepo } = build(async () =>
      design([
        { name: "First", description: "", systemPrompt: "a" },
        { name: "Second", description: "", systemPrompt: "b" },
        { name: "Third", description: "", systemPrompt: "c" },
      ])
    );

    const { members } = await interactor.execute(request);
    expect(roundtableRepo.roundtables[0].memberIds).toEqual(members.map(m => m.id));
  });

  it("prefers the user's name for the panel, and falls back to the architect's", async () => {
    const { interactor } = build(async () => design([{ name: "A", description: "", systemPrompt: "a" }]));

    const named = await interactor.execute({ ...request, name: "  The skeptics " });
    expect(named.roundtable.name).toBe("The skeptics");

    const unnamed = await interactor.execute(request);
    expect(unnamed.roundtable.name).toBe("The Panel");
  });

  it("records the brief, so the panel remembers what it was built for", async () => {
    const { interactor } = build(async () => design([{ name: "A", description: "", systemPrompt: "a" }]));
    const { roundtable } = await interactor.execute(request);
    expect(roundtable.brief).toBe("Feynman and a skeptical statistician");
  });

  it("saves nothing at all when the design fails", async () => {
    const { interactor, profileRepo, roundtableRepo } = build(async () => {
      throw new Error("model exploded");
    });

    await expect(interactor.execute(request)).rejects.toThrow("model exploded");
    expect(profileRepo.profiles).toEqual([]);
    expect(roundtableRepo.roundtables).toEqual([]);
  });

  it("refuses an empty brief, a missing key, and a gateway that cannot design panels", async () => {
    const { interactor } = build(async () => design([{ name: "A", description: "", systemPrompt: "a" }]));
    await expect(interactor.execute({ ...request, brief: "   " })).rejects.toThrow(
      "Describe who should be at the table"
    );
    await expect(interactor.execute({ ...request, apiKey: "" })).rejects.toThrow("OpenRouter key");

    const { interactor: unsupported } = build(undefined);
    await expect(unsupported.execute(request)).rejects.toThrow("can't design a roundtable");
  });

  it("caps a runaway panel at the maximum rather than seating twenty voices", async () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      name: `Voice ${i}`,
      description: "",
      systemPrompt: "speak",
    }));
    const { interactor, profileRepo } = build(async () => design(many));

    const { roundtable } = await interactor.execute(request);
    expect(roundtable.memberIds.length).toBe(8);
    expect(profileRepo.profiles.length).toBe(8);
  });
});

describe("resolveRoundtableMembers", () => {
  it("drops members that have been deleted, keeping the panel's own order", () => {
    const roundtable = createRoundtable({ name: "Panel", memberIds: ["c", "a", "b"] });
    const available = [{ id: "a" }, { id: "b" }];
    expect(resolveRoundtableMembers(roundtable, available)).toEqual([{ id: "a" }, { id: "b" }]);
  });

  it("resolves to nobody when every member is gone, rather than to everybody", () => {
    const roundtable = createRoundtable({ name: "Panel", memberIds: ["x"] });
    expect(resolveRoundtableMembers(roundtable, [{ id: "a" }])).toEqual([]);
  });

  it("never seats the same voice twice", () => {
    const roundtable = createRoundtable({ name: "Panel", memberIds: ["a", "a", " a ", "b"] });
    expect(roundtable.memberIds).toEqual(["a", "b"]);
  });
});
