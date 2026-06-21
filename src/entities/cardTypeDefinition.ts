/**
 * # Card Type Definition Entity
 *
 * ## Business Value & Purpose
 * Lerminal's modularity comes from treating the *type* of a card as data, not as a
 * hardcoded enum. A {@link CardTypeDefinition} describes how a family of cards looks
 * (color, icon), what extra structured data it carries (`fields`), and how it should
 * be studied (`learning`). The six original card kinds ship as built-in definitions,
 * and users can author their own — a new type needs no code change.
 *
 * ## Relationship to {@link Card}
 * A card references a definition via its `typeId`. For backward compatibility a card's
 * legacy `type` string doubles as its `typeId` when none is set, so existing data
 * renders unchanged (the built-in ids are exactly the legacy `CardType` strings).
 */

/**
 * How cards of a type are practiced in a review session. The review flow dispatches
 * on this discriminator (see Phase 3 study modes).
 * - `none`: not studied (sources, notes, groups, search results).
 * - `flashcard`: active recall — title is the prompt, `answer` is hidden.
 * - `cloze`: fill-in-the-blank — `body` contains `{{...}}` deletions.
 * - `elaboration`: Feynman-style — the learner writes their own explanation.
 */
export type LearningBehavior = "none" | "flashcard" | "cloze" | "elaboration";

/** The editor/render treatment for a custom field on a card. */
export type FieldKind = "text" | "markdown" | "hidden";

/**
 * How a card's body is rendered.
 * - `markdown` (default): rich text via the markdown renderer.
 * - `html`: the body is treated as a full HTML document and rendered in a sandboxed
 *   WebView, so the AI or the user can embed real interactivity (inputs, sliders,
 *   canvases, small scripts) — a card can be a tiny interactive widget.
 */
export type RenderMode = "markdown" | "html";

/** A user-defined structured field carried by cards of a type. */
export interface FieldSpec {
  /** Stable key under which the value is stored in `Card.fields`. */
  key: string;
  /** Human-friendly label shown in the editor and detail view. */
  label: string;
  /** How the value is edited and rendered. `hidden` veils until revealed. */
  kind: FieldKind;
}

export interface CardTypeDefinition {
  /** Unique id. For built-ins this equals the legacy `CardType` string. */
  id: string;
  /** Display name shown on cards and in the type editor. */
  name: string;
  /** Accent color (hex) for the card spine and type label. */
  color: string;
  /** Short glyph/emoji shown beside the type. */
  icon: string;
  /** True for the seeded defaults; built-ins cannot be deleted, only restyled. */
  builtin: boolean;
  /** How cards of this type are reviewed. */
  learning: LearningBehavior;
  /** How the card body is rendered (defaults to markdown when omitted). */
  render?: RenderMode;
  /** Optional extra structured fields beyond title/body/answer. */
  fields: FieldSpec[];
}

/**
 * The seeded definitions for the original card kinds. Ids match the legacy
 * `CardType` strings so existing cards resolve to these without migration. Colors
 * mirror the prototype's `CARD_COLORS` palette.
 */
export const BUILTIN_CARD_TYPES: CardTypeDefinition[] = [
  { id: "source", name: "Source", color: "#B49CE6", icon: "▤", builtin: true, learning: "none", fields: [] },
  { id: "chunk", name: "Chunk", color: "#7FB2E8", icon: "◇", builtin: true, learning: "none", fields: [] },
  { id: "question", name: "Question", color: "#4EC7C0", icon: "?", builtin: true, learning: "flashcard", fields: [] },
  { id: "note", name: "Note", color: "#E8829B", icon: "✎", builtin: true, learning: "none", fields: [] },
  { id: "group", name: "Group", color: "#9AA7B5", icon: "▦", builtin: true, learning: "none", fields: [] },
  { id: "search", name: "Search", color: "#E0A45E", icon: "⌕", builtin: true, learning: "none", fields: [] },
  { id: "cloze", name: "Cloze", color: "#5BC8A8", icon: "▭", builtin: true, learning: "cloze", fields: [] },
  { id: "interactive", name: "Interactive", color: "#8FD16A", icon: "◧", builtin: true, learning: "none", render: "html", fields: [] },
  {
    id: "elaboration",
    name: "Elaboration",
    color: "#C9A24B",
    icon: "✦",
    builtin: true,
    learning: "elaboration",
    fields: [{ key: "explanation", label: "Your explanation", kind: "text" }],
  },
];

/** A card-type name must be a single lowercase token (letters, digits, hyphens). */
export const CARD_TYPE_NAME_PATTERN = /^[a-z][a-z0-9-]*$/;

/** Normalizes a user-entered type id to its canonical form. */
export function normalizeCardTypeId(id: string): string {
  return id.trim().toLowerCase().replace(/\s+/g, "-");
}

export interface CreateCardTypeParams {
  id?: string;
  name: string;
  color?: string;
  icon?: string;
  learning?: LearningBehavior;
  fields?: FieldSpec[];
}

/**
 * Factory for a valid user-authored {@link CardTypeDefinition}. Always `builtin:false`;
 * callers validate uniqueness against existing ids (built-in and custom).
 */
export function createCardTypeDefinition(params: CreateCardTypeParams): CardTypeDefinition {
  const logTimestamp = new Date().toISOString();
  const definition: CardTypeDefinition = {
    id: normalizeCardTypeId(params.id || params.name),
    name: params.name.trim(),
    color: params.color || "#7FB2E8",
    icon: params.icon || "◆",
    builtin: false,
    learning: params.learning || "none",
    fields: params.fields || [],
  };

  console.log(`[${logTimestamp}] [createCardTypeDefinition] OUTPUT: ${JSON.stringify(definition)}`);
  return definition;
}

/**
 * Resolves the definition governing a card, given its `typeId`/legacy `type` and the
 * full registry. Falls back to a synthetic neutral definition so an unknown type id
 * (e.g. a deleted custom type still referenced by old cards) never crashes rendering.
 */
export function resolveCardType(
  typeKey: string | undefined,
  registry: CardTypeDefinition[]
): CardTypeDefinition {
  const found = typeKey ? registry.find(t => t.id === typeKey) : undefined;
  if (found) return found;
  return { id: typeKey || "unknown", name: typeKey || "Card", color: "#9AA7B5", icon: "◆", builtin: false, learning: "none", fields: [] };
}
