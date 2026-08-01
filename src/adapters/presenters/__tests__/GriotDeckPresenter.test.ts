import { describe, expect, it } from "bun:test";
import { presentDocument, presentGriotDeck } from "../GriotDeckPresenter";
import { createCard } from "../../../entities/card";
import { createWorkspace } from "../../../entities/workspace";
import { createInitialSchedule } from "../../../entities/schedule";

describe("GriotDeckPresenter", () => {
  it("presents one next document and due review count", () => {
    const space = createWorkspace({ id: "space-1", name: "WebGPU" });
    const source = createCard({ id: "source-1", workspaceId: space.id, type: "source", title: "GPU Gems", body: "Source", createdAt: 1 });
    const group = createCard({ id: "group-1", workspaceId: space.id, type: "group", title: "Occlusion", body: "", documentGroupFor: source.id, createdAt: 2 });
    const due = createCard({
      id: "due-1",
      workspaceId: space.id,
      type: "question",
      title: "What is a depth prepass?",
      body: "",
      parentId: group.id,
      schedule: { ...createInitialSchedule(0), dueAt: 50 },
      createdAt: 3,
    });
    const state = {
      workspaces: [space],
      activeWorkspaceId: space.id,
      cards: [source, group, due],
    } as any;

    const result = presentGriotDeck(state, 100);

    expect(result.activeSpace?.name).toBe("WebGPU");
    expect(result.dueCards).toHaveLength(1);
    expect(result.nextDocument?.id).toBe(group.id);
  });

  it("maps a document group to source, chunks, and practice", () => {
    const source = createCard({ id: "source", workspaceId: "space", type: "source", title: "Source", body: "Text", parentId: "group" });
    const group = createCard({ id: "group", workspaceId: "space", type: "group", title: "Document", body: "", documentGroupFor: source.id });
    const chunk = createCard({ id: "chunk", workspaceId: "space", type: "chunk", title: "Chunk", body: "Text", parentId: group.id });
    const question = createCard({ id: "question", workspaceId: "space", type: "question", title: "Question", body: "", parentId: group.id });
    const section = createCard({ id: "section", workspaceId: "space", type: "group", title: "Section", body: "", parentId: group.id });
    const nestedChunk = createCard({ id: "nested", workspaceId: "space", type: "chunk", title: "Nested", body: "Text", parentId: section.id });

    const result = presentDocument([group, source, chunk, question, section, nestedChunk], group.id);

    expect(result?.source?.id).toBe(source.id);
    expect(result?.chunkCount).toBe(2);
    expect(result?.practiceCount).toBe(1);
    expect(result?.materialCount).toBe(5);
    expect(result?.learningCards.map(card => card.id)).toEqual([chunk.id, nestedChunk.id]);
  });
});
