# Changelog

All notable changes to QuantumShield are documented here. The format is based
on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Security

- **CSP no longer allows inline scripts wholesale.** `script-src 'unsafe-inline'`
  is gone from `public/_headers`. A final build step (`csp-inline-hashes` in
  `astro.config.mjs`) hashes every inline `<script>` in the built pages and
  writes `'sha256-…'` sources into `dist/_headers`, so new inline scripts are
  covered automatically and injected ones do not run. The build fails on inline
  event-handler attributes. `/security` describes the generated policy.
- **Sign out revokes the token.** Signing out now sends a best-effort
  `POST /services/oauth2/revoke` to the org before discarding the session
  (skipped for dev-mock sessions), and asks whether to also delete local scan
  data. `/security` and `/privacy` now state plainly that scan history and
  reports persist in IndexedDB until the user deletes them.
- Citation links in the finding detail only link to `https:` URLs and use
  `rel="noopener noreferrer"`.

### Added (browser app)

- **Public sample report at `/demo`**, linked as "View a sample report" from
  the landing page and `/connect`. It runs the real rule catalog over the
  bundled fixture snapshot under a persistent "Sample data — not your org"
  banner, creates no session, stores nothing, and does not enable the dev-mock
  sign-in. Sample exports are prefixed `SAMPLE-`. The landing page's sample
  card now shows that same report's numbers, computed at build time.

### Fixed (browser app)

- **Phone layout.** No horizontal scrolling at 390px on `/app`, the scan and
  report pages, `/security` and `/callback`; findings render as stacked cards
  on phones and the scan-history table scrolls inside its card.
- **Findings table accessibility.** Rows are no longer `role="button"`; each
  finding has a real button, headers have `scope="col"`, the truncated ID
  column (identical for most rows) is replaced by the rule id, and rows without
  a deadline date say so. The finding detail is a labelled dialog: full-screen
  with a focus trap on phones, and no longer covering the sidebar on desktop.
- Sidebar "Scans" and "Overview" no longer point at the same place, and
  unavailable items are announced as unavailable.

### Changed

- **Rebranded as a free, open-source OpenSF project.** All references to the
  former commercial entity are gone; the site now presents QuantumShield as an
  Open Systems Foundation project, free for everyone under Apache 2.0, with a
  new "Free for everyone. Built in the open." section and an OpenSF-style
  header and footer on every public page.
- **Visual design aligned with the OpenSF design system**: OpenSF blue palette
  and CTA gradient, tonal layering and ambient shadows instead of hard
  borders, Poppins (display) + Inter (UI) replacing Source Serif 4 + Inter
  Tight (JetBrains Mono kept for evidence), rounder cards, pill chips, and
  links that no longer render with default browser underlines.

### Added

- **`R-TLS-RSA-KEX`** (critical): flags probed TLS 1.2 endpoints that negotiate
  static RSA key exchange (no forward secrecy), the first thing Salesforce's
  PQC white paper tells customers to remove.
- **`R-TLS-HYBRID-SF-SIDE`** (low, advisory): a hybrid-KEM-capable endpoint
  used to produce no finding, which read as "clean". It now records that the
  probe ran from the scanning machine and Salesforce callouts should still be
  assumed classical.
- **`R-SHIELD-KEY-ROTATION`** (low, advisory): active Shield tenant secrets not
  rotated in over 365 days. Shield assets now carry `lastRotatedAt`.
- **Sources:** Salesforce "Cryptographic Agility" PQC white paper (2026-03-18)
  and the NIS Cooperation Group's EU PQC implementation roadmap (2025-06).

### Changed

- TLS probe findings explain that probes run from the scanning machine, not
  from Salesforce, and cite the new sources.
- CI runs only cheap checks that need no Salesforce org, browser, or secrets.
  The advisory Playwright job was removed (run `npm run test:e2e` locally); a
  check that the committed generated rule/regulation tables are fresh was
  added, plus a job timeout and cancellation of superseded runs.

## [0.1.0] — 2026-08-13

First versioned release: the production-readiness wave. Findings and
verification detail live in
[docs/PRODUCTION_READINESS_REVIEW.md](./docs/PRODUCTION_READINESS_REVIEW.md).

### Added

- **Coverage model.** Every scan category (and the TLS probe) now records an
  explicit status — `scanned` / `partial` / `failed` / `skipped` — in
  `report.coverage`, surfaced in the PDF, CBOM, VEX, CSV, and JSON. Failed
  categories can no longer masquerade as "clean". The CLI exits `3` on partial
  coverage unless `--allow-partial` is passed.
- **CLI exit codes** documented and enforced: `0` success, `2` usage error,
  `3` partial scan, `10` authentication failure, `20` scan aborted/no output
  written. Unknown flags and missing values are now rejected instead of
  silently ignored.
- **Apache-2.0 licensing:** `LICENSE` (Apache License 2.0, Open Systems
  Foundation) and `NOTICE`.
- **CI** (GitHub Actions): typecheck for the web/engine and CLI projects
  (`tsconfig.cli.json` is new), unit tests, production build, and a
  package.json ↔ `src/lib/version.ts` version-consistency gate; Playwright
  e2e runs as an advisory job until stable.
- **Security headers** for Cloudflare Pages (`public/_headers`): CSP with
  `connect-src` restricted to Salesforce-owned domains, `frame-ancestors
  'none'`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`.
  The `/security` page now describes the deployed policy verbatim.
- **Self-hosted fonts** (Inter Tight, JetBrains Mono, Source Serif 4 as
  latin/latin-ext woff2 under `public/fonts/`) — a page load makes zero
  third-party requests.
- `generator` metadata ({name, version, mode: cli|browser}) stamped into
  reports from the single version source `src/lib/version.ts`.

### Changed

- **Browser OAuth** switched from the deprecated implicit grant to
  authorization code + PKCE, matching the External Client App setup the wizard
  instructs users to create. Scopes reduced to `api` + `id` (`refresh_token`
  dropped); callback URLs are scrubbed of sensitive parameters.
- **Scanners no longer fabricate crypto facts.** Connected Apps and External
  Client Apps are inventoried without invented key sizes; SSO derives only
  from the SAML `RequestSignatureMethod` plus auth-provider inventory; Shield
  Platform Encryption records an explicit skip note when not licensed;
  session settings joined the scan surface.
- **Region and overlay semantics.** `--region` scopes regulatory framing
  without dropping universally applicable baseline rules; rules declare
  overlay mappings and findings carry `overlayIds`, so `--overlay` scopes the
  regulatory appendix rather than being a no-op.
- **Artifacts are schema-valid.** CBOM conforms to CycloneDX 1.6 (closed
  `assetType`/`primitive` enums, no non-spec fields); OpenVEX statements no
  longer carry `justification`/`impact_statement` on non-`not_affected`
  statuses.
- **Apex analysis** strips comments before matching (no more flagged
  commented-out code) and catches more weak crypto: `Crypto.sign('RSA')`
  (RSA-SHA1 alias), HMAC-MD5/HMAC-SHA1 MACs, AES-192.
- Network failures are now typed (`NetworkError`, `SalesforceApiError`);
  CORS is only ever diagnosed in browsers, so CLI users no longer get CORS
  advice for DNS/offline errors.
- `tsx` moved from devDependencies to dependencies (the `qshield` bin needs it
  at runtime); `engines` requires Node ≥ 22.12; package version aligned with
  `QSHIELD_VERSION` (0.1.0).
- Documentation reconciled with the implementation (README scan-surface table,
  ARCHITECTURE feature claims/threat model, install-guide OAuth scopes and
  propagation notes, repository links to `OpenSystemsFoundation/quantum-shield`).

### Fixed

- CLI scans failed on Salesforce CLI 2.x, which redacts the access token in
  `sf org display` — added the `sf org auth show-access-token` fallback.
- Tooling API queries now paginate (`nextRecordsUrl`), so orgs with more than
  one page of Apex classes are fully scanned.
- CSV exports escape leading `=`, `+`, `-`, `@` (formula injection via
  attacker-influenceable org metadata).
- PDF rendering no longer crashes on non-Latin org/asset names (Unicode-safe
  text rendering instead of WinAnsi-only fonts).

### Removed

- `jsforce` dependency (unused at runtime; its advisory chain included a
  critical `websocket-driver` finding).
- Google Fonts CDN links (replaced by self-hosted fonts).
- `/dev/pdf-preview` from production builds (still available in `astro dev`).

### Security

- `npm audit` reduced from 16 advisories (10 high) to 5 (1 low, 2 moderate,
  2 high); the remainder are dev-toolchain findings whose fixes require the
  Astro 7 major upgrade, tracked in AGENTS.md.
