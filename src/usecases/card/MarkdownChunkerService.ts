import { marked } from "marked";

export interface MarkdownSection {
  title: string;
  body: string;
  /** Heading depth this section was opened by (1–3); 0 for the leading intro. */
  depth: number;
}

/**
 * A node in the document's heading hierarchy. Sections nest by heading depth so a
 * chapter (H1/H2) owns its subheadings (H3) as `children`, letting callers mirror the
 * source structure as a tree of groups/cards.
 */
export interface MarkdownNode {
  title: string;
  body: string;
  depth: number;
  children: MarkdownNode[];
}

/** Heading depths we treat as structural boundaries (chapters, subheadings). */
const STRUCTURAL_DEPTHS = new Set([1, 2, 3]);

/**
 * # Markdown Chunker Service
 *
 * ## Business Value
 * Uses the `marked` library to parse a Markdown string into an Abstract Syntax Tree
 * (AST). It reliably chunks the document into sections based on its real headings
 * (H1–H3), so cards mirror the source's own structure (chapters → subheadings) and are
 * never split on a `#` inside a code block or URL. This faithfulness is what keeps
 * generated cards anchored to the material instead of being model-invented.
 */
export class MarkdownChunkerService {
  /**
   * Chunks a markdown string into a flat list of logical sections, one per H1–H3
   * heading. Everything before the first heading is grouped into an intro section.
   *
   * @param markdown Raw Markdown string
   * @param fallbackTitle Title used for the introduction if no heading precedes it
   */
  static chunk(markdown: string, fallbackTitle: string): MarkdownSection[] {
    const tokens = marked.lexer(markdown);
    const sections: MarkdownSection[] = [];

    let currentTitle = fallbackTitle;
    let currentBody = "";
    let currentDepth = 0;

    const flushSection = () => {
      const trimmedBody = currentBody.trim();
      if (trimmedBody.length > 0) {
        sections.push({ title: currentTitle, body: trimmedBody, depth: currentDepth });
      }
    };

    for (const token of tokens) {
      if (token.type === "heading" && STRUCTURAL_DEPTHS.has(token.depth)) {
        // A structural heading: flush the current section and start a new one.
        flushSection();
        currentTitle = token.text;
        currentBody = token.raw; // Include the heading itself in the body for context
        currentDepth = token.depth;
      } else {
        currentBody += token.raw;
      }
    }

    flushSection();
    return sections;
  }

  /**
   * Chunks a markdown string into a nested tree following its heading hierarchy.
   * A heading becomes a child of the nearest preceding heading of a shallower depth.
   * Returns the top-level nodes (root forest).
   *
   * @param markdown Raw Markdown string
   * @param fallbackTitle Title for the leading intro node if content precedes the first heading
   */
  static chunkTree(markdown: string, fallbackTitle: string): MarkdownNode[] {
    const sections = this.chunk(markdown, fallbackTitle);
    const roots: MarkdownNode[] = [];
    // Stack of currently open ancestors, shallowest first.
    const stack: MarkdownNode[] = [];

    for (const section of sections) {
      const node: MarkdownNode = { title: section.title, body: section.body, depth: section.depth, children: [] };

      // The leading intro (depth 0) is always a root leaf — it never owns headings.
      if (node.depth === 0) {
        roots.push(node);
        continue;
      }

      // Pop ancestors that are equal or deeper than this section.
      while (stack.length > 0 && stack[stack.length - 1].depth >= node.depth) {
        stack.pop();
      }

      if (stack.length === 0) {
        roots.push(node);
      } else {
        stack[stack.length - 1].children.push(node);
      }
      stack.push(node);
    }

    return roots;
  }
}
