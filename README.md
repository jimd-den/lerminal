# Learnimal

Learnimal is an intelligent, pipeline-driven learning application designed to help you break down complex topics into atomic, recall-ready concepts. Built with React Native and Expo, it leverages a unique Unix-style command pipeline to process, organize, and schedule your learning material.

## What it does

Learnimal treats knowledge as a stream that can be piped through a series of commands. You start with raw information (a topic or a source) and pipe it through transformations to ultimately create a spaced-repetition study deck.

### The Pipeline Philosophy
Just like a Unix terminal, you chain commands together using the pipe `|` operator:

```text
ask "React Hooks" | chunk | recall | space
```

**What this pipeline does:**
1. `ask "React Hooks"`: Queries an LLM to generate an initial set of learning cards about React Hooks.
2. `chunk`: Breaks down the broad topic into smaller, atomic fact cards.
3. `recall`: Converts those atomic facts into Question/Answer flashcards.
4. `space`: Schedules the newly created flashcards into a spaced-repetition queue.

### Core Features
- **Unix-style Command Palette**: Compose complex workflows by piping commands together (`ask`, `chunk`, `group`, `move`, `review`, etc.).
- **Bring Your Own Key**: Learnimal integrates with OpenRouter, allowing you to use your own API key to query state-of-the-art models like Gemini, Llama, and Claude without being locked into a subscription.
- **Custom Agent Commands**: Define your own commands with custom system prompts (e.g., `explain-simply`) and seamlessly use them in your pipelines alongside built-in commands.
- **Local-First & Clean Architecture**: Built on strict Clean Architecture principles (Entities, Use Cases, Adapters), ensuring the app remains decoupled, testable, and robust.

## Getting Started

1. **Install dependencies:**
   ```bash
   npm install
   # or
   bun install
   ```

2. **Start the Expo server:**
   ```bash
   npm start
   # or
   bun run start
   ```

3. **Enter your API Key:** 
   Upon first launch, you will be asked for an OpenRouter API key. This empowers the agent to generate and process your learning cards.
