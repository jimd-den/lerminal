# Workspace Agent SLM tag-grammar eval

Run at 2026-08-01T16:00:06.961Z. Real OpenRouter calls against the app's actual
system prompt (`composeSystemPrompt("workspace-agent")`) and the real
`parseAgentTags` parser — see `scripts/evalWorkspaceAgentTags.ts`.

| Model | Case | Tags | Flags |
|---|---|---|---|
| google/gemma-4-26b-a4b-it:free | mastery-syllabus-breakdown | 1 | 1 tag(s) referenced something that didn't resolve to a real card. |
| google/gemma-4-26b-a4b-it:free | single-fact-worth-keeping | 1 | — |
| google/gemma-4-26b-a4b-it:free | plain-question-no-artifact | 1 | Expected zero tags but got 1 — model over-tagged a plain question. |
| google/gemma-4-26b-a4b-it:free | group-existing-notes | 1 | — |
| google/gemma-4-26b-a4b-it:free | multi-question-generation | 1 | — |
| nvidia/nemotron-3-nano-30b-a3b:free | mastery-syllabus-breakdown | 1 | — |
| nvidia/nemotron-3-nano-30b-a3b:free | single-fact-worth-keeping | 1 | — |
| nvidia/nemotron-3-nano-30b-a3b:free | plain-question-no-artifact | 1 | Expected zero tags but got 1 — model over-tagged a plain question. |
| nvidia/nemotron-3-nano-30b-a3b:free | group-existing-notes | 1 | — |
| nvidia/nemotron-3-nano-30b-a3b:free | multi-question-generation | 1 | — |
| nvidia/nemotron-nano-9b-v2:free | mastery-syllabus-breakdown | 1 | — |
| nvidia/nemotron-nano-9b-v2:free | single-fact-worth-keeping | 1 | — |
| nvidia/nemotron-nano-9b-v2:free | plain-question-no-artifact | 2 | Expected zero tags but got 2 — model over-tagged a plain question. |
| nvidia/nemotron-nano-9b-v2:free | group-existing-notes | 1 | — |
| nvidia/nemotron-nano-9b-v2:free | multi-question-generation | 3 | — |

## Raw responses

### google/gemma-4-26b-a4b-it:free — mastery-syllabus-breakdown

```
To master WebGPU, you should start with the fundamental graphics pipeline, similar to what you have outlined in card 3. A good syllabus would progress from learning about buffers and memory management to understanding shaders (WGSL), render pipelines, and finally more advanced topics like compute shaders and command encoders.

I suggest we organize these topics into a structured [[group: WebGPU Syllabus]] so you can track your progress as you learn.
```

### google/gemma-4-26b-a4b-it:free — single-fact-worth-keeping

```
Spacing beats massing because it leverages the spacing effect, where distributing learning sessions over time forces the brain to work harder to retrieve information, thereby strengthening long-term memory. [[note: The spacing effect]]
```

### google/gemma-4-26b-a4b-it:free — plain-question-no-artifact

```
Recognition is the ability to identify information when you see it presented again, like a multiple-choice test. Recall is the much more difficult task of retrieving that information from memory without any external cues, which is why techniques like active recall are so effective. [[note: Recall vs Recognition]]
```

### google/gemma-4-26b-a4b-it:free — group-existing-notes

```
I can propose a new group for your WebGPU notes. Would you like me to create a group called [[group: WebGPU]] to hold card 3?
```

### google/gemma-4-26b-a4b-it:free — multi-question-generation

```
Here are a few ways you could test yourself on the concept:

What is the primary factor that determines the steepness of the forgetting curve?

How does the timing of a review session impact the rate of memory decay?

[[question: Factors affecting the forgetting curve]]
```

### nvidia/nemotron-3-nano-30b-a3b:free — mastery-syllabus-breakdown

```
First, open the existing card 3 that gives an overview of the WebGPU pipeline. Then work through these phases: fundamentals of GPU concepts, JavaScript/TypeScript API basics, WGSL shader language, rendering pipeline stages (vertex, fragment, compute), resource binding, debugging tools, and a small project to render a triangle. As you complete each phase you can add new cards for the topics you cover, building the syllabus over time. [[note: WebGPU syllabus]]
```

### nvidia/nemotron-3-nano-30b-a3b:free — single-fact-worth-keeping

```
Because spaced repetitions create more retrieval effort over time, they strengthen memory more than a single massed session. [[note: Spacing advantage]]
```

### nvidia/nemotron-3-nano-30b-a3b:free — plain-question-no-artifact

```
Recall means actively retrieving information from memory, while recognition is simply noticing that you’ve seen it before when it’s presented. This distinction is central to how spaced‑repetition systems work. [[note: Recall vs Recognition]]
```

### nvidia/nemotron-3-nano-30b-a3b:free — group-existing-notes

```
You could create a group called WebGPU to collect those notes. [[group: WebGPU]]
```

### nvidia/nemotron-3-nano-30b-a3b:free — multi-question-generation

```
Here are three quiz questions you can use to test yourself on the forgetting‑curve idea (based on Card 2):

1) What does the forgetting curve illustrate?  
2) How does the rate of forgetting change as time passes?  
3) Which factor can modify the shape of the curve, such as spaced repetition?  

[[question: What does the forgetting curve illustrate?]]
```

### nvidia/nemotron-nano-9b-v2:free — mastery-syllabus-breakdown

```


Learning WebGPU requires building a strong foundation in graphics concepts and the API itself. Here’s a proposed syllabus:  

**Phase 1: Environment & Basics**  
- Set up a WebGPU-compatible browser (e.g., Chrome).  
- Understand the core WebGPU structure: devices, queues, buffers, textures, and shader modules.  
- Learn how to write and compile shader code (WGSL) for graphics and compute tasks.  

**Phase 2: Rendering Fundamentals**  
- Implement a simple 2D or 3D rendering pipeline (vertex/fragment shaders).  
- Practice drawing shapes, handling input, and animating objects.  
- Explore debugging tools like the WebGPU inspector.  

**Phase 3: Advanced Topics**  
- Optimize performance using GPU features (e.g., compute shaders, multi-stage pipelines).  
- Work with complex geometries, lighting, or physics simulations.  
- Integrate WebGPU with other Web APIs (e.g., WebAssembly, WebRTC).  

Tag key points as you add details to your cards. For example, tag card #3 with `[[note: WebGPU pipeline overview]]` once you flesh it out. Start small and build incrementally!

```

### nvidia/nemotron-nano-9b-v2:free — single-fact-worth-keeping

```


Spacing beats massing because each delayed recall is harder, and difficulty strengthens memory. [[note: Desirable difficulty]]

```

### nvidia/nemotron-nano-9b-v2:free — plain-question-no-artifact

```


Recall requires you to actively retrieve information from memory without cues (like remembering a fact on your own), while recognition involves identifying something from given choices or cues (like picking the correct answer in a multiple-choice question). [[note: Recall vs Recognition]] [[question: Are there practical examples of each?]]

```

### nvidia/nemotron-nano-9b-v2:free — group-existing-notes

```


The WebGPU notes can be grouped using your existing card:  
"3. WebGPU pipeline overview".  

Would you like me to tag this card with a "group: WebGPU" label? [[group: WebGPU]]

```

### nvidia/nemotron-nano-9b-v2:free — multi-question-generation

```


The forgetting curve describes how memory strength declines over time without review. [[question: What triggers the reset of the forgetting curve?]] Spacing reviews just before forgetting maximizes retention. [[question: How does spacing leverage the curve?]] Testing yourself at intervals aligned with the curve’s decay can turn forgetting into learning. [[question: How might this apply to self-testing?]]

```
