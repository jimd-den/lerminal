import { describe, expect, it } from "bun:test";
import {
  FontInstallError,
  FontLoader,
  InstallFontInteractor,
  reloadInstalledFonts,
} from "../InstallFontInteractor";
import { PreviewFontInteractor } from "../PreviewFontInteractor";
import {
  FontGateway,
  ResolveFontOptions,
  ResolvedFontFile,
} from "../../ports/gateways/FontGateway";
import {
  parseFontCatalog,
  parseFontSources,
  selectFontSource,
} from "../../../frameworks/network/GoogleFontsGateway";
import { FontChoice } from "../../../entities/appearance";
import {
  FontFamilySummary,
  NATIVE_FONT_FORMATS,
  WEB_FONT_FORMATS,
} from "../../../entities/fontCatalog";

class StubGateway implements FontGateway {
  /** Every options object the interactor passed through, for asserting format policy. */
  requested: ResolveFontOptions[] = [];

  constructor(
    private impl: (family: string) => Promise<ResolvedFontFile>,
    private families: FontFamilySummary[] = []
  ) {}

  resolveFont(family: string, options: ResolveFontOptions) {
    this.requested.push(options);
    return this.impl(family);
  }

  async listFamilies() {
    return this.families;
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
  new StubGateway(async () => ({
    family,
    uri: `https://fonts/${family}.ttf`,
    format: "truetype" as const,
  }));

describe("InstallFontInteractor", () => {
  it("returns a google FontChoice once the font has actually loaded", async () => {
    const loader = new RecordingLoader();
    const interactor = new InstallFontInteractor(ok("JetBrains Mono"), loader);

    const font = await interactor.execute("JetBrains Mono");

    expect(font).toEqual({
      family: "JetBrains Mono",
      source: "google",
      uri: "https://fonts/JetBrains Mono.ttf",
      format: "truetype",
    });
    expect(loader.loaded).toEqual(["JetBrains Mono"]);
  });

  it("asks the gateway only for formats this platform can render", async () => {
    const gateway = ok("Inter");
    await new InstallFontInteractor(gateway, new RecordingLoader()).execute("Inter");

    // The default is native: a WOFF2 install would load fine and render as nothing.
    expect(gateway.requested[0].acceptedFormats).toEqual(NATIVE_FONT_FORMATS);
    expect(gateway.requested[0].acceptedFormats).not.toContain("woff2");
  });

  it("passes through the host's own format list when one is supplied", async () => {
    const gateway = ok("Inter");
    await new InstallFontInteractor(
      gateway,
      new RecordingLoader(),
      WEB_FONT_FORMATS
    ).execute("Inter");

    expect(gateway.requested[0].acceptedFormats).toEqual(WEB_FONT_FORMATS);
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

describe("PreviewFontInteractor", () => {
  it("loads a face for display and reports it as previewable", async () => {
    const loader = new RecordingLoader();
    const preview = new PreviewFontInteractor(
      new InstallFontInteractor(ok("Inter"), loader)
    );

    const font = await preview.execute("Inter");

    expect(font?.family).toBe("Inter");
    expect(loader.loaded).toEqual(["Inter"]);
  });

  it("downloads a family once no matter how often a row re-renders", async () => {
    const loader = new RecordingLoader();
    const preview = new PreviewFontInteractor(
      new InstallFontInteractor(ok("Inter"), loader)
    );

    await Promise.all([
      preview.execute("Inter"),
      preview.execute("Inter"),
      preview.execute("inter"),
    ]);

    expect(loader.loaded).toEqual(["Inter"]);
  });

  it("returns null instead of throwing, so a broken preview can't break browsing", async () => {
    const preview = new PreviewFontInteractor(
      new InstallFontInteractor(ok("Broken"), new RecordingLoader(["Broken"]))
    );

    expect(await preview.execute("Broken")).toBeNull();
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

  it("still loads a font stored before the format field existed", async () => {
    const loader = new RecordingLoader();
    const legacy: FontChoice = {
      family: "Old",
      source: "google",
      uri: "https://fonts/Old.ttf",
    };

    expect((await reloadInstalledFonts([legacy], loader)).map(f => f.family)).toEqual([
      "Old",
    ]);
  });
});

describe("selectFontSource", () => {
  it("picks the TTF out of a Google Fonts stylesheet", () => {
    const css = `@font-face{font-family:'X';src:url(https://fonts.gstatic.com/s/x/v1/abc.ttf) format('truetype');}`;

    expect(selectFontSource(css, NATIVE_FONT_FORMATS)).toEqual({
      uri: "https://fonts.gstatic.com/s/x/v1/abc.ttf",
      format: "truetype",
    });
  });

  it("accepts OpenType, which React Native can load just as well as TrueType", () => {
    const css = `@font-face{font-family:'X';src:url(https://fonts.gstatic.com/s/x/v1/abc.otf) format('opentype');}`;

    expect(selectFontSource(css, NATIVE_FONT_FORMATS)?.format).toBe("opentype");
  });

  it("refuses a woff2-only stylesheet on native — it would download and then fail to render", () => {
    const css = `@font-face{font-family:'X';src:url(https://fonts.gstatic.com/s/x/v1/abc.woff2) format('woff2');}`;

    expect(selectFontSource(css, NATIVE_FONT_FORMATS)).toBeNull();
  });

  it("refuses EOT, which is what the old MSIE user agent was silently being served", () => {
    const css = `@font-face{font-family:'Inter';src:url(https://fonts.gstatic.com/l/font?kit=abc&skey=def&v=v20);}`;

    // Extensionless and undeclared: correctly unusable rather than mistaken for a TTF.
    expect(selectFontSource(css, NATIVE_FONT_FORMATS)).toBeNull();
  });

  it("identifies a format declared on an extensionless URL", () => {
    const css = `@font-face{src:url(https://fonts.gstatic.com/l/font?kit=abc) format('truetype');}`;

    expect(selectFontSource(css, NATIVE_FONT_FORMATS)?.format).toBe("truetype");
  });

  it("honours the caller's order of preference", () => {
    const css = `
      @font-face{src:url(https://f/a.ttf) format('truetype');}
      @font-face{src:url(https://f/a.woff2) format('woff2');}`;

    expect(selectFontSource(css, WEB_FONT_FORMATS)?.format).toBe("woff2");
    expect(selectFontSource(css, NATIVE_FONT_FORMATS)?.format).toBe("truetype");
  });

  it("returns null for an empty stylesheet", () => {
    expect(selectFontSource("", NATIVE_FONT_FORMATS)).toBeNull();
  });

  it("reads every subset block Google emits", () => {
    const css = `
      /* cyrillic */
      @font-face{src:url(https://f/cyr.ttf) format('truetype');}
      /* latin */
      @font-face{src:url(https://f/lat.ttf) format('truetype');}`;

    expect(parseFontSources(css)).toHaveLength(2);
  });
});

describe("parseFontCatalog", () => {
  const payload = (body: unknown) => `)]}'\n${JSON.stringify(body)}`;

  it("reads families past Google's anti-hijacking guard", () => {
    const catalog = parseFontCatalog(
      payload({
        familyMetadataList: [
          {
            family: "Inter",
            category: "Sans Serif",
            popularity: 3,
            designers: ["Rasmus Andersson"],
            axes: [{ tag: "wght" }],
          },
        ],
      })
    );

    expect(catalog).toEqual([
      {
        family: "Inter",
        category: "Sans Serif",
        popularity: 3,
        designers: ["Rasmus Andersson"],
        axes: ["wght"],
      },
    ]);
  });

  it("keeps the usable entries when one is malformed, rather than losing the catalog", () => {
    const catalog = parseFontCatalog(
      payload({
        familyMetadataList: [
          { family: "  " },
          { family: "Lato", category: "Nonsense", designers: null, axes: "no" },
        ],
      })
    );

    expect(catalog).toHaveLength(1);
    expect(catalog[0].family).toBe("Lato");
    // Defaults chosen so a bad field degrades the row, not the browser.
    expect(catalog[0].category).toBe("Sans Serif");
    expect(catalog[0].designers).toEqual([]);
    expect(catalog[0].axes).toEqual([]);
  });

  it("fails clearly when the payload isn't a catalog at all", () => {
    expect(() => parseFontCatalog("not json")).toThrow("unreadable catalog");
    expect(() => parseFontCatalog(payload({ nope: true }))).toThrow("unreadable catalog");
  });
});
