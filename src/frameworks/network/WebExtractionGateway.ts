import { ExtractionGateway } from "../../adapters/gateways/ExtractionGateway";
import { NodeHtmlMarkdown } from "node-html-markdown";
import * as punycode from "punycode";

export class WebExtractionGateway implements ExtractionGateway {
  private nhm: NodeHtmlMarkdown;

  constructor() {
    this.nhm = new NodeHtmlMarkdown(
      {
        ignore: ["script", "style", "nav", "footer", "header", "aside", "form", "img", "svg"]
      }
    );
  }

  private encodeUrl(rawUrl: string): string {
    try {
      const parsed = new URL(rawUrl);
      parsed.hostname = punycode.toASCII(parsed.hostname);
      return parsed.toString();
    } catch {
      return rawUrl; // Fallback if URL is invalid
    }
  }

  async extractText(rawUrl: string): Promise<string> {
    try {
      const url = this.encodeUrl(rawUrl);

      // Special case for Wikipedia: use their API for HTML extraction to keep links and headlines
      if (url.includes("wikipedia.org/wiki/")) {
        const titleMatch = url.match(/wikipedia\.org\/wiki\/([^#\?]+)/);
        if (titleMatch) {
          const title = titleMatch[1];
          const lang = url.match(/\/\/([a-z\-]+)\.wikipedia\.org/)?.[1] || "en";
          // prop=extracts without explaintext gives basic HTML
          const apiUrl = `https://${lang}.wikipedia.org/w/api.php?action=query&prop=extracts&titles=${title}&format=json`;
          
          try {
            const apiRes = await fetch(apiUrl);
            if (apiRes.ok) {
              const data = await apiRes.json();
              const pages = data.query?.pages;
              if (pages) {
                const pageId = Object.keys(pages)[0];
                if (pageId && pageId !== "-1") {
                  const htmlExtract = pages[pageId].extract;
                  if (htmlExtract) {
                     return this.parseAndExtract(htmlExtract);
                  }
                }
              }
            }
          } catch (e) {
            console.warn(`[WebExtractionGateway] Wikipedia API failed, falling back to HTML parsing: ${e}`);
          }
        }
      }

      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch URL. Status: ${response.status}`);
      }

      const contentType = response.headers.get("content-type") || "";
      if (contentType && !contentType.includes("text/html") && !contentType.includes("text/plain")) {
        throw new Error("Unsupported content type for extraction: " + contentType);
      }

      const html = await response.text();
      return this.parseAndExtract(html);
    } catch (err: any) {
      console.error(`[WebExtractionGateway] Error extracting from ${rawUrl}: ${err.message}`);
      throw err;
    }
  }

  private async parseAndExtract(html: string): Promise<string> {
    // 1. Optional: Extract only the main body or article if it exists and we're parsing full HTML
    // We try to isolate the core content to avoid noise if it's a full page
    let contentToParse = html;
    if (html.includes("<html")) {
      const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i) || html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
      if (articleMatch) {
        contentToParse = articleMatch[1];
      }
    }

    // Truncate to a reasonable size before parsing to prevent freezing the JS thread for too long.
    // 100k chars of HTML is plenty to extract our maximum of 10k chars of Markdown.
    if (contentToParse.length > 100000) {
      contentToParse = contentToParse.substring(0, 100000);
    }

    // Yield to the React Native UI thread so the loading spinner can render and animations don't stutter 
    // before we block the JS thread with CPU-intensive HTML parsing.
    return new Promise((resolve) => {
      setTimeout(() => {
        try {
          // 2. Use NodeHtmlMarkdown to convert HTML to Markdown (preserves headings, links, bold, etc.)
          let markdown = this.nhm.translate(contentToParse);
          
          // Limit to 10000 characters to avoid enormous cards
          resolve(markdown.substring(0, 10000));
        } catch (e) {
          resolve("Failed to parse content.");
        }
      }, 50);
    });
  }
}
