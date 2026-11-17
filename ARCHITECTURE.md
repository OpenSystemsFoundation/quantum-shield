# QuantumShield — Architecture

A post-quantum readiness scanner for Salesforce organizations. Ships as **two front-ends sharing one scan engine**:

1. **Local Node CLI (`qshield`)**. Recommended path for day-to-day use. Reuses the Salesforce CLI's own authenticated session on macOS, Windows, and Linux — no Connected App, no CORS, no QuantumShield auth infrastructure in the path.
2. **Static browser app** (Astro + Svelte, zero backend). Optional UI for demos, in-browser scans, and report review. Uses an External Client App or Connected App the user owns; the browser queries their org directly.

Both consume the same scanners, rule catalog, CycloneDX CBOM builder, OpenVEX builder, and PDF renderer, all of which live under `src/lib/` and are pure TypeScript with no browser- or Node-specific globals.

---

## Core decisions

- **External website, not a Salesforce-distributed app.** Skips AppExchange Security Review and managed-package release cycle. Trust and discovery become our job, not Salesforce's.
- **Zero infrastructure beyond Cloudflare Pages.** No Workers, no KV, no D1, no R2, no proxy. Static assets only.
- **CLI first for operational scans.** The local terminal flow is the default recommendation. The browser app stays available for demos, in-tab review, and teams that prefer to own the OAuth app themselves.
- **All scan traffic goes directly client runtime → the user's org.** In browser mode that means browser → org. In CLI mode that means local Node process → org. No middle layer, no org data touching our infrastructure.
- **No shared QuantumShield Connected App.** Browser mode uses an External Client App or Connected App the user creates in their own org. CLI mode reuses the local `sf` session already on the machine.
- **CORS whitelist is browser-only.** Customers add our domain to their org's CORS allowlist for the web flow once. The CLI bypasses this entirely.
- **Direct onboarding, not account-driven onboarding.** No QuantumShield account, no email capture, no backend tenant model. Landing page points first to the CLI, with browser setup as an explicit secondary path.
- **Direct-to-government-source rules, not a third-party maturity framework.** We build our own rules engine mapped to the canonical documents rather than inheriting QRAMM or similar. Auditor-credible language; no dependency on a small nonprofit's roadmap.
- **Svelte + Astro, not React.** Matches the Open Systems Foundation web stack, smaller bundle, aligns with the static-first philosophy. PDF generation via pure TypeScript library, not a framework-specific renderer.
- **Read-only scanning.** We never modify any Salesforce configuration. Customer data never leaves the local execution environment.

---

## Tech stack

- **Hosting:** Cloudflare Pages (static). Custom domain via Cloudflare DNS.
- **Framework:** Astro for routing and page shell. Svelte islands for interactive surfaces (connect modal, scan progress, findings viewer, report preview).
- **Styling:** CSS-first Astro/Svelte styling governed by `DESIGN.md`.
- **Content:** Astro content collections (MDX/Markdown) for docs, install guide, and regulatory source files. Each regulation or standards source lives in its own Markdown file under `src/content/regulations/`; structured frontmatter is the canonical source for citation and overlay metadata, and a build-time sync step generates the runtime manifest the app imports.
- **Browser Salesforce integration:** Static-site OAuth helpers plus a fetch-based REST and Tooling client that runs inside the browser and the Web Worker. No backend token broker.
- **CLI auth bridge:** `cli/auth/sfCli.ts` shells out to `sf org display` / `sf org list`, normalizes the result into the shared `Session` type, then hands off to the same scan engine the browser uses.
- **Scan engine:** Web Worker via Comlink. Main thread stays responsive during large-org scans.
- **State:** Svelte stores for UI; scan engine state passed back through Comlink.
- **Local persistence:** IndexedDB via the `idb` library for scan history and draft reports, scoped per org. sessionStorage for the OAuth access token only (dies on tab close, intentional).
- **PDF generation:** `pdf-lib`. Pure TypeScript, framework-agnostic, isolated to `src/lib/pdf/`.
- **Rules engine:** A versioned collection of Markdown source files with structured frontmatter under `src/content/regulations/` and `src/content/rules/`, synced into generated TypeScript tables at build time.
- **Fonts:** self-hosted woff2 subsets under `public/fonts/` — no third-party font CDN requests.
- **Testing:** Vitest for unit tests (rules engine, parsers, scoring, PDF, CLI bridge); Playwright for browser preview and interaction flows; scratch-org smoke tests and fixture capture under `salesforce/`.
- **Analytics:** none. The site ships no analytics, no tracking scripts, and no third-party requests of any kind.
- **Build & deploy:** GitHub → Cloudflare Pages auto-build. Preview deployments per pull request. Security headers (CSP and friends) ship via `public/_headers`.

---

## Site structure

- `/` — Landing. CLI-first positioning, browser setup entrypoint, sample report, trust strip.
- `/connect` — Browser-mode setup wizard: environment picker, callback URL helper, Consumer Key paste, then launch OAuth flow.
- `/callback` — Browser OAuth redirect target. Consumes the returned token payload and hands off to the app shell.
- `/app` — Authenticated shell. Shows connected org identity, scan CTA, history of prior scans (from IndexedDB).
- `/app/scan` — Live scan view with progress per category, keyed by `?id=`.
- `/app/report` — Findings viewer, filters, remediation detail, export to PDF, keyed by `?id=`.
- `/install` — CLI quickstart plus browser-mode setup and CORS guide.
- `/docs/regulations/*` — Indexed regulation and standards source pages. One document per regulation/source with machine-readable frontmatter used to generate the app's citation and overlay manifest.
- `/docs/rules/*` — Indexed rule catalog pages generated from the same content pipeline. (A broader methodology/FAQ docs area is planned, not implemented.)
- `/privacy` and `/terms` — Legally required, explicit about the zero-data-transmission architecture.
- `/security` — Trust page. CLI-vs-browser trust model, browser OAuth scopes, CSP, and what the scanner does and does not touch.
- `/dev/*` — Development-only previews (e.g. `/dev/pdf-preview`); served by `astro dev` but stripped from production builds by a build hook in `astro.config.mjs`.

---

## Browser authentication flow

1. User enters the org's My Domain on `/connect` (`*.my.salesforce.com`, including `.sandbox.` and `.scratch.` hosts; Lightning and Setup URLs are normalised to it). The generic `login.salesforce.com` / `test.salesforce.com` hosts are refused: they never return CORS headers, so a browser-only PKCE token exchange cannot complete there. Verified against a live scratch org on 2026-11-17.
2. User creates an External Client App or Connected App in their own org (PKCE required, secret not required for the web server flow), adds this site's origin to Setup → CORS **and ticks "Enable CORS for OAuth endpoints"**, then pastes the Consumer Key into the setup wizard. Before redirecting, the wizard probes the org's token endpoint unauthenticated to confirm CORS is in place. The setup steps live in `src/lib/auth/setupSteps.ts` and render on both `/connect` and `/install`. The client ID can also be preconfigured via environment variable for local development.
3. The app generates a PKCE code verifier and a short-lived `state` token, then redirects to Salesforce `/services/oauth2/authorize` with `response_type=code`, the user-owned `client_id`, `redirect_uri=https://our-domain/callback`, the requested scopes, and the S256 `code_challenge` (**authorization code + PKCE** — no implicit grant; External Client Apps require PKCE and offer no implicit flow).
4. User authenticates in Salesforce's own UI and approves the requested scopes.
5. Salesforce redirects to `/callback` with an authorization code and state. The browser validates state, exchanges the code (plus the PKCE verifier) at the My Domain's `/services/oauth2/token` directly from the browser, refuses any `instance_url`/`id` outside `https://*.salesforce.com`, reads identity from the My Domain (`<instance_url>/id/<org>/<user>`, best effort, because the `id` URL's login host has no CORS) and the org name from `Organization`, and stores the `Session` locally.
6. The browser stores the active session in `sessionStorage`; the remembered environment and optional client ID live in `localStorage`.
7. On tab close the browser session ends. Re-auth is one click. For teams that want no browser OAuth surface at all, the CLI path remains available.

**Scopes requested (browser mode):** `api`, `id`. We do not request `refresh_token` (nothing consumes it — sessions intentionally die with the tab), `full`, or `web`.

**Client ownership:** Browser mode uses an External Client App or Connected App the user owns. QuantumShield does not operate a shared Connected App.

---

## CLI authentication flow

1. Admin runs `sf org login web --alias prod-eu` (or equivalent) once in the local terminal.
2. `qshield` invokes `sf org display --json --verbose` and `sf org list --json` to lift the local Salesforce CLI session into the shared `Session` type.
3. From there the same `runScan()` engine under `src/lib/scan/engine.ts` runs unmodified.
4. No Connected App, no callback URL, no CORS allowlist, and no browser are required.

---

## CORS handling

Salesforce requires each org to explicitly whitelist our domain in Setup → CORS before the browser can make cross-origin API calls to their instance. This applies to browser mode only; the CLI path bypasses it entirely.

Strategy:

- Do not block browser setup on CORS. Let sign-in succeed.
- On the first API call, detect CORS failure via the specific error signature (browser builds only — in Node, transport failures surface as `NetworkError`, never as a CORS diagnosis).
- Show an inline panel (not a blocking modal) titled "One-time setup required," with numbered steps and a copy-paste-friendly domain field.
- Provide a "Test again" button that retries the same call. Admin adds the entry, clicks test, scan proceeds.
- Document in `/install` that this is a per-org, one-time browser-mode task. Subsequent users in the same org never see the panel.

---

## What we scan

All read-only. All queries are scoped to metadata and configuration; we never read record data, field values, attachments, or file bodies. A hard rule of the engine: **scanners never fabricate crypto facts.** If the Salesforce API does not expose a key size or algorithm, the asset is inventoried without one and no rule that needs it fires.

**Certificates and keys**
- Source: `Certificate` via the Tooling API.
- Crypto elements: RSA key size (`KeySize` as reported by the API), expiration.
- Risk: quantum-vulnerable asymmetric keys; undersized RSA.

**Connected Apps and External Client Apps**
- Source: `ConnectedApplication` and `ExternalClientApplication` via the Tooling API.
- Crypto elements: **none — inventory only.** The API exposes no OAuth signing-key configuration, so no JWT key-size or algorithm claims are made; reports direct admins to review JWT certificates manually in Setup.
- Risk: surfaced as inventory for manual review, not as findings with invented parameters.

**Named Credentials and External Credentials**
- Source: `NamedCredential`, `ExternalCredential` via the REST API.
- Crypto elements: endpoint URL, configured authentication protocol as reported.
- Risk: plaintext HTTP endpoints; weak authentication protocols where the API states them.

**Remote Site Settings**
- Source: `RemoteSiteSetting` via the Tooling API (active sites only).
- Crypto elements: endpoint URLs, whether TLS is enforced.
- Risk: plaintext HTTP endpoints. Remote-side TLS quality is only assessed by the CLI's explicit `--probe-tls` handshake, never inferred.

**Single Sign-On (SAML and Auth Providers)**
- Source: `SamlSsoConfig` and `AuthProvider` via the REST API (they are standard objects, not Tooling objects).
- Crypto elements: SAML request-signature method (`RSA-SHA1` vs `RSA-SHA256`); auth providers inventoried by provider type. IdP certificate key sizes are not exposed by the API and are not guessed.
- Risk: SHA-1 request signing; legacy providers surfaced for review.

**Shield Platform Encryption**
- Source: `TenantSecret` via the REST API.
- Crypto elements: tenant secret type, BYOK/EKM vs Salesforce-derived key material, rotation history. Data-encryption keys derived from tenant secrets are AES-256 per platform documentation.
- Risk: missing BYOK, stale rotation extending HNDL exposure. Orgs without Shield licensed record the category as `skipped` with an explicit reason.

**Apex code (pattern analysis)**
- Source: `ApexClass` bodies via the Tooling API (unmanaged classes), analyzed with regex patterns after comment stripping (line numbers preserved; commented-out code never matches).
- Crypto elements: `Crypto.generateDigest` with MD5/SHA-1; `Crypto.sign`/`signWithCertificate` including the `'RSA'` → RSA-SHA1 alias; `Crypto.generateMac` with HMAC-MD5/HMAC-SHA1; `Crypto.encrypt`/`decrypt`(`WithManagedIV`) with AES-128/AES-192; hardcoded AES key literals passed to `Crypto.encrypt`/`decrypt`.
- Risk: legacy digests and MACs, weak AES, RSA-SHA1 signing, hardcoded keys. Pattern-based analysis has known false-negative modes (string-built algorithm names); this is documented, not hidden.

**Session settings**
- Source: `SessionSettings` via the Tooling API.
- Crypto elements: session timeout configuration.
- Risk: long session lifetimes.

**Managed packages**
- Source: `InstalledSubscriberPackage` via the Tooling API.
- Crypto elements: none directly — inventory for supply-chain visibility.
- Risk: third-party crypto we can't inspect.

**TLS endpoints (CLI only, `--probe-tls`)**
- Source: live `node:tls` handshakes against HTTPS endpoints referenced by Named Credentials and Remote Sites.
- Crypto elements: negotiated TLS version, cipher, key-exchange group.
- Risk: TLS 1.2 (HNDL-exposed); TLS 1.3 without a hybrid PQC KEM. The hybrid verdict is only asserted when the local OpenSSL (≥ 3.5) could itself have negotiated a hybrid group — otherwise it is recorded as unknown rather than as a false negative.

### Coverage model

Every category (plus the TLS probe pass) ends a scan with an explicit status recorded in `report.coverage` and carried into all five artifacts:

- `scanned` — every query for the category completed.
- `partial` — some data was collected but at least one sub-query failed; results are incomplete.
- `failed` — the category could not be scanned at all.
- `skipped` — the underlying feature is not available in the org (e.g. Shield not licensed), with the reason stated.

Consumers must treat anything other than `scanned` as *unverified*: zero findings in a `failed` category does not mean clean. This exists precisely so "we couldn't check" can never render as "you're fine." The CLI exits `3` on partial coverage unless `--allow-partial` is passed.

### Overlay mapping

Rules declare which regulatory overlays (NIS 2, DORA, PCI DSS 4, HIPAA, …) they map to, and every finding carries the union of its rules' overlay IDs regardless of scan options. Enabling overlays (`--overlay`, or the browser toggles) only scopes the report's **regulatory appendix** — it never changes which rules fire or which findings appear. Region selection (`--region`) similarly scopes regulatory framing to the cited jurisdictions without dropping universally applicable baseline rules.

---

## Threat model (CLI vs browser)

**CLI mode.** Trust boundary is the admin's machine. The scanner inherits the `sf` CLI's stored session — QuantumShield adds no credentials, no network listener, and no telemetry. Threats considered: malicious org metadata flowing into artifacts (CSV formula injection is escaped; PDF text is rendered with a Unicode-capable font, not executed), and the TLS probe touching third-party endpoints (it performs handshakes only, with certificate validation on, and never sends the org token to probed hosts). The org token never leaves the machine except toward the org itself.

**Browser mode.** Trust boundary is the browser tab plus the static host. The access token lives in `sessionStorage` (XSS-readable by design trade-off, dies with the tab; no `refresh_token` scope is requested so there is no long-lived credential to steal). Defenses: a strict CSP served via `public/_headers` whose `connect-src` is limited to Salesforce-owned domains — exfiltration targets are constrained even under script injection — plus `frame-ancestors 'none'`, self-hosted fonts, and no third-party scripts. OAuth uses authorization code + PKCE with `state` validation; the callback scrubs sensitive parameters from the URL. The static host (Cloudflare Pages) sees page requests only — never org data or tokens.

---

## Authoritative sources

Every finding in the report cites at least one primary source below. The rules engine has one JSON file per source; a finding may reference multiple.

**United States — primary**

- **NIST IR 8547 — Transition to Post-Quantum Cryptography Standards.** Deprecation and disallowed dates per algorithm. This is the canonical US transition timeline. Everything with a "deprecated after YYYY" or "disallowed after YYYY" finding traces here.
- **NIST SP 800-131A Rev 3 — Transitioning the Use of Cryptographic Algorithms and Key Lengths.** Already-live transitions. SHA-1 disallowed, 1024-bit RSA disallowed, legacy modes retired. Catches compliance gaps that exist today, independent of PQC.
- **NIST SP 800-57 Part 1 — Recommendation for Key Management.** Key length recommendations, crypto period guidance. Used for key-rotation findings.
- **NIST FIPS 203 (ML-KEM), FIPS 204 (ML-DSA), FIPS 205 (SLH-DSA).** The approved replacements. Cited in every migration recommendation.
- **NSA CNSA 2.0 — Commercial National Security Algorithm Suite 2.0.** Binding deadlines for US federal and defense. Pre-2027 prepare, 2027 start deploying PQC, 2030 deprecate classical, 2033 prohibit. Cited whenever a report needs federal-grade language.

**Europe — secondary, enabled per org**

- **BSI TR-02102 (Germany).** Most concrete European crypto technical guideline. Minimum key sizes, approved algorithms, PQC guidance. Needed for organisations in the DACH region.
- **UK NCSC — Preparing for Quantum-Safe Cryptography.** Lighter but authoritative for UK government-adjacent buyers.
- **ANSSI (France) — Post-Quantum Cryptography Transition Notes.** For French regulated sectors.

**Vertical overlays — enabled when relevant**

- **PCI DSS 4.0 — requirements 3.5, 3.6, 3.7** on cryptographic key management and strong cryptography. For payments-adjacent Salesforce orgs.
- **HIPAA Security Rule — 45 CFR §164.312(a)(2)(iv), §164.312(e)(2)(ii)** on encryption of PHI. For healthcare.
- **CMMC 2.0 Level 2 and Level 3 — SC.L2-3.13.11, SC.L2-3.13.8** on cryptography. For DoD supply chain.
- **SWIFT Customer Security Programme.** For banking customers using Salesforce for treasury-adjacent workflows.

Sources are revisioned quarterly. Each source file in `src/content/regulations/` records its document version, review date, retrieval URL, implementation status, and requirement anchors in frontmatter. The generated manifest is rebuilt from those documents before development, checks, builds, and tests.

---

## Migration paths

Each finding includes the specific replacement algorithm and its source document. Summary of the mapping:

- **RSA (any key size) signing** → **ML-DSA (FIPS 204)** for general-purpose signatures; **SLH-DSA (FIPS 205)** when stateless hash-based assurance is preferred. CNSA 2.0 deprecates classical signatures after 2030, prohibits after 2033.
- **RSA key transport / ECDH key exchange** → **ML-KEM (FIPS 203)**. HQC added in 2025 as a second-source KEM; still in draft standardization as of the current cutoff. Same CNSA 2.0 timeline.
- **ECDSA signing** → **ML-DSA** or **SLH-DSA**. Same timeline.
- **AES-128** → **AES-256**. Grover's algorithm reduces symmetric security by half in theory; AES-256 retains 128-bit security margin post-quantum. Recommended now, no hard deadline.
- **SHA-1** → **SHA-256 or SHA-3**. Already disallowed under SP 800-131A Rev 3. Finding is "existing non-compliance," not "future risk."
- **MD5** → **SHA-256 or SHA-3**. Same category.
- **3DES** → **AES-256**. Already prohibited.
- **Hardcoded keys (any algorithm)** → **Named Credentials + platform-managed secrets**. Not a PQC finding per se; included because the scanner encounters it during Apex analysis.

For each finding, the report includes: current algorithm and parameters, recommended replacement, citation to the authoritative source, and one of three migration postures — **replace now** (already non-compliant), **plan for 2030** (CNSA 2.0 deprecate), **prepare for 2033** (CNSA 2.0 prohibit).

Hybrid deployments (classical + PQC in parallel) are called out in the recommendation where NIST guidance explicitly endorses them as the transition strategy.

---

## Scoring and severity

No proprietary 0–100 score. Each finding carries:

- **Regulatory status:** Already non-compliant / Deprecated by date / Disallowed by date / Advisory.
- **Severity:** Critical / High / Medium / Low, derived deterministically from (regulatory status × data sensitivity × exposure). The derivation rule is documented and open.
- **Harvest-Now-Decrypt-Later exposure:** Flagged separately for any asset carrying data with long confidentiality requirements, because the attack can be occurring today even if the decryption is years away.
- **Effort estimate:** Low / Medium / High. Editable by the customer; the default is heuristic (cert rotation is Low, SSO provider change is High).

The report sorts findings by regulatory deadline, not by severity, because CISOs plan by date.

---

## Report output

Generated entirely client-side by the PDF module. Produces:

- **Executive summary** (1–2 pages). Org identity, scan date, total findings by category, earliest regulatory deadline the org faces, posture in one sentence.
- **Findings register** (variable). Every finding with asset, current crypto, replacement, citation, migration posture, effort.
- **Regulatory appendix.** For each enabled overlay (PCI, HIPAA, CMMC, etc.), the findings that map to each requirement via rule-declared overlay IDs.
- **Coverage section.** Per-category scan status (`scanned` / `partial` / `failed` / `skipped`) with reasons, so partial scans are visibly partial in the auditor-facing artifact.
- **Methodology** (1 page). What was scanned, what was not, how severity is computed, source document versions.
- **Cryptographic Bill of Materials (CBOM).** Machine-readable appendix listing every cryptographic asset found, as a schema-valid CycloneDX v1.6 BOM: `assetType` drawn from the spec's closed enum, `cryptoProperties` populated where known (`primitive`, `oid`, `nistQuantumSecurityLevel`, `executionEnvironment`), so customers can feed it into Dependency-Track, ServiceNow, or any CycloneDX-aware GRC tooling. Fields the spec does not define (e.g. a bare `quantumSafe` boolean) are not emitted.
- **OpenVEX document.** Spec-conformant OpenVEX v0.2.0: one statement per finding (`affected` / `under_investigation`) with the remediation in `action_statement` and rationale/HNDL context in `status_notes`. `justification` and `impact_statement` are never emitted (they are only valid on `not_affected` statements, which the scanner does not produce). Consumable by Grype / Trivy / Dependency-Track without parsing the PDF.

Export options: PDF (primary), CBOM JSON (CycloneDX 1.6), OpenVEX JSON, findings CSV, raw report JSON. The web app streams these directly from the browser to the user's disk; the CLI writes them all to `./qshield-out/`. Neither path uploads anywhere.

---

## Local CLI (`qshield`)

The CLI exists specifically so admins can run a scan without the customer org having to set up a Connected App, custom domain, CORS whitelist entry, or any of our cloud infrastructure. It reuses the session the admin already authorised with `sf org login`.

**Boot path:**

1. Admin runs `sf org login web --alias prod-eu` (one-time, per org).
2. `npm run qshield -- scan --target-org prod-eu` (or a globally-installed `qshield scan -o prod-eu`).
3. The CLI shells out to `sf org display --json --verbose --target-org <alias>` to lift the access token + instance URL into an in-memory `Session` compatible with the browser's type.
4. From there, the same `runScan()` from `src/lib/scan/engine.ts` runs unmodified. No Connected App, no CORS, no OAuth callback, no browser.

**CLI-only additions:**

- `NodeTlsProbe` (`cli/probe/tls.ts`) — a `node:tls`-backed probe that performs a live handshake with every HTTPS endpoint referenced by a `NamedCredential` or `RemoteSiteSetting`, records the negotiated TLS version, cipher suite, and ephemeral key-exchange group, and flags TLS 1.2 (HNDL-exposed) plus TLS 1.3 without a hybrid PQC KEM (X25519MLKEM768 and friends). Enabled via `--probe-tls`.
- File-system writers (`cli/output/writers.ts`) that hand raw bytes from `renderReportPdf()`, `buildCbomJson()`, `buildVexJson()`, `buildFindingsCsv()` directly to disk.
- `--region US,EU,NL,...` — filters the rule catalog to only fire rules that cite the listed jurisdictions (or INTL), so Dutch customers see Dutch/EU guidance and US customers see CNSA 2.0 framing.
- `--overlay nis2,dora,pci-dss-4,...` — same overlay system the web app exposes via the `OverlayScope` type.

**Tech choices:**

- TypeScript. Shares types with the browser scan engine verbatim — the CLI imports from `src/lib/` directly.
- `tsx` as the runtime, so we ship no separate compile step for v1. The bin shim (`bin/qshield.mjs`) uses `tsx`'s `tsImport` API to execute `cli/index.ts`. `npm install` in the repo is the only prerequisite.
- No external argv parser. `cli/args.ts` is ~60 lines of string-crunching.
- No external Salesforce SDK for the CLI either — `src/lib/scan/sfClient.ts` was already plain `fetch` + `Authorization: Bearer`, portable to Node 18+ as-is.

**Out of scope for the CLI:**

- No Rust/Python rewrite; the web and CLI share one TypeScript engine. If we ever ship a single-binary build, that'll be a `bun build --compile` or `tsup` step on top of `cli/`, not a language change.
- No bundled Connected App config. We deliberately never touched that surface — `sf` already handles it.

---

## Privacy and data handling

- No customer data ever leaves the local execution environment. In browser mode data stays in the tab and local browser storage. In CLI mode data stays in the local Node process and the files written to disk.
- Browser-mode OAuth access tokens are stored in sessionStorage and discarded on tab close.
- Browser scan results live in IndexedDB on the user's device, scoped per org identity, and can be cleared from the app overview. CLI runs write artifacts to `./qshield-out/`.
- Our server logs contain only static-asset requests (Cloudflare Pages standard). There is no analytics of any kind, and fonts are self-hosted — a page load makes zero third-party requests.
- In browser mode, Content Security Policy restricts `connect-src` to the Salesforce OAuth endpoints and the customer's instance URL. In CLI mode, outbound requests go directly to the customer's Salesforce instance, plus explicit TLS probe targets when `--probe-tls` is enabled.
- Source is published on GitHub (`OpenSystemsFoundation/quantum-shield`); public pages link to the repository. (Publishing the deployed commit SHA on the security page is planned, not implemented.)

---

## Out of scope

- We do not migrate, rotate, or modify cryptographic configuration. Read-only always.
- We do not scan non-Salesforce infrastructure, third-party apps, or on-premise systems.
- We do not scan data content — field values, attachments, file bodies — only metadata and configuration.
- We do not inspect Salesforce-platform-managed cryptography the customer cannot control (TLS termination at Salesforce's edge, internal HSM key derivation).
- We do not provide legal or regulatory compliance attestation. We provide evidence and mapping; attestation requires a human auditor.
- We do not guarantee exhaustive detection of hardcoded secrets. Pattern-based heuristics have false negatives.
- We do not support Salesforce Classic-only orgs. Lightning Experience is a prerequisite.
- We do not currently aggregate across multiple orgs. Each session scans one org. Multi-org dashboards are out of scope for v1.
- We do not provide real-time continuous monitoring. Scans are point-in-time and initiated by the user.

---

## Open questions

- Primary customer profile — US federal (CNSA 2.0 first), US commercial (NIST + vertical overlays), or EU enterprise (BSI first). Decision drives which source files ship in v1.
- Whether browser mode should remain a first-class scan path or settle into a lighter-weight demo and report-review surface beside the CLI.
- Whether to ever add privacy-preserving analytics. The current answer is no — the site ships fully blind with zero third-party requests, and any change would be a documented product decision.
- Whether to save a scan summary back into the customer's org as a custom object, giving them scan history inside Salesforce without us storing anything. Attractive but requires write scope and a managed-package-style object, which complicates the "pure external app" positioning.
