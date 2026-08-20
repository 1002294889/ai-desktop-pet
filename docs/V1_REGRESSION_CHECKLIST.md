# V1 Regression Checklist

This checklist is the repeatable release regression for AI Desktop Pet V1. Record the date, host OS/architecture, build type, and whether DeepSeek was intentionally tested before changing a result.

## Verification record

- Date: 2026-08-20
- Host: macOS, Apple Silicon (`arm64`)
- Version: 1.0.0
- Development key handling: detected and tested only when locally configured; never printed
- Packaged build: unsigned and unnotarized local V1 build

Status legend: **PASS** was exercised in this environment, **INSPECTED** was verified by focused code/package inspection, and **PENDING-WINDOWS** requires a native Windows host.

## Desktop pet and runtime

- [x] **PASS:** Pet launches from the packaged application
- [x] **PASS/INSPECTED:** Transparent frameless window has no unwanted page background
- [x] **PASS:** Always-on-top changes immediately
- [x] **PASS:** Pointer dragging moves the window and pauses autonomous motion
- [x] **PASS/INSPECTED:** Bounds clamping prevents permanent inaccessibility
- [x] **INSPECTED:** Display removal/metrics listeners retain multi-display safety; only one physical display was available
- [x] **PASS:** Tray Hide keeps the process alive; Show restores the pet
- [x] **PASS/INSPECTED:** Pause/resume retains one autonomous scheduler without production debug counters
- [x] **PASS:** Idle, walk-left, walk-right, sit, sleep, and wake were observed
- [x] **PASS:** Reaching a display edge reverses walking direction
- [x] **PASS/INSPECTED:** Chat and manual interactions do not fight autonomous movement

## Actions, animation, and interaction

- [x] **PASS:** Hover quick actions expose Chat, Wave, Sit, and Sleep/Wake without obscuring the character
- [x] **PASS:** Native right-click menu exposes Chat, character, memory, settings, movement, and quit controls
- [x] **PASS:** Idle, walk-left, walk-right, sit, sleep, wake, happy, angry, jump, wave, talk, and dragged render
- [x] **PASS:** Priorities reject lower-priority interruption where required
- [x] **PASS:** Completed actions return to idle/autonomous behavior
- [x] **PASS/INSPECTED:** Hover, single-click, double-click, hold, and drag reaction paths work
- [x] **INSPECTED:** Sprite animation requestAnimationFrame is cancelled on action/unmount
- [x] **PASS:** Missing optional animation uses idle fallback
- [x] **PASS:** Unknown/disallowed AI action is rejected

## Characters

- [x] **PASS:** Built-in default is listed and protected from removal
- [x] **PASS:** Valid user pack imports outside the repository
- [x] **PASS:** Runtime switching works and survives restart
- [x] **PASS:** Malformed manifest, unsafe path, scripts, duplicate ID, and oversized input fail safely
- [x] **PASS:** Removing the active user character switches to default
- [x] **PASS/INSPECTED:** Chat, memory, emotion, and relationship state survive character switching

## Chat, provider, pacing, and time

- [x] **PASS:** Chat opens once, focuses when reopened, accepts input, and closes cleanly
- [x] **PASS:** Enter sends; Shift+Enter inserts a newline; empty messages are blocked
- [x] **PASS:** Thinking/typing UI appears during replies
- [x] **PASS:** Multiple messages work without duplicate windows
- [x] **PASS:** Local fallback works with no key
- [x] **PASS:** DeepSeek becomes active with a valid local development key
- [x] **PASS:** DeepSeek failure is converted to a controlled user-safe error
- [x] **PASS/INSPECTED:** Recent provider conversation context is bounded
- [x] **PASS:** Achievement and tired-work prompts receive contextual follow-ups
- [x] **PASS:** `2+2` receives one concise factual segment
- [x] **PASS:** Multi-segment delays vary naturally
- [x] **PASS:** New input cancels stale segments before display or persistence
- [x] **PASS/INSPECTED:** Pending reply timeouts are cancelled on close/dispose
- [x] **PASS:** Late-night context is used only when relevant; exact raw time is not recited

## AI semantic actions

- [x] **PASS:** `跳一下`, `挥挥手`, `坐下`, `睡觉吧`, and `醒醒` map to approved actions
- [x] **PASS:** A champion/achievement can choose a restrained happy/jump reaction
- [x] **PASS:** Tool parsing accepts only the approved semantic-action allowlist

## Memory, emotion, and relationship

- [x] **PASS:** Preferred name, age, occupation, preference, and event survive restart
- [x] **PASS:** Corrections replace active profile values and duplicates remain bounded
- [x] **PASS:** Trivial messages are not promoted automatically
- [x] **PASS:** Relevant memories reach AI context within retrieval bounds
- [x] **PASS:** Disabling memory blocks extraction and injection
- [x] **PASS/INSPECTED:** Memory UI displays, edits, searches, filters, and deletes individual entries
- [x] **PASS:** Conversation, long-term, and clear-all controls remain isolated as documented
- [x] **PASS:** Neutral, happy, excited, calm, sleepy, and annoyed states work and decay
- [x] **PASS:** Restart does not restore stale extreme emotion
- [x] **PASS:** Familiarity/trust grow gradually, persist, resist click farming, and do not decay from inactivity

## Settings, tray, startup, and shutdown

- [x] **PASS/INSPECTED:** Chat, Memory & Privacy, Characters, and Settings use consistent production chrome, spacing, status treatments, and empty states
- [x] **PASS:** Settings, Chat, Characters, and Memory are singleton windows
- [x] **PASS:** Settings persist across a full restart
- [x] **PASS:** Settings and Memory share one long-term-memory state
- [x] **PASS:** Provider/model/configured status contains no API key
- [x] **PASS/INSPECTED:** Every tray action is connected and focuses existing windows
- [x] **PASS:** Packaged launch-at-login enabled and disabled only AI Desktop Pet; native state was inspected both times
- [x] **PASS:** Tray Quit path and packaged clean quit destroy runtime resources and exit without zombies

## Packaging and security

- [x] **PASS:** `npm install`, typecheck, production build, and automated probes pass
- [x] **PASS:** Packaged macOS app and DMG are produced
- [x] **PASS:** Packaged app launches and loads the bundled default character
- [x] **PASS:** Renderer, preload, default assets, tray, and icons resolve without repository paths
- [x] **PASS:** `.env.local` and its exact configured key are absent from the mounted packaged app and DMG
- [x] **PASS:** SQLite, settings, relationship state, imported packs, and private logs are absent from Git
- [x] **INSPECTED / PENDING-WINDOWS:** Windows NSIS configuration is present; native installer verification remains pending

## Performance observation

With the packaged pet plus previously opened singleton windows, three 20-second samples showed no monotonic resident-memory growth (`460.2 → 458.2 → 439.1 MiB` across the Electron process group). Aggregate CPU settled from `9.1%` to `8.3%` during the short animated idle observation. Accessibility screenshots caused brief higher spikes and were excluded from the idle conclusion. Scheduler, animation-frame, reply-delay, IPC-listener, and window cleanup paths were also inspected; final clean quit left no app/helper processes.

## Automated commands

The probe environment uses an isolated temporary `userData` directory and an explicitly blank key unless the DeepSeek test is intentionally selected.

```bash
npm run typecheck
npm run build

DESKTOP_PET_MEMORY_TEST_MODE=use DESKTOP_PET_CONVERSATION_PACING_PROBE_MODE=exercise DESKTOP_PET_PROBE_ONLY=1 DEEPSEEK_API_KEY= npm run dev
DESKTOP_PET_MEMORY_TEST_MODE=use DESKTOP_PET_CHARACTER_MANAGEMENT_PROBE_MODE=exercise DESKTOP_PET_PROBE_ONLY=1 DEEPSEEK_API_KEY= npm run dev
DESKTOP_PET_MEMORY_TEST_MODE=use DESKTOP_PET_COMPANION_PROBE_MODE=exercise DESKTOP_PET_PROBE_ONLY=1 DEEPSEEK_API_KEY= npm run dev
DESKTOP_PET_MEMORY_TEST_MODE=use DESKTOP_PET_SETTINGS_PROBE_MODE=exercise DESKTOP_PET_PROBE_ONLY=1 DEEPSEEK_API_KEY= npm run dev

# Run only when a local DeepSeek development key is intentionally configured.
DESKTOP_PET_MEMORY_TEST_MODE=use DESKTOP_PET_CONVERSATION_PACING_PROBE_MODE=deepseek DESKTOP_PET_PROBE_ONLY=1 npm run dev
```

Multi-launch persistence probes must run in their documented seed/verify order. Do not run the DeepSeek probe unless a local development key is intentionally configured.
