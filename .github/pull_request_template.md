## What and why

<!-- What does this change, and why? Link the issue it fixes, e.g. "Fixes #12". -->

## How I verified it

<!-- Commands you ran and what you checked by hand. Say so if something could not be verified. -->

## Checklist

- [ ] `npx tsc --noEmit -p tsconfig.json`, `npx tsc --noEmit -p tsconfig.cli.json`, `npm test` and `npm run build` pass locally
- [ ] Tests added or updated for rule, scanner, CLI or artifact changes
- [ ] `CHANGELOG.md` updated under `[Unreleased]` for user-visible changes
- [ ] Docs updated where behaviour or claims changed (`README.md`, `ARCHITECTURE.md`, site pages)
- [ ] Rule changes cite a primary source; generated files were regenerated, not hand-edited
- [ ] No credentials, tokens or real org data in the diff
