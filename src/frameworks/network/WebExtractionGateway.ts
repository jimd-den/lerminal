import { ExtractionGateway } from "../../adapters/gateways/ExtractionGateway";

export class WebExtractionGateway implements ExtractionGateway {
  async extractText(url: string): Promise<string> {
    try {
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
      console.error(`[WebExtractionGateway] Error extracting from ${url}: ${err.message}`);
      throw err;
    }
  }

  private parseAndExtract(html: string): string {
    // Basic heuristic text extraction since we don't have a full DOM parser in React Native.
    
    // 1. Remove script and style tags completely
    let cleanHtml = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
    cleanHtml = cleanHtml.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "");
    
    // 2. Remove header, nav, footer, aside, forms, svg
    cleanHtml = cleanHtml.replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, "");
    cleanHtml = cleanHtml.replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, "");
    cleanHtml = cleanHtml.replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, "");
    cleanHtml = cleanHtml.replace(/<aside\b[^<]*(?:(?!<\/aside>)<[^<]*)*<\/aside>/gi, "");
    cleanHtml = cleanHtml.replace(/<form\b[^<]*(?:(?!<\/form>)<[^<]*)*<\/form>/gi, "");
    cleanHtml = cleanHtml.replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, "");
    
    // 3. Optional: Extract only the main body or article if it exists
    const articleMatch = cleanHtml.match(/<article[^>]*>([\s\S]*?)<\/article>/i) || cleanHtml.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
    let contentToParse = articleMatch ? articleMatch[1] : cleanHtml;
    
    // 4. Strip all remaining HTML tags, converting block elements to newlines
    contentToParse = contentToParse.replace(/<\/(p|div|h[1-6]|li|br|tr)[^>]*>/gi, "\n\n");
    contentToParse = contentToParse.replace(/<br\s*\/?>/gi, "\n");
    contentToParse = contentToParse.replace(/<[^>]+>/g, " ");

    // 5. Decode HTML entities
    contentToParse = this.decodeHtmlEntities(contentToParse);
    
    // 6. Condense multiple whitespaces and newlines
    contentToParse = contentToParse
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .join('\n\n');

    // Limit to 5000 characters to avoid enormous cards
    return contentToParse.substring(0, 5000);
  }

  private decodeHtmlEntities(str: string): string {
    return str
      .replace(/&nbsp;/g, " ")
      .replace(/&quot;/g, "\"")
      .replace(/&apos;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec))
      .replace(/&#x([0-9a-f]+);/gi, (match, hex) => String.fromCharCode(parseInt(hex, 16)));
  }
}
