# Changelog

All notable changes to QuantumShield are documented here. The format is based
on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
