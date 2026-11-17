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
- Treat browser mode as optional and customer-owned: no shared QuantumShield
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

## Repo Layout Notes

- `sfdx-project.json` exists **twice on purpose**: the root copy points repo-level
  `sf` tooling at `salesforce/force-app` so `sf` commands work from the repo
  root, while `salesforce/sfdx-project.json` serves the self-contained scratch-org
  workspace under `salesforce/`. Keep both; keep their `packageDirectories`
  consistent.
- `public/fonts/` holds the self-hosted woff2 fonts and `fonts.css`; pages load
  fonts only from there (no font CDNs — see `DESIGN.md`).
- `public/_headers` is the Cloudflare Pages security-header config (CSP etc.).
  `script-src` has no `'unsafe-inline'`: the `csp-inline-hashes` integration
  (last in `astro.config.mjs`, logic in `scripts/csp-inline-hashes.mjs`) hashes
  every inline `<script>` in the built HTML and writes the `'sha256-…'` sources
  into `dist/_headers`. Never add inline event handlers (`onclick="…"`); the
  build fails on them. The `/security` page describes the policy — change them
  together.
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
- If verification cannot run, record the reason in the release tracker below.

## Release Tracker

This file tracks the current state of the app as it moves toward a public beta.
Keep it practical: each item should either describe a release blocker, a concrete
polish task, or a verification step that has been completed.

## Current Status

- **Release stage:** beta candidate
- **Primary product path:** local `qshield` CLI
- **Secondary product path:** static browser app for setup, scans, and report review
- **Last reviewed:** 2026-11-17 (live-org review: browser sign-in fixed, rule accuracy, Astro 7; earlier 2026-08-13 wave in
  [docs/PRODUCTION_READINESS_REVIEW.md](./docs/PRODUCTION_READINESS_REVIEW.md))
- **Version:** 0.1.0 (`package.json` ↔ `src/lib/version.ts`, enforced by CI)

## Fixed In The 2026-08 Production-Readiness Wave

Findings and full verification detail:
[docs/PRODUCTION_READINESS_REVIEW.md](./docs/PRODUCTION_READINESS_REVIEW.md).
Summary of what landed (see also `CHANGELOG.md` 0.1.0):

- [x] **Trustworthy answers.** Per-category coverage model
  (`scanned` / `partial` / `failed` / `skipped`) recorded in `report.coverage`
  and surfaced in every artifact; failed scanner categories no longer render as
  "clean". Scanners no longer fabricate crypto facts the API does not expose
  (Connected Apps are inventory-only; SSO derives only from
  `RequestSignatureMethod`; Shield records a skip note when not licensed).
- [x] **CLI correctness.** `sf` 2.x redacted-token fallback; Tooling API
  pagination; unknown-flag rejection; documented exit codes (0/2/3/10/20) and
  `--allow-partial`; per-format writer isolation.
- [x] **Rule scoping.** `--region` no longer drops universally applicable rules;
  rules declare overlay mappings and findings carry `overlayIds`, so
  `--overlay` scopes the regulatory appendix (never which rules fire).
- [x] **Artifacts.** Schema-valid CycloneDX 1.6 CBOM; spec-conformant OpenVEX
  (no illegal `justification`/`impact_statement`); CSV formula-injection
  escaping; Unicode-safe PDF rendering; version stamped from
  `src/lib/version.ts`.
- [x] **Browser auth.** Authorization code + PKCE (`response_type=code`),
  scopes reduced to `api` + `id`, callback URL scrubbing, dev-mock hard-gated
  to dev builds.
- [x] **Legal & trust surface.** Apache-2.0 `LICENSE` + `NOTICE`;
  `public/_headers` with a real CSP (described verbatim on `/security`);
  repository links corrected to `OpenSystemsFoundation/quantum-shield`;
  self-hosted fonts (zero third-party requests).
- [x] **Release engineering.** GitHub Actions CI (typecheck web + CLI, unit
  tests, build, version-consistency check, advisory Playwright job);
  `npm audit fix` applied (16 → 5 advisories; the remainder need an Astro 7
  major bump — tracked below); `jsforce` removed; `tsx` moved to runtime
  dependencies; `engines` requires Node ≥ 22.12; `/dev/*` pages stripped from
  production builds; `CHANGELOG.md` started at 0.1.0.

## Open Items Toward Public Beta

- [x] Full CLI scan (`--probe-tls`, `--region`) against a live scratch org on a
  clean clone (2026-11-17; `qs-review` from the OpenSF Dev Hub).
- [ ] Re-verify `--probe-tls` hybrid-KEM detection against a real
  hybrid-capable endpoint from a machine with OpenSSL ≥ 3.5 and no TLS
  interception. The 2026-11 accuracy wave rewrote the detection (hybrid-only
  second handshake) and covered it with unit tests, but the review sandbox's
  egress gateway terminates TLS, so live probes there only see the gateway.
- [x] Browser OAuth (code + PKCE) verified end to end against a scratch org's
  My Domain, both locally and on the Cloudflare preview with the real CSP:
  sign-in, scan, all five downloads, sign-out revoke (token rejected after).
  2026-11-17.
- [ ] Repeat the browser round-trip against a production org and a sandbox
  (same code path as the scratch org's My Domain; not yet exercised).
- [x] CI trimmed to cheap checks that need no org, browser, or secrets
  (typecheck, unit tests, build, generated-table and version gates). The
  Playwright e2e suite is local-only: run `npm run test:e2e` before releases.
- [x] Astro 7 upgrade done 2026-11-17 (astro 7.4.x; Cloudflare build
  `NODE_VERSION` raised to satisfy its Node >= 22.23.4 requirement).
  `npm audit --omit=dev`: 1 low (esbuild Windows dev server via `tsx`).
- [x] Production domain is `https://quantumshield.opensf.foundation`, deployed
  as a static-assets Cloudflare Worker (`wrangler.jsonc`). PDF metadata points
  at the GitHub repository, not the domain.
- [x] Keyboard accessibility for the findings table and drawer; mobile layout
  for landing/app/report pages (no horizontal scroll at 390px; findings stack
  as cards; the finding detail is a full-screen dialog on phones).
- [ ] Decide whether the beta ever publishes to npm; until then the repo stays
  `"private": true` and installs from source (documented in README).
- [ ] Rotate the committed scratch-org ECA consumer key under `salesforce/`
  and keep seed metadata credential-free. (A consumer key is not a secret and
  only exists in short-lived scratch orgs, so this is hygiene, not a leak.)
- [x] The GitHub repository is public (2026-11-17), so the site's source,
  licence, issues and `git clone` links resolve.

## Release Readiness Definition

Beta is ready when:

- [ ] Clean clone setup succeeds from README instructions.
- [x] CLI scan works against at least one real Salesforce org.
- [x] Browser setup and scan work against at least one real Salesforce org.
- [x] All public links resolve (2026-11-17; a few regulator sites block
  automated checks with 403 but load in a browser).
- [x] README, architecture, install, and security docs match the implemented app
  (reconciled 2026-08-13).
- [x] Legal/privacy posture is explicit (LICENSE, NOTICE, /privacy, /terms).
- [x] Unit, type/check, and build pass in CI; key e2e tests pass locally.
- [x] Known limitations are documented in user-facing language (README beta
  caveats, /terms).
