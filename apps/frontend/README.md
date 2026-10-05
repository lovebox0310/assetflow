# frontend workspace

Frontend implementation area for AssetFlow.

## Planned stack

- React
- TypeScript
- Responsive web UI

## Sprint 1 target

- Login page
- Dashboard layout
- Dashboard core cards (4)

## Run and verify

Current status:

- This folder currently contains source files only.
- Build tool files like `package.json` are not present yet.

When frontend scaffolding is added (React + TypeScript), use:

```bash
pnpm install
pnpm run dev
pnpm run build
pnpm run test
```

`pnpm` is the project's only package manager (see §30 in `.ai/project.md`).
Do not add `package-lock.json` or `yarn.lock`; the lock file is `pnpm-lock.yaml`.

Notes for AI collaboration:

- Use `pnpm run dev` for local checks while implementing UI.
- Use `pnpm run build` before PR to catch type/build issues.
