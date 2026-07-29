import { describe, expect, it } from "bun:test";
import {
  FontInstallError,
  FontLoader,
  InstallFontInteractor,
  reloadInstalledFonts,
} from "../InstallFontInteractor";
import { FontGateway, ResolvedFontFile } from "../../../adapters/gateways/FontGateway";
import { firstTruetypeUrl } from "../../../frameworks/network/GoogleFontsGateway";
import { FontChoice } from "../../../entities/appearance";

class StubGateway implements FontGateway {
  constructor(private impl: (family: string) => Promise<ResolvedFontFile>) {}
  resolveFont(family: string) {
    return this.impl(family);
  }
}

class RecordingLoader implements FontLoader {
  loaded: string[] = [];
  constructor(private failOn: string[] = []) {}
  async load(family: string) {
    if (this.failOn.includes(family)) throw new Error("could not load");
    this.loaded.push(family);
  }
}

const ok = (family: string) =>
  new StubGateway(async () => ({ family, uri: `https://fonts/${family}.ttf` }));

describe("InstallFontInteractor", () => {
  it("returns a google FontChoice once the font has actually loaded", async () => {
    const loader = new RecordingLoader();
    const interactor = new InstallFontInteractor(ok("JetBrains Mono"), loader);

    const font = await interactor.execute("JetBrains Mono");

    expect(font).toEqual({
      family: "JetBrains Mono",
      source: "google",
      uri: "https://fonts/JetBrains Mono.ttf",
    });
    expect(loader.loaded).toEqual(["JetBrains Mono"]);
  });

  it("surfaces the provider's own reason when the family can't be resolved", async () => {
    const gateway = new StubGateway(async () => {
      throw new Error('Google Fonts has no family called "Nope"');
    });
    const interactor = new InstallFontInteractor(gateway, new RecordingLoader());

    const error = await interactor.execute("Nope").catch(e => e);

    expect(error).toBeInstanceOf(FontInstallError);
    expect(error.userMessage).toContain("no family called");
  });

  it("fails loudly when a font downloads but won't load, rather than reporting success", async () => {
    const loader = new RecordingLoader(["Broken"]);
    const interactor = new InstallFontInteractor(ok("Broken"), loader);

    const error = await interactor.execute("Broken").catch(e => e);

    expect(error).toBeInstanceOf(FontInstallError);
    expect(error.userMessage).toContain("couldn't load it");
    expect(loader.loaded).toEqual([]);
  });
});

describe("reloadInstalledFonts", () => {
  const google = (family: string): FontChoice => ({
    family,
    source: "google",
    uri: `https://fonts/${family}.ttf`,
  });

  it("re-registers every font that still loads", async () => {
    const loader = new RecordingLoader();

    const loaded = await reloadInstalledFonts([google("A"), google("B")], loader);

    expect(loaded.map(f => f.family)).toEqual(["A", "B"]);
  });

  it("drops a font that no longer loads instead of blocking startup", async () => {
    const loader = new RecordingLoader(["Gone"]);

    const loaded = await reloadInstalledFonts([google("A"), google("Gone")], loader);

    expect(loaded.map(f => f.family)).toEqual(["A"]);
  });

  it("skips system fonts, which need no loading", async () => {
    const loader = new RecordingLoader();

    const loaded = await reloadInstalledFonts(
      [{ family: "__system_mono__", source: "system" }],
      loader
    );

    expect(loaded).toEqual([]);
    expect(loader.loaded).toEqual([]);
  });
});

describe("firstTruetypeUrl", () => {
  it("picks the TTF out of a Google Fonts stylesheet", () => {
    const css = `@font-face{font-family:'X';src:url(https://fonts.gstatic.com/s/x/v1/abc.ttf) format('truetype');}`;

    expect(firstTruetypeUrl(css)).toBe("https://fonts.gstatic.com/s/x/v1/abc.ttf");
  });

  it("refuses a woff2-only stylesheet — it would download and then fail to render", () => {
    const css = `@font-face{font-family:'X';src:url(https://fonts.gstatic.com/s/x/v1/abc.woff2) format('woff2');}`;

    expect(firstTruetypeUrl(css)).toBeNull();
  });

  it("returns null for an empty stylesheet", () => {
    expect(firstTruetypeUrl("")).toBeNull();
  });
});
