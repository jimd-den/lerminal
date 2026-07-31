import { Card } from "../../entities/card";
import { AppState } from "./GriotController";

export type MaterialFilter = "all" | "notes" | "sources" | "practice" | "due";

export interface LearningSpaceSummary {
  id: string;
  name: string;
  active: boolean;
  materialCount?: number;
  dueCount?: number;
}

export interface GriotDeckModel {
  activeSpace: LearningSpaceSummary | null;
  spaces: LearningSpaceSummary[];
  dueCards: Card[];
  reviewMinutes: number;
  nextDocument: Card | null;
  rootMaterials: Card[];
  recentCards: Card[];
}

export interface DocumentModel {
  group: Card;
  source: Card | null;
  materials: Card[];
  chunkCount: number;
  practiceCount: number;
  materialCount: number;
  learningCards: Card[];
}

export function presentGriotDeck(state: AppState, now: number = Date.now()): GriotDeckModel {
  const dueCards = state.cards.filter(card => card.schedule && card.schedule.dueAt <= now);
  const rootMaterials = state.cards.filter(card => !card.parentId);
  const nextDocument = rootMaterials.find(card => card.type === "group" && card.documentGroupFor)
    ?? rootMaterials.find(card => card.type === "group")
    ?? null;
  const activeWorkspace = state.workspaces.find(space => space.id === state.activeWorkspaceId) ?? null;
  const spaces = state.workspaces.map(space => ({
    id: space.id,
    name: space.name,
    active: space.id === state.activeWorkspaceId,
    materialCount: space.id === state.activeWorkspaceId ? state.cards.length : undefined,
    dueCount: space.id === state.activeWorkspaceId ? dueCards.length : undefined,
  }));

  return {
    activeSpace: activeWorkspace ? spaces.find(space => space.id === activeWorkspace.id) ?? null : null,
    spaces,
    dueCards,
    reviewMinutes: Math.max(2, Math.ceil(dueCards.length * 1.5)),
    nextDocument,
    rootMaterials,
    recentCards: [...state.cards].sort((left, right) => right.createdAt - left.createdAt).slice(0, 4),
  };
}

export function presentDocument(cards: Card[], groupId: string): DocumentModel | null {
  const group = cards.find(card => card.id === groupId && card.type === "group");
  if (!group) return null;
  const materials = cards.filter(card => card.parentId === groupId);
  const source = materials.find(card => card.id === group.documentGroupFor)
    ?? materials.find(card => card.type === "source")
    ?? null;
  const descendants = descendantCards(cards, groupId);

  return {
    group,
    source,
    materials,
    chunkCount: descendants.filter(card => card.type === "chunk").length,
    practiceCount: descendants.filter(card => card.schedule || card.type === "question").length,
    materialCount: descendants.length,
    learningCards: descendants.filter(card => card.type === "chunk" || card.type === "note"),
  };
}

function descendantCards(cards: Card[], parentId: string): Card[] {
  const direct = cards.filter(card => card.parentId === parentId);
  return direct.flatMap(card => card.type === "group" ? [card, ...descendantCards(cards, card.id)] : [card]);
}

export function filterMaterials(cards: Card[], filter: MaterialFilter, now: number = Date.now()): Card[] {
  if (filter === "all") return cards;
  if (filter === "notes") return cards.filter(card => card.type === "note");
  if (filter === "sources") return cards.filter(card => card.type === "source");
  if (filter === "practice") return cards.filter(card => card.type === "question" || !!card.schedule);
  return cards.filter(card => card.schedule && card.schedule.dueAt <= now);
}

export function materialLabel(card: Card): string {
  if (card.type === "group") return card.documentGroupFor ? "DOCUMENT" : "GROUP";
  if (card.schedule || card.type === "question") return "PRACTICE";
  return card.type.toUpperCase();
}
