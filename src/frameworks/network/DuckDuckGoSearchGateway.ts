import { SearchGateway, SearchResult } from "../../adapters/gateways/SearchGateway";

export class DuckDuckGoSearchGateway implements SearchGateway {
  async search(query: string): Promise<SearchResult[]> {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        }
      });
      
      if (!response.ok) {
        throw new Error(`DuckDuckGo returned status ${response.status}`);
      }
      
      const html = await response.text();
      return this.parseHtml(html);
    } catch (err: any) {
      console.error(`[DuckDuckGoSearchGateway] Error fetching search results: ${err.message}`);
      return [];
    }
  }

  private parseHtml(html: string): SearchResult[] {
    const results: SearchResult[] = [];
    
    // Split the HTML into result blocks. DuckDuckGo wraps each result in <div class="result ...">
    const resultBlocks = html.split('class="result ');
    
    // Skip the first element which is everything before the first result
    for (let i = 1; i < resultBlocks.length; i++) {
      const block = resultBlocks[i];
      
      // Stop parsing if we hit a certain limit (e.g., top 10 results)
      if (results.length >= 10) break;

      // Extract URL
      const urlMatch = block.match(/href="([^"]+)"/);
      // Extract Title
      const titleMatch = block.match(/<h2 class="result__title">[\s\S]*?<a[^>]*>(.*?)<\/a>[\s\S]*?<\/h2>/i);
      // Extract Snippet
      const snippetMatch = block.match(/<a class="result__snippet[^>]*>(.*?)<\/a>/i);

      if (urlMatch && titleMatch && snippetMatch) {
        let rawUrl = urlMatch[1];
        // DuckDuckGo often redirects URLs like "//duckduckgo.com/l/?uddg=https://..."
        if (rawUrl.includes("uddg=")) {
          const params = new URLSearchParams(rawUrl.split("?")[1] || "");
          const targetUrl = params.get("uddg");
          if (targetUrl) {
            rawUrl = decodeURIComponent(targetUrl);
          }
        } else if (rawUrl.startsWith("//")) {
          rawUrl = "https:" + rawUrl;
        } else if (rawUrl.startsWith("/")) {
          rawUrl = "https://duckduckgo.com" + rawUrl;
        }
        
        // Skip duckduckgo internal links if any slip through
        if (rawUrl.includes("duckduckgo.com/lite") || rawUrl.includes("duckduckgo.com/html")) {
          continue;
        }

        results.push({
          url: rawUrl,
          title: this.stripHtmlTags(titleMatch[1]),
          snippet: this.stripHtmlTags(snippetMatch[1]),
        });
      }
    }
    
    return results;
  }

  private stripHtmlTags(str: string): string {
    return str
      .replace(/<[^>]*>?/gm, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&quot;/g, "\"")
      .replace(/&apos;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .trim();
  }
}
