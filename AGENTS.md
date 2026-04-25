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

## Common Commands

Run these from the repo root.

```sh
npm install
npm run sync:regulations
npm run design:lint
npm run check
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

- **Release stage:** pre-beta audit
- **Primary product path:** local `qshield` CLI
- **Secondary product path:** static browser app for setup, scans, and report review
- **Last reviewed:** 2026-04-25
- **Current verification state:** `npm run design:lint`, `npm run check`,
  `npm test`, and `npm run build` pass as of 2026-04-25

## Immediate Blockers

- [x] Install project dependencies and rerun baseline verification.
  - Installed `@google/design.md` and restored missing project dependencies.
  - `npm run check` passes with 0 errors and 0 warnings.
  - `npm test` passes with 6 files and 24 tests.
- [ ] Track npm audit findings before beta.
  - After Astro 6 and Tailwind removal, `npm audit --json` reports 5 moderate
    vulnerabilities in the dev-only `@astrojs/check` language-server dependency
    chain.
  - npm's available fix downgrades `@astrojs/check` to 0.9.2, so this should be
    tracked as an upstream tooling issue unless a compatible patched release is
    available.
- [ ] Decide whether `package.json` should stay `"private": true` for beta.
  - If the beta expects npm-style installation, package metadata and publishing
    posture need to be made explicit.
- [x] Add or remove linked legal pages.
  - Added `/privacy` and `/terms` beta posture pages.
- [ ] Replace placeholder deployment/domain copy before public launch.
  - Setup docs use runtime origin in the browser, but static placeholders such as
    `https://quantumshield.example` still appear in source and PDF metadata.

## Copy And Positioning

- [x] Align all product descriptions around the same beta message.
  - Current top-level docs position CLI as recommended and browser as optional.
  - `src/layouts/Shell.astro` now describes the product as CLI-first with an
    optional browser workflow.
- [x] Review landing-page navigation labels.
  - Landing nav now links to `/docs/rules` and `/docs/regulations` instead of
    sending multiple labels to `/install`.
- [ ] Make the CLI-first path unmistakable on the landing page, install guide,
  README, and browser setup wizard.
- [ ] Verify all standards/framework claims are backed by current rule content.
  - README claims 23 regulatory sources.
  - Architecture mentions sources and capabilities that should match
    `src/content/regulations/` and generated manifests.
- [ ] Tighten beta language around advisory output.
  - Avoid implying legal attestation or exhaustive compliance coverage.

## Documentation

- [ ] README
  - [ ] Confirm quickstart commands work on a clean clone.
  - [ ] Add beta caveats: supported Salesforce surfaces, known gaps, and support
    expectations.
  - [ ] Add clear prerequisites: Node version, Salesforce CLI, required org
    permissions, and browser-mode requirements.
- [ ] Architecture
  - [ ] Remove or mark non-implemented features as planned.
  - [ ] Reconcile claims about charts, analytics, privacy/terms pages, and docs
    routes with the actual app.
  - [ ] Add a concise threat model for browser mode and CLI mode.
- [ ] Install guide
  - [ ] Verify External Client App and Connected App instructions against the
    current Salesforce setup UI.
  - [ ] Add troubleshooting for CORS, OAuth policy propagation, expired sessions,
    and insufficient API permissions.
- [ ] Security page
  - [ ] Clarify token storage behavior.
  - [ ] Confirm the stated CSP is actually enforced by the deployed host.

## UX Workflow

- [x] Landing page
  - [x] Fix broken/misleading nav links.
  - [x] Ensure the first CTA points to the recommended CLI path.
  - [x] Decide whether the report preview numbers should be marked as sample data.
- [ ] Browser setup wizard
  - [ ] Confirm step order with a real org.
  - [ ] Add better recovery when OAuth succeeds but the first API call fails.
  - [ ] Clarify that the active browser session is in `sessionStorage`, while the
    remembered client ID and region preference are in `localStorage`.
- [ ] App overview
  - [ ] Confirm empty state, scan history, region selector, and clear-data flow.
  - [ ] Consider making region selection required or explicitly "Full catalog."
- [ ] Scan flow
  - [ ] Verify progress states for successful, partial, CORS-failed, and
    auth-expired scans.
  - [ ] Confirm failed category handling does not imply the whole scan succeeded.
- [ ] Report flow
  - [ ] Verify finding filters, drawer, exports, and PDF download.
  - [x] Add OpenVEX download in browser mode if it is intended to match CLI output.

## Styling And Accessibility

- [x] Add a machine-readable design-system contract.
  - `DESIGN.md` now captures QuantumShield colors, typography, spacing, radius,
    component tokens, and UI usage rules.
  - `npm run design:lint` validates the file through `@google/design.md/linter`
    with 0 errors and 0 warnings.
- [x] Remove Tailwind before Astro 6 migration.
  - Tailwind and `@astrojs/tailwind` were removed; the app is CSS-first and keeps
    `DESIGN.md` as the design contract.
- [x] Upgrade the Astro stack for beta.
  - `astro`, `@astrojs/mdx`, `@astrojs/svelte`, `@astrojs/check`, and `vitest`
    were updated.
  - Content collections were migrated to Astro 6 content-layer loaders.
  - Docs routes now use content entry IDs instead of legacy slugs.
- [ ] Test desktop and mobile layouts for landing, setup, app overview, scan, and
  report pages.
- [ ] Replace inline-heavy page styling with reusable classes where it reduces
  maintenance risk.
- [ ] Check keyboard navigation for wizard choices, filters, table rows, drawer,
  and export buttons.
- [ ] Check color contrast for severity pills, muted text, nav states, and warning
  panels.
- [ ] Ensure long org names, usernames, scan IDs, and finding titles wrap without
  breaking layout.

## Engineering And Packaging

- [ ] Run `npm install` on a clean clone and verify generated files remain stable.
- [ ] Run:
  - [x] `npm run sync:regulations`
  - [x] `npm run check`
  - [x] `npm test`
  - [x] `npm run build`
  - [ ] `npm run test:e2e`
- [ ] Verify the CLI path:
  - [ ] `npm run qshield -- help`
  - [ ] `npm run qshield -- orgs`
  - [ ] `npm run qshield -- scan --target-org <alias>`
  - [ ] `npm run qshield -- scan --target-org <alias> --probe-tls`
- [ ] Verify browser mock/demo flow without Salesforce credentials.
- [ ] Verify browser OAuth flow against production, sandbox, and My Domain.
- [ ] Confirm generated artifacts:
  - [x] PDF
  - [x] CycloneDX CBOM JSON
  - [x] OpenVEX JSON
  - [x] findings CSV
  - [x] raw report JSON

## Release Readiness Definition

Beta is ready when:

- [ ] Clean clone setup succeeds from README instructions.
- [ ] CLI scan works against at least one real Salesforce org.
- [ ] Browser setup and scan work against at least one real Salesforce org.
- [ ] All public links resolve.
- [ ] README, architecture, install, and security docs match the implemented app.
- [ ] Legal/privacy posture is explicit.
- [ ] Unit, type/check, build, and key e2e tests pass.
- [ ] Known limitations are documented in user-facing language.

## Notes From 2026-04-25 Audit Start

- `npm run check` and `npm test` were attempted and both stopped during
  `npm run sync:regulations` because `gray-matter` was missing from installed
  dependencies.
- Later on 2026-04-25, `npm install @google/design.md --save-dev` restored
  dependencies and installed the Design.md CLI package.
- The published `design.md` CLI hung in this Windows shell, so
  `scripts/lint-design-md.mjs` uses the official `@google/design.md/linter`
  API directly for reliable local validation.
- `npm run design:lint`, `npm run check`, `npm test`, and `npm run build` passed
  after the Design.md integration.
  `npm run check`, `npm test`, and `npm run build` needed elevated command
  execution because `npm run sync:regulations` rewrites generated files.
- Public-copy pass added `/privacy` and `/terms`, corrected the global meta
  description, changed landing docs links to real docs routes, marked the hero
  report preview as sample data, and added browser downloads for OpenVEX JSON and
  raw report JSON.
- Tailwind was removed after the Design.md contract was added. The remaining
  styling path is Astro/Svelte CSS plus `DESIGN.md`.
- Astro 6 migration completed after replacing legacy content collection slug
  usage in docs routes and links.
- The repo currently has an untracked root `sfdx-project.json`.
