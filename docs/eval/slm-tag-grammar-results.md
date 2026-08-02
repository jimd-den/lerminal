# Workspace Agent SLM tag-grammar eval

Run at 2026-08-01T21:54:12.055Z. Real OpenRouter calls against the app's actual
system prompt (`composeSystemPrompt("workspace-agent")`) and the real
`parseAgentTags` parser — see `scripts/evalWorkspaceAgentTags.ts`.

| Model | Case | Tags | Flags |
|---|---|---|---|
| google/gemma-4-26b-a4b-it:free | mastery-syllabus-breakdown | 1 | 1 tag(s) referenced something that didn't resolve to a real card. |
| google/gemma-4-26b-a4b-it:free | single-fact-worth-keeping | 1 | — |
| google/gemma-4-26b-a4b-it:free | plain-question-no-artifact | 0 | — |
| google/gemma-4-26b-a4b-it:free | group-existing-notes | 1 | — |
| google/gemma-4-26b-a4b-it:free | multi-question-generation | 2 | — |
| nvidia/nemotron-3-nano-30b-a3b:free | mastery-syllabus-breakdown | 1 | — |
| nvidia/nemotron-3-nano-30b-a3b:free | single-fact-worth-keeping | 0 | REQUEST FAILED: No text content in response: {"error":{"message":"Upstream error from Nvidia: ResourceExhausted: Worker local total request limit reached (32/32)","code":502}} |
| nvidia/nemotron-3-nano-30b-a3b:free | plain-question-no-artifact | 1 | Expected zero tags but got 1 — model over-tagged a plain question. |
| nvidia/nemotron-3-nano-30b-a3b:free | group-existing-notes | 1 | — |
| nvidia/nemotron-3-nano-30b-a3b:free | multi-question-generation | 1 | — |
| nvidia/nemotron-nano-9b-v2:free | mastery-syllabus-breakdown | 2 | — |
| nvidia/nemotron-nano-9b-v2:free | single-fact-worth-keeping | 1 | — |
| nvidia/nemotron-nano-9b-v2:free | plain-question-no-artifact | 0 | — |
| nvidia/nemotron-nano-9b-v2:free | group-existing-notes | 1 | 1 tag(s) referenced something that didn't resolve to a real card. |
| nvidia/nemotron-nano-9b-v2:free | multi-question-generation | 1 | — |

## Raw responses

### google/gemma-4-26b-a4b-it:free — mastery-syllabus-breakdown

```
To master WebGPU, you should start with the core concepts of the graphics pipeline and then move toward memory management and compute shaders. Since you already have card 3, [[group: WebGPU Learning Path]], we can build a syllabus around that.

I suggest following this progression:

1. **The Basics**: Understanding the GPU device, command encoders, and queues.
2. **The Pipeline**: Setting up render pipelines, vertex buffers, and fragment shaders.
3. **Data Flow**: Mastering bind groups and uniform buffers to move data from CPU to GPU.
4. **Advanced Rendering**: Implementing depth testing, stencil buffers, and texture sampling.
5. **Compute Shaders**: Moving beyond graphics to general-purpose GPU computation for physics or particle systems.
```

### google/gemma-4-26b-a4b-it:free — single-fact-worth-keeping

```
Spacing improves memory because increasing the interval between reviews forces a more effortful retrieval, which strengthens the neural pathways. [[note: Desirable difficulty]]
```

### google/gemma-4-26b-a4b-it:free — plain-question-no-artifact

```
Recognition occurs when you identify information that is presented to you, like a multiple-choice test. Recall requires you to retrieve the information from memory without it being visible, such as an essay question or trying to remember a name in conversation.
```

### google/gemma-4-26b-a4b-it:free — group-existing-notes

```
I can certainly propose a group for those. I would suggest creating a new [[group: WebGPU]] to house card 3 and any future notes on the topic.
```

### google/gemma-4-26b-a4b-it:free — multi-question-generation

```
To test yourself on the forgetting curve, you could ask how the rate of memory loss changes over time or what specific interventions can slow down that decline. [[question: How does the forgetting curve change over time?]] You might also ask about the relationship between the strength of a memory trace and its durability. [[question: How does memory strength affect decay?]]
```

### nvidia/nemotron-3-nano-30b-a3b:free — mastery-syllabus-breakdown

```
You can begin with the basics of WebGPU (card 3), then study the graphics pipeline concepts, followed by shader programming and texture handling. After each step, add practice exercises and refer back to the spaced‑repetition fundamentals (card 1) and the forgetting curve (card 2) to reinforce the material. As you progress, you can keep expanding the syllabus with new topics or projects. [[note: WebGPU mastery syllabus]]
```

### nvidia/nemotron-3-nano-30b-a3b:free — single-fact-worth-keeping

```
(request failed)
```

### nvidia/nemotron-3-nano-30b-a3b:free — plain-question-no-artifact

```
Recall is actively retrieving information from memory, while recognition is just noticing that something feels familiar. [[note: Recall vs Recognition]]
```

### nvidia/nemotron-3-nano-30b-a3b:free — group-existing-notes

```
Sure, you could create a group named “WebGPU pipeline” to contain those notes. [[group: WebGPU pipeline]]
```

### nvidia/nemotron-3-nano-30b-a3b:free — multi-question-generation

```
Here are three quiz questions you could use to test yourself on the forgetting‑curve idea:

1. What general shape does the forgetting curve follow, and why is an exponential decay model often used? [[question: Shape of forgetting curve?]]
2. How does the interval between learning and later recall affect the steepness of forgetting?
3. Which factor mentioned in the card most strongly influences how quickly memories fade?

Choose the ones that suit your study plan.
```

### nvidia/nemotron-nano-9b-v2:free — mastery-syllabus-breakdown

```


Here's a suggested syllabus structure: 1. Master HTML/CSS/JS fundamentals for web basics. 2. Learn computer graphics concepts like shaders and rendering pipelines. 3. Study WebGPU API fundamentals: resources, commands, and rendering loop. 4. Practice building 3D scenes in WebGPU. 5. Explore advanced WebGPU features and optimize performance. 6. Build real projects like a game or simulation. [[note: WebGPU pipeline]] [[question: How to structure project phases?]]

```

### nvidia/nemotron-nano-9b-v2:free — single-fact-worth-keeping

```


Spacing beats massing because repeated, spaced exposure strengthens memory traces more effectively than massed practice. [[note: Spacing effect]]

```

### nvidia/nemotron-nano-9b-v2:free — plain-question-no-artifact

```


Recall is actively retrieving information from memory without cues, like answering a question without options. Recognition is identifying correct information from given choices, like picking the right answer in a multiple-choice quiz. They differ in how the mind accesses stored knowledge—directly vs. through comparison.

```

### nvidia/nemotron-nano-9b-v2:free — group-existing-notes

```


You can group your WebGPU notes into a single card. Would you like me to help structure that content under one card? [[group: WebGPU notes]]

```

### nvidia/nemotron-nano-9b-v2:free — multi-question-generation

```


Here are some quiz questions you can test yourself with: [[note: Forgetting curve quiz questions]]  

1. Who is credited with discovering the forgetting curve?  
2. What does the forgetting curve illustrate about memory retention over time?  
3. How does spaced repetition counteract the effects described by the forgetting curve?

```
