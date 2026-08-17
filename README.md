# AI Desktop Pet

An Electron, React, and TypeScript foundation for an AI desktop pet application.

## Development

```bash
npm install
npm run dev
```

## Quality checks

```bash
npm run typecheck
npm run build
```

The renderer runs with context isolation and sandboxing enabled. It receives only a small, typed API from the preload process; Node.js integration is disabled.
