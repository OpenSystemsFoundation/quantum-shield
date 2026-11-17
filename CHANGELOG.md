# Changelog

All notable changes to QuantumShield are documented here. The format is based
on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Project

- **Open-source repository essentials**: `SECURITY.md` with a private
  disclosure process, `CONTRIBUTING.md`, a Code of Conduct (Contributor
  Covenant 2.1), issue forms and a pull request template.
- **Supply chain**: CI produces a CycloneDX SBOM; CodeQL and OpenSSF Scorecard
  run on `main`; Dependabot updates npm packages and GitHub Actions (pinned by
  commit SHA); tagged releases publish the built site, source and SBOM with
  signed build-provenance attestations.
- The build's CSP inline-script hashing now recognises end tags with
  attributes or whitespace (`</script >`), and blanks out scripts, styles and
  comments before checking for inline event handlers (CodeQL findings).
- Internal review notes and local tool settings removed from the repository;
  `ARCHITECTURE.md`, `AGENTS.md` and the `/security` page updated for the
  current app (Cloudflare Workers hosting, My Domain sign-in, OAuth CORS
  setting, accurate `connect-src`).

### Fixed — browser sign-in (verified end to end against a live scratch org)

- **Sign-in could never complete in the browser.** Two blockers found on the
  first real round-trip: the token endpoint needs the org setting "Enable CORS
  for OAuth endpoints" (never mentioned in setup, and off in the seed org),
  and the identity lookup went to login/test.salesforce.com, which never
  answer CORS. Identity is now read from the org's My Domain (best effort),
  and the setup steps cover the OAuth CORS setting.
- **`/connect` redesigned around My Domain.** The Production/Sandbox options
  pointed at login/test.salesforce.com, where a browser token exchange cannot
  work; the wizard now takes the org's My Domain (Lightning and Setup URLs are
  normalised), shows a single setup checklist shared with `/install`, checks
  the org's CORS settings before redirecting, and explains token errors
  (`invalid_client`, `invalid_client_id`, `redirect_uri_mismatch`, blocked
  users) in plain language. The forced `prompt=login consent` is gone.
- **Token hardening.** `instance_url` and the identity URL must be
  `https://*.salesforce.com` before the bearer token is sent; pending sign-ins
  expire after 10 minutes; Salesforce error text on `/callback` is shown only
  for a sign-in this tab started.
- Query pagination requested `/services/data/vNN/services/data/vNN/...` for
  the second page (`nextRecordsUrl` is instance-relative).
- The app header shows the org name and environment (sandbox/scratch) instead
  of the org id.
- Seed scratch-org metadata now enables OAuth CORS, allows the production
  origin, and lists the production callback URL.

### Security

- **No Cloudflare build variables needed.** Public build values
  (`PUBLIC_SF_API_VERSION`, `PUBLIC_APP_ORIGIN`) live in a committed
  `.env.production`.
- **Build Node version pinned in the repo.** `.node-version` (22.23.4) drives
  both Cloudflare Workers Builds and GitHub CI, so production and preview
  builds cannot drift. A `NODE_VERSION` build variable would override it, so
  none is set.
- **Astro 7 upgrade** (astro 7.4, @astrojs/svelte 9.1, @astrojs/mdx 8.1, vitest
  latest; the Cloudflare build now runs a Node version Astro 7.4 accepts).
  `npm audit --omit=dev` is down from 1 critical and several high to 1 low
  (esbuild's Windows dev server, pulled in by `tsx`; not part of the site).

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

### Fixed — scan engine and rule accuracy

Findings and severities change with this release; re-scan rather than
comparing against older reports.

- **`--region` no longer drops findings.** Region selection used to remove
  whole rules (a UK-scoped scan of the test org returned 10 findings instead
  of 18). Every rule now runs for every region; regions only order and scope
  the citations on each finding. CLI help, the browser region card, README and
  ARCHITECTURE say so.
- **"Not available" is no longer reported as "scanned, 0 assets".** Salesforce
  answers `INVALID_TYPE` both when an object does not exist at the session's
  API version and when the user may not see it. Scanners now record such
  objects as *not available or not permitted* (`skipped` when nothing in the
  category was readable, `partial` otherwise).
  - External Client Apps were invisible to browser scans: at API v66 the
    Tooling API does not expose `ExternalClientApplication` (REST does). It is
    now queried through REST with a Tooling fallback.
  - `ExternalCredential` is queried through the Tooling API (the REST query
    always failed and was ignored).
  - A missing `TenantSecret` no longer claims "Shield is not enabled"; the
    user may simply lack *Manage Encryption Keys*.
- **TLS probe (`--probe-tls`)**
  - Hybrid-KEM detection was wrong on OpenSSL ≥ 3.5, which reports no group
    name for ML-KEM hybrids: endpoints that negotiated X25519MLKEM768 were
    reported as "no hybrid". Support is now decided by a second handshake that
    offers only a hybrid group.
  - Certificates are no longer verified during the probe, so endpoints behind
    a private CA are inspected instead of reported unreachable; an untrusted
    chain is noted on the asset.
  - TLS 1.0/1.1 endpoints can be reached (OpenSSL security level lowered for
    the probe only) and are reported by the new **`R-TLS-OBSOLETE`** rule
    (critical).
- **Deadlines and severities corrected against the sources**
  - RSA below 2048 bits and SHA-1 signatures: date is 2013-12-31 (SP 800-131A),
    not 2020 or 2010.
  - A bare SHA-1 digest is high / deprecated (2030), no longer critical. MD5
    stays critical and no longer carries an invented date.
  - RSA ≥ 2048 and ECDSA: rationale now states the NIST IR 8547 schedule
    (deprecated after 2030, disallowed after 2035). The report summary no
    longer cites a "2033 prohibition", which is CNSA 2.0 for US national
    security systems only.
  - AES-128/192 is a low advisory with no deadline, no HNDL flag and no
    PCI/HIPAA/CMMC mapping; it cites CNSA 2.0 only.
  - Session timeout is a low hygiene advisory (it cited NIS 2 and an AC-12
    limit that do not exist). Timeouts are stored in minutes; the enum mapping
    was wrong (`SixtyMinutes` missing, `FifteenMinutes` shown as "0h").
  - Expired certificates are flagged however long ago they expired (those
    expired more than 30 days or less than 24 hours ago matched nothing).
- **Sources:** NIST SP 800-131A now cites Rev. 2, the edition in force (the
  Rev. 3 link was a 404; Rev. 3 is a draft). NIST IR 8547 updated to the final
  report of 27 October 2026.
- **Apex scanning**
  - Triggers are scanned as well as classes.
  - Added `Crypto.signXML`, `verify`, `verifyWithCertificate`, `verifyHMac`
    and `generateAesKey`.
  - A call whose algorithm is a variable is listed as *unresolved* (low)
    instead of being missed; constants are resolved.
  - Hardcoded keys are found as `Blob.valueOf`, `EncodingUtil.base64Decode`
    and `EncodingUtil.convertFromHex` literals, inline or via a variable, for
    AES, HMAC and signing keys.
  - SHA-256+, HMAC-SHA256+ and AES-256 calls are inventoried in the CBOM with
    no finding.
  - `/*/` no longer ends a block comment early.
- **SAML:** RSA request signing produced no finding because the API exposes no
  key size; it is now reported as "RSA with an unknown key size".
- **Shield:** key origin read from the real `TenantSecret.Source` values
  (`HSM`, `UPLOADED`, `REMOTE`); `BYOK` never matched.
- **Duplicate finding removed:** an Apex ECDSA call matched both `R-ECDSA` and
  `R-APEX-CRYPTO`. `R-ECDSA` also no longer matches TLS cipher-suite names.
  `ML-DSA` / `SLH-DSA` are no longer treated as quantum-vulnerable.
- **HNDL flag** is limited to key establishment and encryption. Signing
  certificates, SAML/OIDC signing and Apex signatures are no longer flagged.
- **CBOM:** RSA reports quantum security level 0 at every key size; HTTPS
  endpoints are typed `tls` with the probed version; certificates and
  protocols no longer carry `algorithmProperties` (certificates gain
  `certificateProperties.notValidAfter`); session settings, Connected Apps,
  auth providers and packages are no longer listed as keys or libraries; HMAC
  is a `mac`; quantum safety is `true` / `false` / `unknown`; OIDs added for
  AES-CBC and RSA-SHA384.
- **VEX:** advisory findings are `affected`, not `under_investigation`.
  Categories that were not fully scanned each add an `under_investigation`
  statement, so a failed scan is not an empty document.
- **PDF:** the methodology no longer claims severity is computed from data
  sensitivity and exposure; "Earliest regulatory deadline" (which printed
  dates such as 2010-12-31) is replaced by overdue and next-upcoming lines;
  the summary counts every replace-now finding, not only criticals.
- **CLI:** `qshield scan --help` exits 0; `--api-version` and `--overlay` are
  validated.
- Reports no longer contain a hardcoded `userLicense: "Salesforce"`.

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

First versioned release: the production-readiness wave.

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
