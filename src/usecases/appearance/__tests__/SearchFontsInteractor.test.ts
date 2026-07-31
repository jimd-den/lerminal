import { describe, expect, it } from "bun:test";
import { FontCatalogError, SearchFontsInteractor } from "../SearchFontsInteractor";
import { FontGateway, ResolveFontOptions } from "../../ports/gateways/FontGateway";
import { FontFamilySummary } from "../../../entities/fontCatalog";

const CATALOG: FontFamilySummary[] = [
  { family: "Roboto", category: "Sans Serif", popularity: 1, designers: [], axes: [] },
  { family: "Roboto Mono", category: "Monospace", popularity: 40, designers: [], axes: [] },
  { family: "EB Garamond", category: "Serif", popularity: 200, designers: [], axes: [] },
];

class CountingGateway implements FontGateway {
  calls = 0;
  constructor(private failure?: Error) {}

  async listFamilies(): Promise<FontFamilySummary[]> {
    this.calls += 1;
    if (this.failure) throw this.failure;
    return CATALOG;
  }

  async resolveFont(family: string, _options: ResolveFontOptions) {
    return { family, uri: `https://fonts/${family}.ttf`, format: "truetype" as const };
  }
}

describe("SearchFontsInteractor", () => {
  it("ranks the catalog against the query", async () => {
    const interactor = new SearchFontsInteractor(new CountingGateway());

    const results = await interactor.execute({ text: "garamnd" });

    expect(results.map(r => r.summary.family)).toEqual(["EB Garamond"]);
  });

  it("fetches the catalog once and searches locally after that", async () => {
    const gateway = new CountingGateway();
    const interactor = new SearchFontsInteractor(gateway);

    await interactor.execute({ text: "rob" });
    await interactor.execute({ text: "mono" });
    await interactor.execute({ text: "gara" });

    // Every keystroke hitting the network would be slow, costly, and useless offline.
    expect(gateway.calls).toBe(1);
  });

  it("filters by category", async () => {
    const interactor = new SearchFontsInteractor(new CountingGateway());

    const results = await interactor.execute({ text: "", category: "Monospace" });

    expect(results.map(r => r.summary.family)).toEqual(["Roboto Mono"]);
  });

  it("reports an unreachable catalog rather than returning an empty result", async () => {
    const interactor = new SearchFontsInteractor(
      new CountingGateway(new Error("Couldn't reach Google Fonts: offline"))
    );

    const error = await interactor.execute({ text: "rob" }).catch(e => e);

    // An empty list would read as "no font matched", which is a different and false claim.
    expect(error).toBeInstanceOf(FontCatalogError);
    expect(error.userMessage).toContain("offline");
    expect(interactor.isReady()).toBe(false);
  });

  it("retries the fetch after a failure instead of caching the error forever", async () => {
    const gateway = new CountingGateway(new Error("offline"));
    const interactor = new SearchFontsInteractor(gateway);

    await interactor.execute({ text: "a" }).catch(() => null);
    await interactor.execute({ text: "a" }).catch(() => null);

    expect(gateway.calls).toBe(2);
  });
});
