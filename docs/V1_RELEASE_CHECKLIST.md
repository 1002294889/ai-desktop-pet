# V1 Release Checklist

## Code and regression

- [x] Dependency integrity (`npm install`)
- [x] TypeScript checks
- [x] Production electron-vite build
- [x] V1 automated regression probes
- [x] Native pet/chat/drag/action regression
- [x] Settings and memory restart persistence
- [x] Character import/switch/restart regression
- [x] Tray actions and clean quit
- [x] Production pet context menu and hover quick actions
- [x] Polished Chat, Memory & Privacy, Characters, and Settings windows
- [x] Idle CPU/memory and timer/listener observation

## Security and privacy

- [x] `.env.local` is Git-ignored
- [x] `.env.local` and the exact configured API key are absent from packaged artifacts
- [x] No API key reaches renderer/preload IPC
- [x] No SQLite database, settings file, imported character, relationship state, or private log is tracked
- [x] Packaged user data remains in Electron `userData`

## Packaged resources

- [x] `app.asar` contains main, preload, and renderer output
- [x] `Resources/characters/default/character.json` exists
- [x] Default character assets load through `character-pack://`
- [x] Application and tray icons render
- [x] Imported characters continue to use `userData/characters`

## Platform release status

- [x] macOS arm64 `.app` built
- [x] macOS arm64 DMG built and mounted successfully
- [x] Packaged macOS app launched locally
- [x] macOS signing status recorded: unsigned local build (only Electron's linker ad-hoc executable signature)
- [x] macOS notarization status recorded: not notarized
- [x] Gatekeeper implications documented
- [x] Windows x64 NSIS configuration reviewed
- [ ] Windows installer built and tested on Windows (pending until a Windows host is available)

## Local storage locations

- SQLite: `userData/pet-memory.db`
- Application settings: `userData/app-settings.json`
- Character selection: `userData/character-settings.json`
- Imported packs: `userData/characters/`

## Final handoff

- [x] Artifact paths recorded in the final V1 report
- [x] Known limitations recorded
- [x] Final `git status` inspected
- [x] V1 release report completed
