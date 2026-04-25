# QuantumShield — Architecture

A post-quantum readiness scanner for Salesforce organizations. Ships as **two front-ends sharing one scan engine**:

1. **Local Node CLI (`qshield`)**. Recommended path for day-to-day use. Reuses the Salesforce CLI's own authenticated session on macOS, Windows, and Linux — no Connected App, no CORS, no QuantumShield auth infrastructure in the path.
2. **Static browser app** (Astro + Svelte, zero backend). Optional UI for demos, in-browser scans, and report review. Uses an External Client App or Connected App the customer owns; the browser queries their org directly.

Both consume the same scanners, rule catalog, CycloneDX CBOM builder, OpenVEX builder, and PDF renderer, all of which live under `src/lib/` and are pure TypeScript with no browser- or Node-specific globals.

---

## Core decisions

- **External website, not a Salesforce-distributed app.** Skips AppExchange Security Review and managed-package release cycle. Trust and discovery become our job, not Salesforce's.
- **Zero infrastructure beyond Cloudflare Pages.** No Workers, no KV, no D1, no R2, no proxy. Static assets only.
- **CLI first for operational scans.** The local terminal flow is the default recommendation. The browser app stays available for demos, in-tab review, and teams that prefer to own the OAuth app themselves.
- **All scan traffic goes directly client runtime → customer org.** In browser mode that means browser → customer org. In CLI mode that means local Node process → customer org. No middle layer, no org data touching our infrastructure.
- **No shared QuantumShield Connected App.** Browser mode uses an External Client App or Connected App the customer creates in their own org. CLI mode reuses the local `sf` session already on the machine.
- **CORS whitelist is browser-only.** Customers add our domain to their org's CORS allowlist for the web flow once. The CLI bypasses this entirely.
- **Direct onboarding, not account-driven onboarding.** No QuantumShield account, no email capture, no backend tenant model. Landing page points first to the CLI, with browser setup as an explicit secondary path.
- **Direct-to-government-source rules, not a third-party maturity framework.** We build our own rules engine mapped to the canonical documents rather than inheriting QRAMM or similar. Auditor-credible language; no dependency on a small nonprofit's roadmap.
- **Svelte + Astro, not React.** Matches existing Andelas stack, smaller bundle, aligns with the static-first philosophy. PDF generation via pure TypeScript library, not a framework-specific renderer.
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
- **Charts:** Layer Cake (D3-based, Svelte-native).
- **PDF generation:** `pdf-lib`. Pure TypeScript, framework-agnostic, isolated to `src/lib/pdf/`.
- **Rules engine:** A versioned collection of JSON rule files, one per authoritative source, imported at build time.
- **Testing:** Vitest for unit tests (rules engine, parsers, scoring, PDF, CLI bridge); Playwright for browser preview and interaction flows; scratch-org smoke tests and fixture capture under `salesforce/`.
- **Analytics:** Plausible (script-tag, no cookies, GDPR-clean). Optional; single exception to the zero-infra rule, negotiable.
- **Build & deploy:** GitHub → Cloudflare Pages auto-build. Preview deployments per pull request.

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
- `/docs/*` — Framework mappings, scanning methodology, data handling, FAQ.
- `/privacy` and `/terms` — Legally required, explicit about the zero-data-transmission architecture.
- `/security` — Trust page. CLI-vs-browser trust model, browser OAuth scopes, CSP, and what the scanner does and does not touch.

---

## Browser authentication flow

1. User picks environment on `/connect`. Production uses `login.salesforce.com`; Sandbox uses `test.salesforce.com`; Custom Domain takes a `my.salesforce.com` URL.
2. User creates an External Client App or Connected App in their own org and pastes its Consumer Key into the setup wizard. The client ID can also be preconfigured via environment variable for local development.
3. Redirect to Salesforce `/services/oauth2/authorize` with the customer-owned `client_id`, `redirect_uri=https://our-domain/callback`, the requested scopes, and a short-lived `state` token.
4. User authenticates in Salesforce's own UI and approves the requested scopes.
5. Salesforce redirects to `/callback` with token payload and state. The browser validates state, normalizes the returned identity information into a `Session`, and stores it locally.
6. The browser stores the active session in `sessionStorage`; the remembered environment and optional client ID live in `localStorage`.
7. On tab close the browser session ends. Re-auth is one click. For teams that want no browser OAuth surface at all, the CLI path remains available.

**Scopes requested (browser mode):** `api`, `refresh_token`, `id`. We do not request `full` or `web` scopes.

**Client ownership:** Browser mode uses an External Client App or Connected App the customer owns. QuantumShield does not operate a shared Connected App.

---

## CLI authentication flow

1. Admin runs `sf org login web --alias prod-eu` (or equivalent) once in the local terminal.
2. `qshield` invokes `sf org display --json --verbose` and `sf org list --json` to lift the local Salesforce CLI session into the shared `Session` type.
3. From there the same `runScan()` engine under `src/lib/scan/engine.ts` runs unmodified.
4. No Connected App, no callback URL, no CORS allowlist, and no browser are required.

---

## CORS handling

Salesforce requires each customer org to explicitly whitelist our domain in Setup → CORS before the browser can make cross-origin API calls to their instance. This applies to browser mode only; the CLI path bypasses it entirely.

Strategy:

- Do not block browser setup on CORS. Let sign-in succeed.
- On the first API call, detect CORS failure via the specific error signature.
- Show an inline panel (not a blocking modal) titled "One-time setup required." Three numbered steps with screenshots matching current Salesforce Setup UI. Copy-paste-friendly domain field.
- Provide a "Test again" button that retries the same call. Admin adds the entry, clicks test, scan proceeds.
- Document in `/install` that this is a per-org, one-time browser-mode task. Subsequent users in the same org never see the panel.

---

## What we scan

All read-only. All queries are scoped to metadata and configuration; we never read record data, field values, attachments, or file bodies.

**Certificates and keys**
- Source: `Certificate` sObject via REST, `CertificateSettings` via Metadata API.
- Crypto elements: key algorithm (RSA, ECDSA), key size, signature hash, issuer, expiration.
- Risk: all current asymmetric algorithms are quantum-vulnerable.

**Connected Apps**
- Source: `ConnectedApplication` via Tooling API, `ConnectedApp` metadata.
- Crypto elements: OAuth grant types, JWT signing keys and algorithms, certificate references for SAML consumers.
- Risk: RSA/ECDSA JWT signing; legacy OAuth flows; short key sizes.

**Named Credentials and External Credentials**
- Source: `NamedCredential`, `ExternalCredential` via Metadata API and REST.
- Crypto elements: authentication protocol, client certificate reference, endpoint URL (TLS version of remote side inferred by probing, not scanned directly).
- Risk: weak auth protocols, RSA client certs, HTTP (non-TLS) endpoints.

**Remote Site Settings and External Data Sources**
- Source: `RemoteSiteSetting`, `ExternalDataSource` via Metadata API.
- Crypto elements: endpoint URLs, whether TLS is enforced.
- Risk: plaintext HTTP endpoints, TLS version of remote side.

**Single Sign-On (SAML and OIDC)**
- Source: `SamlSsoConfig` via Metadata API, auth provider configs.
- Crypto elements: IdP signing certificate, assertion signing algorithm, encryption certificate.
- Risk: SHA-1 signed assertions, RSA-1024 certs, weak XML canonicalization.

**Shield Platform Encryption**
- Source: `EncryptionKeySettings`, `TenantSecret` history via Tooling API (limited), encryption policy via Metadata API.
- Crypto elements: AES key size, tenant secret rotation cadence, BYOK vs Salesforce-managed.
- Risk: AES-128 halves against Grover; long-rotation keys extend HNDL exposure.

**Apex code (static analysis)**
- Source: `ApexClass`, `ApexTrigger` bodies via Tooling API. Source parsed with a lightweight tokenizer in the Web Worker.
- Crypto elements: calls to `Crypto.sign`, `Crypto.encrypt`, `Crypto.decrypt`, `Crypto.generateMac`, `Crypto.generateDigest`, and the algorithm string passed in. Also detect `EncodingUtil` calls and hardcoded secrets via pattern heuristics.
- Risk: RSA/ECDSA signing, AES-128 usage, SHA-1/MD5 digests, hardcoded keys.

**Session and login settings**
- Source: `SecuritySettings`, `SessionSettings`, `PasswordPolicies` via Metadata API.
- Crypto elements: session timeout, MFA requirements, hashing configuration where exposed.
- Risk: weak MFA, long sessions, policy drift.

**Managed packages**
- Source: `InstalledPackage`, `SubscriberPackage` via Tooling API.
- Crypto elements: none directly, but flag packages known to contain cryptographic dependencies for supply-chain visibility.
- Risk: third-party crypto we can't inspect.

---

## Authoritative sources

Every finding in the report cites at least one primary source below. The rules engine has one JSON file per source; a finding may reference multiple.

**United States — primary**

- **NIST IR 8547 — Transition to Post-Quantum Cryptography Standards.** Deprecation and disallowed dates per algorithm. This is the canonical US transition timeline. Everything with a "deprecated after YYYY" or "disallowed after YYYY" finding traces here.
- **NIST SP 800-131A Rev 3 — Transitioning the Use of Cryptographic Algorithms and Key Lengths.** Already-live transitions. SHA-1 disallowed, 1024-bit RSA disallowed, legacy modes retired. Catches compliance gaps that exist today, independent of PQC.
- **NIST SP 800-57 Part 1 — Recommendation for Key Management.** Key length recommendations, crypto period guidance. Used for key-rotation findings.
- **NIST FIPS 203 (ML-KEM), FIPS 204 (ML-DSA), FIPS 205 (SLH-DSA), FIPS 206 draft (FN-DSA).** The approved replacements. Cited in every migration recommendation.
- **NSA CNSA 2.0 — Commercial National Security Algorithm Suite 2.0.** Binding deadlines for US federal and defense. Pre-2027 prepare, 2027 start deploying PQC, 2030 deprecate classical, 2033 prohibit. Cited whenever a customer's output needs federal-grade language.
- **CISA PQC Initiative guidance and the Jan 2026 hardware/software categories list.** Sector-specific priorities. Cited in the executive summary context, not individual findings.

**Europe — secondary, enabled per-customer**

- **BSI TR-02102 (Germany).** Most concrete European crypto technical guideline. Minimum key sizes, approved algorithms, PQC guidance. Needed for DACH customers.
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

- **RSA (any key size) signing** → **ML-DSA (FIPS 204)** for general-purpose signatures; **SLH-DSA (FIPS 205)** when stateless hash-based assurance is preferred; **FN-DSA (FIPS 206 draft)** when compact signatures matter. CNSA 2.0 deprecates classical signatures after 2030, prohibits after 2033.
- **RSA key transport / ECDH key exchange** → **ML-KEM (FIPS 203)**. HQC added in 2025 as a second-source KEM; still in draft standardization as of the current cutoff. Same CNSA 2.0 timeline.
- **ECDSA signing** → **ML-DSA** or **SLH-DSA**. Same timeline.
- **AES-128** → **AES-256**. Grover's algorithm reduces symmetric security by half in theory; AES-256 retains 128-bit security margin post-quantum. Recommended now, no hard deadline.
- **SHA-1** → **SHA-256 or SHA-3**. Already disallowed under SP 800-131A Rev 3. Finding is "existing non-compliance," not "future risk."
- **MD5** → **SHA-256 or SHA-3**. Same category.
- **3DES** → **AES-256**. Already prohibited.
- **Hardcoded keys (any algorithm)** → **Named Credentials + platform-managed secrets**. Not a PQC finding per se; included because the scanner encounters it during Apex analysis.

For each finding, the report includes: current algorithm and parameters, recommended replacement, citation to the authoritative source, and one of three migration postures — **replace now** (already non-compliant), **plan for 2030** (CNSA 2.0 deprecate), **prepare for 2033** (CNSA 2.0 prohibit).

Hybrid deployments (classical + PQC in parallel) are called out in the recommendation where NIST and CISA explicitly endorse them as the transition strategy.

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
- **Regulatory appendix.** For each enabled overlay (PCI, HIPAA, CMMC, etc.), the findings that map to each requirement.
- **Methodology** (1 page). What was scanned, what was not, how severity is computed, source document versions.
- **Cryptographic Bill of Materials (CBOM).** Machine-readable appendix listing every cryptographic asset found, in CycloneDX v1.6 format with `cryptoProperties` populated (`oid`, `nistQuantumSecurityLevel`, `executionEnvironment`, `quantumSafe`), so customers can feed it into Dependency-Track, ServiceNow, or any CycloneDX-aware GRC tooling.
- **OpenVEX document.** One statement per finding (`affected` / `under_investigation`) with action statement and HNDL impact statement, consumable by Grype / Trivy / Dependency-Track without parsing the PDF.

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
- Browser scan results live in IndexedDB on the user's device, scoped per org identity. A "Clear all data" control on the settings page wipes it. CLI runs write artifacts to `./qshield-out/`.
- Our server logs contain only static-asset requests (Cloudflare Pages standard) and, if enabled, Plausible's page-view pings. Neither includes customer or org identifiers.
- In browser mode, Content Security Policy restricts `connect-src` to the Salesforce OAuth endpoints and the customer's instance URL. In CLI mode, outbound requests go directly to the customer's Salesforce instance, plus explicit TLS probe targets when `--probe-tls` is enabled.
- Source is published on GitHub. The security page links to the repo, the build reproducibility steps, and the deployed commit SHA.

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
- Whether to enable Plausible analytics or ship fully blind.
- Whether to save a scan summary back into the customer's org as a custom object, giving them scan history inside Salesforce without us storing anything. Attractive but requires write scope and a managed-package-style object, which complicates the "pure external app" positioning.
