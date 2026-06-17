import { describe, expect, it } from "bun:test";
import { chunkCard, recallCard } from "../commands";
import { createCard } from "../../entities/card";

describe("Command Use Cases", () => {
  it("should split a source card into multiple chunk cards based on sentences", () => {
    const sourceCard = createCard({
      workspaceId: "ws-1",
      type: "source",
      title: "Introduction to React",
      body: "React is a UI library. It is developed by Meta. You can build web apps with it.",
      cite: "reactjs.org",
    });

    const chunks = chunkCard(sourceCard);

    // Should split into 3 chunks
    expect(chunks.length).toBe(3);
    expect(chunks[0].type).toBe("chunk");
    expect(chunks[0].title).toBe("Introduction to React · 1");
    expect(chunks[0].body).toBe("React is a UI library.");
    expect(chunks[0].cite).toBe("reactjs.org");
    expect(chunks[0].sourceRef).toBe(sourceCard.id);

    expect(chunks[1].body).toBe("It is developed by Meta.");
    expect(chunks[2].body).toBe("You can build web apps with it.");
  });

  it("should generate active recall questions from chunks", () => {
    const chunk1 = createCard({
      workspaceId: "ws-1",
      type: "chunk",
      title: "State Management",
      body: "State matters because it changes what you can render on screen.",
      cite: "React docs",
    });

    const question1 = recallCard(chunk1);
    expect(question1.type).toBe("question");
    expect(question1.title).toBe("Why does state management matter?");
    expect(question1.answer).toBe(chunk1.body);
    expect(question1.cite).toBe("React docs");

    const chunk2 = createCard({
      workspaceId: "ws-1",
      type: "chunk",
      title: "Redux Architecture",
      body: "Redux works by dispatching actions to a central store containing state.",
    });

    const question2 = recallCard(chunk2);
    expect(question2.title).toBe("How does redux architecture work?");
  });
});
