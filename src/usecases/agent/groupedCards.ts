import { Card, createCard } from "../../entities/card";
import { createProvenance } from "../../entities/provenance";
import { ApaReference } from "../../entities/apaReference";

/**
 * # Grouped Cards — turning a flat model reply into a nested structure
 *
 * ## Business Value & Purpose
 * More than one capability asks a model for "a body of material on X" and needs the answer
 * back as a *shape*: one container, named sections inside it, cards inside those. Asking
 * the model for nested JSON to express that would be handing it the one job it is worst
 * at, so it does what it is good at instead — it writes a flat list of titles, each
 * prefixed with the section it belongs to:
 *
 * ```
 * Foundations :: Vector spaces
 * Foundations :: Coordinate systems
 * Further reading :: Real-Time Rendering, 4th ed.
 * ```
 *
 * This module turns that flat list into the tree. The model supplies language; the app
 * supplies structure — the same division of labour the tag grammar rests on.
 *
 * Sections are created in the order they first appear, so the reading order the model
 * chose survives. An item with no section prefix is not an error: it simply hangs directly
 * off the container, which is what a short, unsectioned answer should look like.
 */

/** One title/body pair as the model returned it, before any structure is imposed. */
export interface GroupedCardInput {
  title: string;
  body: string;
  /**
   * The card's own sources. Carried per item rather than per tree because each leaf makes
   * its own claims — a syllabus phase's container cites nothing itself.
   */
  references?: ApaReference[];
}

export interface GroupedCardsResult {
  /** The container. Everything else is nested inside it. */
  group: Card;
  /** Section subgroups, in first-appearance order. Empty when nothing was sectioned. */
  sections: Card[];
  /** The leaf cards, in the order the model returned them. */
  items: Card[];
}

/**
 * Splits a model-written "Section :: Title" into its two parts.
 *
 * A missing or one-sided separator yields no section rather than an empty one — a card
 * titled "Foo ::" is a mangled line, and hanging it off the container unsectioned loses
 * less than inventing a nameless section for it.
 */
export function splitSectionTitle(rawTitle: string): {
  section: string | null;
  title: string;
} {
  const separatorIndex = rawTitle.indexOf("::");
  if (separatorIndex === -1) return { section: null, title: rawTitle };
  const section = rawTitle.slice(0, separatorIndex).trim();
  const title = rawTitle.slice(separatorIndex + 2).trim();
  if (!section || !title) return { section: null, title: rawTitle };
  return { section, title };
}

export interface BuildGroupedCardsParams {
  workspaceId: string;
  /** Title for the container card. */
  groupTitle: string;
  /** Where the container itself lives. Undefined/null means the workspace root. */
  parentId?: string | null;
  items: GroupedCardInput[];
  /** Recorded on every card created here, so the whole tree traces to one run. */
  model: string;
}

/**
 * Builds the container → sections → cards tree. Pure: creates entities, saves nothing.
 *
 * Every card carries agent provenance, including the container and the sections, because
 * a group the user did not make is still something the model produced and must say so.
 */
export function buildGroupedCards(params: BuildGroupedCardsParams): GroupedCardsResult {
  const provenance = () => createProvenance({ mode: "agent", model: params.model });

  const group = createCard({
    workspaceId: params.workspaceId,
    type: "group",
    title: params.groupTitle,
    body: "",
    parentId: params.parentId ?? undefined,
    provenance: provenance(),
  });

  const sectionsByName = new Map<string, Card>();
  const sections: Card[] = [];
  const items: Card[] = [];

  for (const input of params.items) {
    const { section, title } = splitSectionTitle(input.title.trim());
    let parent = group.id;

    if (section) {
      let sectionCard = sectionsByName.get(section);
      if (!sectionCard) {
        sectionCard = createCard({
          workspaceId: params.workspaceId,
          type: "group",
          title: section,
          body: "",
          parentId: group.id,
          provenance: provenance(),
        });
        sectionsByName.set(section, sectionCard);
        sections.push(sectionCard);
      }
      parent = sectionCard.id;
    }

    items.push(
      createCard({
        workspaceId: params.workspaceId,
        type: "note",
        role: "concept",
        title,
        body: input.body.trim(),
        parentId: parent,
        provenance: provenance(),
        references: input.references,
      })
    );
  }

  return { group, sections, items };
}
