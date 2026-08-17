# AI Desktop Pet

## Project Goal

Build an AI desktop pet inspired by the interaction experience of classic desktop pets such as QQ Pet.

The final pet should:

- live directly on the desktop
- use a transparent frameless window
- stay above normal windows when appropriate
- walk around the desktop
- idle automatically
- sit
- sleep and wake up
- jump
- wave
- show happy and angry reactions
- react when clicked
- react when dragged
- display speech bubbles
- chat with the user
- connect to an AI API
- allow AI tool calls to trigger pet actions
- support autonomous behavior
- support long-term pet state in the future
- potentially support Live2D in a later phase

## Current Tech Stack

- Electron
- React
- TypeScript
- electron-vite

Do not replace this stack unless explicitly requested.

## Architecture

### Electron Main Process

Responsible for:

- window management
- operating system integration
- AI API requests
- local persistence
- secure functionality

### Preload

Responsible for:

- secure IPC bridge between renderer and main
- exposing only explicitly approved APIs

### Renderer

Responsible for:

- pet rendering
- animations
- pet UI
- speech bubbles
- chat interface
- visual state

## Character Pack System

The desktop pet application must NOT be tied to one fixed character.

The application must support replaceable and installable character packs.

Users should eventually be able to switch between different characters without changing the core application code.

The core application must be completely character-agnostic.

Each character must eventually live in its own package, for example:

```text
characters/
  default-character/
    character.json
    preview.png
    assets/
    animations/
      idle/
      walk_left/
      walk_right/
      sit/
      sleep/
      wake/
      happy/
      angry/
      jump/
      wave/
      talk/
```

Each character.json should eventually be able to define:

- character id
- character display name
- renderer type
- default size
- scale
- animation mapping
- available actions
- optional personality
- optional voice
- optional AI behavior configuration

Application behavior must use semantic actions such as:

```text
playAction("happy")
playAction("jump")
playAction("sleep")
playAction("wave")
```

Core behavior code must NEVER directly depend on a specific character's filenames.

The active character pack is responsible for mapping semantic actions to its own animation assets.

The rendering architecture should be designed so different rendering engines can be supported later:

- static image renderer
- sprite animation renderer
- animated image renderer
- Live2D renderer

The first version should use the simplest reliable image/sprite rendering system.

Do NOT implement Live2D yet.

Character assets and application logic must remain separated.

Future functionality should support:

- switching characters
- importing character packs
- removing character packs
- previewing characters
- creating custom character packs

Do not bundle third-party copyrighted character assets into the public repository unless appropriate rights exist.

User-provided character assets should be supported by the character pack system.

## AI Provider Architecture

The desktop pet must not be permanently tied to one AI provider.

The future AI layer must use a provider abstraction so the application can support providers such as:

- DeepSeek
- OpenAI
- other compatible AI APIs

Core chat logic must not directly depend on one provider SDK.

Future architecture should look approximately like:

```text
Chat System
→ AIProvider interface
→ DeepSeekProvider / OpenAIProvider / other providers
```

Users should eventually be able to choose an AI provider in settings.

API keys must:

- never be hardcoded
- never be exposed directly to renderer code
- never be committed to GitHub
- be handled securely through the Electron main process or another secure layer

## Long-Term Memory Architecture

The desktop pet should eventually support persistent user memory.

The AI model itself is NOT the permanent memory store.

The application owns and manages memory.

Memory should be separated into:

1. Short-term conversation context

Examples:

- current conversation
- recent messages
- current topic

2. Structured long-term user profile

Examples:

- preferred name
- age when voluntarily provided
- occupation
- interests
- preferences
- important goals
- recurring habits
- important people

3. Event / summarized memory

Examples:

- important recent life events
- ongoing projects
- important things the user wants the pet to remember
- meaningful past conversations

Create a future MemoryManager architecture.

Initial long-term storage should use a local database such as SQLite.

The future flow should support:

```text
User message
→ retrieve relevant memories
→ build AI context
→ AIProvider
→ personalized response
```

It should also support:

```text
Conversation
→ MemoryExtractor
→ determine whether information is worth remembering
→ structured memory
→ local persistent storage
```

Do NOT permanently remember every message.

The system should eventually use importance and relevance to decide what should be retained.

Users must eventually be able to:

- view saved memories
- edit memories
- delete individual memories
- clear all memories
- disable long-term memory

Sensitive or personal information should not be silently stored without appropriate user controls.

## Personality Architecture

Character appearance and AI personality must remain separate but connectable.

A Character Pack may eventually provide an optional personality configuration.

Examples:

character.json or an associated personality configuration may define:

- personality name
- speaking style
- emotional tendencies
- preferred reactions
- relationship style

The same user memory system should be reusable across different characters.

Example:

```text
User says:
"I had a difficult day at work."

A gentle character may respond warmly.

A playful character may respond humorously.

Both characters may use the same underlying relevant memories.
```

Do not implement AI, memory, or personality in this step.

## Security Rules

Always preserve:

- contextIsolation: true
- nodeIntegration: false
- sandbox enabled where compatible

Never expose unrestricted Node.js access to the renderer.

Never place API keys directly in renderer code.

Never commit API keys or secrets to GitHub.

AI API requests must eventually be handled securely outside the renderer.

## Development Rules

1. Implement one major feature at a time.
2. Preserve existing working functionality.
3. Do not rewrite unrelated files unnecessarily.
4. Keep code modular.
5. Avoid giant components.
6. Centralize pet actions.
7. Centralize pet state.
8. Do not let individual UI components directly control unrelated pet behavior.
9. Run typecheck after meaningful changes.
10. Run production build after meaningful changes.
11. Fix errors before declaring a task complete.
12. Do not add major dependencies unless there is a clear reason.

## Initial Pet Actions

The action system will eventually support:

- idle
- walk_left
- walk_right
- sit
- sleep
- wake
- happy
- angry
- jump
- wave
- talk
- dragged

All future pet animations should eventually go through one centralized action controller/state machine.

## Development Phases

Phase 1:
Desktop pet shell

Phase 2:
Animation and action state machine

Phase 3:
Autonomous desktop behavior

Phase 4:
Speech bubble and chat UI

Phase 5:
AI conversation API

Phase 6:
AI tool calling controlling pet actions

Phase 7:
Memory, mood, affection, hunger and other persistent pet state

Phase 8:
Advanced animation / Live2D / voice
