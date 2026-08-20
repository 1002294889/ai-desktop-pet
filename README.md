# AI Desktop Pet

AI Desktop Pet is a private, character-pack-based desktop companion built with Electron, React, TypeScript, and electron-vite. V1 lives in a transparent floating window, moves around the desktop, reacts to pointer interactions, chats through DeepSeek or an offline fallback, and stores optional memory locally.

## V1 features

- Transparent frameless pet window with always-on-top and display-bound protection
- Autonomous idle, walking, sitting, sleeping, and waking behavior
- Click, double-click, hold, hover, and drag reactions
- Semantic action system with priorities and AI-controlled actions
- Replaceable static/sprite Character Packs with runtime import, switching, and removal
- DeepSeek conversation provider with an offline `LocalReplyProvider` fallback
- Natural segmented replies, interruption cancellation, and local-time awareness
- SQLite conversation history, structured long-term memory, emotion, and relationship state
- Polished Chat, Memory & Privacy, Characters, and Settings windows with consistent production styling
- Hover quick actions plus native pet context-menu and menu-bar/system-tray controls
- Launch-at-login support in packaged macOS and Windows builds

## Requirements

- Node.js 20.19 or newer
- npm
- macOS for the currently verified V1 build
- Windows for native verification of the configured NSIS installer

## Install dependencies and run development

```bash
npm install
npm run dev
```

The development renderer includes diagnostics and keyboard shortcuts. They are removed from production builds.

## DeepSeek development configuration

Create `.env.local` in the repository root:

```dotenv
DEEPSEEK_API_KEY=sk-example
```

Optional development settings:

```dotenv
AI_PROVIDER=deepseek
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEK_BASE_URL=https://api.deepseek.com
```

Never commit `.env.local` or a real key. The file is Git-ignored, is loaded only by the Electron main process during development, and is explicitly excluded from packaging. The key is never sent to renderer code.

Packaged V1 builds do not include a developer key and do not yet provide secure end-user API-key entry. Without a key, chat safely uses the offline fallback.

## Quality, build, and packaging commands

```bash
npm run typecheck       # TypeScript checks
npm run build           # Typecheck plus production electron-vite build
npm run start           # Preview production output locally
npm run package         # Unpacked app for the current platform
npm run package:mac     # macOS arm64 .app
npm run dist            # Installer for the current platform
npm run dist:mac        # macOS arm64 DMG
npm run dist:mac:x64    # macOS x64 DMG for future Intel verification
npm run dist:win        # Windows x64 NSIS installer configuration
```

Artifacts are written to `release/`. The current macOS build is unsigned and unnotarized. A locally built app can be opened for testing, but downloaded copies may trigger Gatekeeper. Public distribution requires an Apple Developer ID certificate, hardened-runtime signing, and Apple notarization.

The Windows installer is configured for per-user NSIS installation. It still requires a Windows machine for final native build, installation, tray, startup, and uninstallation verification.

## Character Packs

Bundled characters live in `characters/`; imported characters are copied to Electron's per-user application-data directory. A pack contains a validated `character.json` and image assets. Core behavior requests semantic actions such as `happy`, `jump`, or `sleep`; each pack maps those actions to its own files.

Character packs may currently use `static-image` or `sprite` rendering. Executable/script files, unsafe paths, duplicate IDs, malformed manifests, and oversized packs are rejected. Missing optional actions fall back to the pack's idle action.

## Memory and privacy

Long-term memory is optional and can be disabled from either Settings or Memory & Privacy. Users can inspect, edit, search, filter, or delete saved information, clear conversation history separately, clear long-term memory, or clear all local companion data.

Data stays under Electron's `userData` directory:

- macOS: `~/Library/Application Support/AI Desktop Pet/`
- Windows: `%APPDATA%\AI Desktop Pet\`

This directory contains `pet-memory.db`, `app-settings.json`, `character-settings.json`, and imported character packs under `characters/`.

## Security architecture

- `contextIsolation: true`
- `nodeIntegration: false`
- renderer sandbox enabled
- narrow, validated preload/IPC APIs
- provider requests, secrets, persistence, native windows, and OS integration remain in the main process

## Platform status and roadmap

V1 is locally verified on Apple Silicon macOS. Windows packaging is configured but awaits native Windows verification. V2 may add higher-quality rendering, voice, and an optional 3D renderer; Live2D and 3D are intentionally not part of V1.

See [V1 regression checklist](docs/V1_REGRESSION_CHECKLIST.md) and [V1 release checklist](docs/V1_RELEASE_CHECKLIST.md) for release verification.
