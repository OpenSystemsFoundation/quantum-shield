# AGENTS.md

Guidance for AI coding agents working in this repository.

## Project Overview

QuantumShield is a post-quantum readiness scanner for Salesforce orgs. It ships
with two user-facing paths:

- Local `qshield` CLI for real operational scans.
- Static Astro/Svelte browser app for setup, browser-mode scans, report review,
  and demos.

Both paths share the TypeScript scan engine, rule catalog, PDF renderer, CBOM
builder, and OpenVEX/report output code under `src/lib/`.

## Agent Operating Rules

- Preserve the CLI-first product positioning unless the user explicitly changes
  direction.
- Treat browser mode as optional and user-owned: no shared QuantumShield
  Connected App, no backend proxy, and no write access to Salesforce orgs.
- Do not edit generated files directly unless the generator is also updated.
  Generated files include:
  - `src/lib/rules/rule-catalog.generated.ts`
  - `src/lib/rules/regulations.generated.ts`
  - `src/lib/scan/fixtures/liveOrgSnapshot.generated.ts`
- Treat `DESIGN.md` as the design-system contract for visual work. If changing
  colors, typography, spacing, corner radius, component styling, or UI tone,
  update `DESIGN.md` and run `npm run design:lint`.
- Before broad copy or UX changes, check the relevant pages/components:
  - Landing: `src/pages/index.astro`
  - Install guide: `src/pages/install.astro`
  - Security page: `src/pages/security.astro`
  - Browser setup wizard: `src/components/ConnectWizard.svelte`
  - App overview: `src/components/AppShell.svelte`
  - Scan flow: `src/components/ScanView.svelte`
  - Report flow: `src/components/ReportView.svelte`
- Keep public claims aligned across `README.md`, `ARCHITECTURE.md`, app copy,
  and generated regulation/rule content.
- Do not weaken the privacy/security posture for convenience. Any feature that
  uploads org data, stores tenant data remotely, requests broader Salesforce
  scopes, or writes back to Salesforce must be called out as a product decision.
- Keep edits scoped. Avoid unrelated refactors during release-prep work.
- This is a public open-source repository. Do not commit internal planning
  notes, review logs, trackers, credentials, or local tool settings
  (`.claude/settings.local.json` is gitignored). Track work in GitHub issues.
- Keep GitHub Actions cheap and org-free: no Salesforce org, browser, or secrets
  in CI. Pin third-party actions by full commit SHA with a version comment;
  Dependabot updates them.

## Repo Layout Notes

- `sfdx-project.json` exists **twice on purpose**: the root copy points repo-level
  `sf` tooling at `salesforce/force-app` so `sf` commands work from the repo
  root, while `salesforce/sfdx-project.json` serves the self-contained scratch-org
  workspace under `salesforce/`. Keep both; keep their `packageDirectories`
  consistent.
- `public/fonts/` holds the self-hosted woff2 fonts and `fonts.css`; pages load
  fonts only from there (no font CDNs — see `DESIGN.md`).
- `public/_headers` is the Cloudflare static-assets security-header config (CSP etc.).
  `script-src` has no `'unsafe-inline'`: the `csp-inline-hashes` integration
  (last in `astro.config.mjs`, logic in `scripts/csp-inline-hashes.mjs`) hashes
  every inline `<script>` in the built HTML and writes the `'sha256-…'` sources
  into `dist/_headers`. Never add inline event handlers (`onclick="…"`); the
  build fails on them. The `/security` page describes the policy — change them
  together.
- `.node-version` pins the Node version for the Cloudflare build and CI. Keep
  `engines` in `package.json`, `.node-version` and the workflows in step, and
  leave the Cloudflare `NODE_VERSION` build variable unset (it would override
  the file). Public build values live in the committed `.env.production`; do
  not duplicate them as Cloudflare build variables either.
- `src/lib/version.ts` is the single source of truth for the tool version; CI
  fails if it disagrees with `package.json`'s `version`.
- `cli/` is excluded from `tsconfig.json`; typecheck it with
  `npx tsc --noEmit -p tsconfig.cli.json`.

## Common Commands

Run these from the repo root.

```sh
npm install
npm run sync:regulations
npm run design:lint
npm run check
npx tsc --noEmit -p tsconfig.cli.json
npm test
npm run build
npm run test:e2e
npm run qshield -- help
npm run qshield -- orgs
npm run qshield -- scan --target-org <alias>
```

## Verification Expectations

- For docs/copy-only changes, run at least `npm run check` when dependencies are
  installed.
- For rule or scanner changes, run `npm test` and any focused tests that cover
  the touched area.
- For browser UX changes, run `npm run build` and relevant Playwright tests.
- For CLI changes, run the relevant `npm run qshield -- ...` command and unit
  tests for `cli/` or shared scanner code.
- If verification cannot run, say so and why in the pull request description.

## Releases

- Record user-visible changes under `## [Unreleased]` in `CHANGELOG.md`.
- To release: bump `version` in `package.json` and `QSHIELD_VERSION` in
  `src/lib/version.ts` together, move the changelog entries under the new
  version, merge, then push a `vX.Y.Z` tag. `.github/workflows/release.yml`
  builds the site, generates a CycloneDX SBOM, attests build provenance, and
  publishes a GitHub Release. The tag must match `package.json`.
- Security issues follow `SECURITY.md`; never discuss an unfixed vulnerability
  in a public issue or pull request.
