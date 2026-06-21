import { marked } from "marked";

export interface MarkdownSection {
  title: string;
  body: string;
}

/**
 * # Markdown Chunker Service
 * 
 * ## Business Value
 * Uses the `marked` library to parse a Markdown string into an Abstract Syntax Tree (AST).
 * It reliably chunks the document into sections based on headings (H1 and H2), ensuring
 * we never falsely split on a `#` symbol inside a code block or URL.
 */
export class MarkdownChunkerService {
  /**
   * Chunks a markdown string into logical sections.
   * Everything before the first H1/H2 is grouped into an "Introduction" section.
   * Each subsequent H1/H2 creates a new section.
   * 
   * @param markdown Raw Markdown string
   * @param fallbackTitle Title used for the introduction if no heading precedes it
   */
  static chunk(markdown: string, fallbackTitle: string): MarkdownSection[] {
    const tokens = marked.lexer(markdown);
    const sections: MarkdownSection[] = [];
    
    let currentTitle = fallbackTitle;
    let currentBody = "";

    const flushSection = () => {
      const trimmedBody = currentBody.trim();
      if (trimmedBody.length > 0) {
        sections.push({ title: currentTitle, body: trimmedBody });
      }
    };

    for (const token of tokens) {
      if (token.type === "heading" && (token.depth === 1 || token.depth === 2)) {
        // We hit a major heading. Flush the current section and start a new one.
        flushSection();
        currentTitle = token.text;
        currentBody = token.raw; // Include the heading itself in the body for context
      } else {
        currentBody += token.raw;
      }
    }

    // Flush the final section
    flushSection();

    return sections;
  }
}
