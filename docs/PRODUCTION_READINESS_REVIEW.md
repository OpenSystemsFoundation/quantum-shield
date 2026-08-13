# QuantumShield — Production Readiness Review

**Date:** 2026-08-12
**Reviewer:** Automated deep review (Claude Code)
**Scope:** Full application — CLI (`qshield`), static browser app, shared scan engine, rule catalog, report artifacts (PDF / CBOM / VEX / CSV / JSON), docs, and release engineering.
**Verdict:** **Not ready for public beta yet.** The product is architecturally sound and genuinely close, but there are correctness and trust issues that would cause it to give users *wrong answers they can't detect* and legal/security gaps that block any public "start using it" launch. None of the blockers are deep — most are a day or less of work — but several are must-fix before anyone runs this against a real org and trusts the output.

---

## Remediation status — 2026-08-13

**Every blocker and every High finding below was fixed on 2026-08-13** (see `CHANGELOG.md` 0.1.0 and the commit history of this branch), along with all Medium items and most Low polish. Headlines:

- **B1–B5 all closed:** sf CLI token fallback; per-category scan **coverage** (`scanned / partial / failed / skipped`) carried through every artifact with broken queries repaired (verified live: Shield reports an honest *skipped*, Connected Apps + External Client Apps inventory correctly); browser OAuth rebuilt on **authorization code + PKCE** with `refresh_token` dropped from scopes; **Apache-2.0 LICENSE** added.
- **Scan correctness:** region filter no longer drops baseline rules for EU users (verified live: `--region NL,EU` returns full parity), Tooling queries paginate, fabricated crypto facts removed, Apex analysis is comment-aware and catches HMAC-MD5/SHA1 + SHA-1 signatures, `--overlay` actually maps findings into the regulatory appendix (verified in a live PDF).
- **Artifacts:** CBOM is CycloneDX-1.6 enum-valid (verified: 0 violations on a live scan), OpenVEX field placement is spec-legal, CSV is formula-injection-safe, the PDF renders non-WinAnsi org names without crashing, and the methodology text matches the generator (CLI vs browser).
- **CLI:** strict flag validation (exit 2 with did-you-mean), **exit 3 on partial coverage** (`--allow-partial` to accept), sf error passthrough, per-format writer isolation — all verified against a live scratch org.
- **Trust surface:** real CSP + security headers shipped via `public/_headers` with the security page describing exactly what ships; fonts self-hosted (zero third-party requests); repo links fixed; README/ARCHITECTURE reconciled with the implementation; CI added (typecheck × 2, unit, build, version-consistency, e2e).
- **Verification at close:** `tsc` (app + cli) clean · `astro check` 0 errors · vitest **96/96** · build 46 pages (dev route excluded from prod) · Playwright e2e **18/18** · live scans on a fresh scratch org exercising coverage, region, overlay, probe, and every exit-code path.

Items deliberately left open: browser-mode OAuth still needs one manual round-trip against a real org from a normal workstation (sandbox egress blocked browser TLS here — code + e2e-mocked flows verified); the production domain is still unset (`astro.config.mjs` `site`); 5 npm advisories remain that are all gated on the astro@7 major upgrade. Tracked in `AGENTS.md`.

The review below is preserved unchanged as the audit record of the 2026-08-12 state.

---

## How this review was done

This was a hands-on review against real infrastructure, not a code read:

1. **Baseline build/test** on a clean `npm install` — `astro check` (0 errors), `vitest` (24/24 unit tests), `astro build` (46 pages), and `design:lint` all pass.
2. **Live scratch org.** Authenticated your Dev Hub via the provided `SFDX_AUTH_URL`, created a scratch org from `salesforce/`, and deployed the seed metadata (Apex classes with legacy crypto, Named Credentials, Remote Sites, an External Client App).
3. **Real CLI scans.** Ran `qshield scan` against that org with `--probe-tls`, `--overlay`, and `--region` variants. Inspected every artifact it produced (rendered the PDF to images, schema-checked the CBOM/VEX, read the CSV/JSON).
4. **Browser app.** Ran the Playwright e2e suite and drove the app manually with a headless browser (dev-mock connect → scan → report → finding drawer, desktop + mobile viewports).
5. **Multi-agent code review.** Seven parallel reviewers (security/auth, scan-engine correctness, output artifacts, CLI robustness, browser UX/a11y, docs accuracy, packaging/release), each finding then **adversarially verified** by an independent skeptic. ~90 findings raised; the ones below survived verification. Several were also reproduced by hand against the live org.

**One blocker was found and fixed during the review** (the CLI could not scan any org on current `sf` CLI versions — see below). Everything else is documented here for you to schedule; no other code was changed.

---

## What already works well

Credit where due — this is a real, coherent product, not a prototype:

- **The scan engine architecture is clean.** One shared TypeScript engine over a thin REST/Tooling client, a declarative Markdown-driven rule catalog, and a Web Worker for the browser. CLI and browser genuinely share it.
- **The CLI happy path is solid.** stdout carries machine-readable JSON, stderr carries progress — correct hygiene for scripting. Exit codes are distinct per failure class. `sf`-not-installed is handled with a helpful message. It produced all five artifacts against the live org in ~12s.
- **The report output looks professional.** The PDF is well-designed (executive summary, findings register sorted by deadline, methodology, regulatory appendix, CBOM table). Citations trace to real source documents with section anchors and versions.
- **The rule content is credible.** 23 regulation sources, mapped to NIST/BSI/ENISA/NCSC with real requirement anchors. This is the hard part and it's done well.
- **Genuine security instincts in the auth code.** OAuth `state` is validated on both callback paths, entropy comes from `crypto.getRandomValues`, custom-domain input is pinned to HTTPS Salesforce-owned suffixes, IndexedDB stores report data only (no tokens), and the TLS probe keeps certificate validation on and never sends the org token to probed hosts.

The gap between "this is impressive" and "people can start using it" is smaller than the list below makes it look — but the list is real.

---

## Blockers — must fix before anyone uses it

### B1. The CLI could not scan any org on current `sf` CLI versions — **FIXED during this review**
`cli/auth/sfCli.ts` read the access token from `sf org display --json`. Salesforce CLI **2.x now redacts** that field (`"[REDACTED] Use 'sf org auth show-access-token' to view"`). The token was passed through verbatim, so every scan died at the first API call with `Session expired or invalid`. This affected **100% of CLI scans** on any reasonably current `sf` install — the primary, recommended product path.

**Fix applied:** when the token comes back redacted, fall back to `sf org auth show-access-token --json`. Added two unit tests covering the fallback and the "still unusable" error path. Verified end-to-end: a full `--probe-tls` scan against the live org now completes and writes all five artifacts. This is on your branch.

### B2. Failed scanner categories are silently swallowed and reported as "clean"
`src/lib/scan/engine.ts:69` catches any scanner error and emits a `warn` log, then the category shows **`COMPLETED (0 assets)`**. Verified live against the scratch org: the queries for **Connected Apps** (`OauthConfig.ConsumerKey/CertificateId` sub-selects), **SSO** (`SamlSsoConfig`, `AuthProvider`), and **Shield Encryption** (`TenantSecret`) all **error on a real org** ("sObject type not supported" / malformed sub-query) and are caught by empty `catch {}` blocks in `src/lib/scan/scanners.ts`. The scan output showed `Connected Apps (0 assets) · COMPLETED`, `Single Sign-On (0 assets) · COMPLETED`, `Shield Platform Encryption (0 assets) · COMPLETED` — indistinguishable from an org that genuinely has none.

For a security posture tool, **"we couldn't check" rendering as "you're fine"** is the most dangerous possible failure mode. A customer with a SHA-1-signed SAML IdP or an RSA-1024 JWT Connected App gets a clean bill of health.

**Fix:** (a) repair the queries so the categories actually run (drop the unsupported sub-selects, query `SamlSsoConfig`/`AuthProvider`/`TenantSecret` via the correct API/edition or gate them behind capability checks); (b) propagate a per-category `status: scanned | failed | skipped` all the way into the report and every artifact so failures are visible, not swallowed. B2 and B3 are the same fix from two angles.

### B3. No artifact distinguishes "scanned clean" from "could not scan"
`src/lib/pdf/types.ts` / the `Report` model has no per-category status. The PDF "What we scanned" list, the CBOM, and the VEX all present a partial scan identically to a complete one. Combined with B2, a scan that silently failed three categories produces a confident-looking report and CBOM that an auditor would reasonably read as exhaustive. The report needs an explicit coverage section: what ran, what failed, what was skipped and why.

### B4. Browser-mode OAuth is broken against the setup the wizard tells users to create
`src/lib/auth/oauth.ts:37` uses the **deprecated implicit grant** (`response_type=token`). The PKCE module (`src/lib/auth/pkce.ts`) is **dead code** — `deriveCodeChallenge` has zero call sites, and `tests/e2e/auth-flow.spec.ts` even asserts `code_challenge_method` is `null`. But the External Client App metadata the wizard instructs users to create (`salesforce/.../QuantumShield_Scanner_glbloauth.ecaGlblOauth-meta.xml`) sets `isPkceRequired=true` and enables **only** the authorization-code flow. External Client Apps don't offer the implicit flow at all — so a user who follows ConnectWizard step 2 ("New External Client App") gets an OAuth error at the authorize step and **browser mode never works**. Where it does work (a legacy Connected App), the token — and, because `refresh_token` is in the requested scopes, potentially a long-lived refresh token — arrives in the URL fragment.

**Fix:** switch browser mode to authorization-code + PKCE (`response_type=code`, send the S256 `code_challenge` from the already-generated verifier, complete via the existing-but-unreachable `exchangeCode` path). This also makes the flow match the shipped ECA metadata. Drop `refresh_token` from browser scopes — nothing consumes it. *Note: I couldn't complete a live browser OAuth round-trip because this sandbox's egress proxy resets the browser's TLS handshake to `login.salesforce.com`; the finding is from code + the ECA metadata contract, both unambiguous.*

### B5. No LICENSE — legally, nobody can "start using it"
There is no `LICENSE` file and no `license` field in `package.json`. A public repo with no license grants **no usage rights** — no company's legal team will let their admins run it against a production org. This is a one-file fix but it is a hard gate for the stated goal.

---

## High — fix before public beta

**Scan correctness**

- **Region filter silently drops half the catalog for EU/NL/DE/FR/UK users.** `src/lib/rules/engine.ts` keeps a rule only if one of its *citations* is tagged with the selected jurisdiction or `INTL`. Verified live: `--region NL,EU` returned **10 findings (apex only)** vs **19 without** — the plaintext-HTTP, TLS, and other rules whose citations are US/INTL-tagged were dropped for a Dutch customer, even though HTTP-in-transit is universally non-compliant. The region filter should *scope framing/severity*, not *remove* baseline rules.
- **`toolingQuery` never paginates.** `src/lib/scan/sfClient.ts:96` returns only the first response and ignores `nextRecordsUrl` (the REST `query` path right above it paginates correctly). Orgs with >2000 Apex classes (or Tooling records) have everything past the first page **silently never scanned**. Large orgs are exactly the ones that need this tool.
- **Connected-app crypto classification is inverted.** `scanners.ts:165` labels apps *with* a JWT signing cert as `RSA-SHA256/keySize` but defaults *cert-less* apps to a fabricated `RSA-2048`, so a real RSA-1024 JWT cert can slip under the rule while a benign bearer-only app generates a phantom finding. (Currently moot because the whole query fails per B2 — but must be correct once B2 is fixed.)
- **Apex regex misses the weakest crypto and matches inside comments.** `scanners.ts` misses `Crypto.sign('RSA'...)`, `RSA-SHA1`, `hmacMD5`/`hmacSHA1`, and 4-arg `Crypto.encrypt`, and it flags matches inside `//` and `/* */` comments. Both false negatives (missing real weak crypto) and false positives (flagging commented-out code) undermine trust.
- **`--overlay` is a no-op.** No rule in `src/content/rules/*.md` declares an `overlays:` field, so `filterRuleDefinitionsForOverlays` maps nothing and the PDF "Regulatory appendix" always prints **"No findings mapped to this overlay."** Verified live with `--overlay nis2,dora,pci-dss-4`. Either wire overlays to rules or remove the flag and the appendix until they're wired.
- **Hybrid-KEM TLS verdict depends on the user's local OpenSSL.** `cli/probe/tls.ts` infers PQC hybrid support from the local Node/OpenSSL; on OpenSSL <3.5 **every** endpoint is reported as "no hybrid KEM" regardless of what the server supports. The finding text states a fact about the remote server that is actually about the client.

**Output artifacts**

- **CBOM fails CycloneDX 1.6 schema validation on every real scan.** `src/lib/pdf/cbom.ts` emits invalid `assetType` values (`key`, `library`), an invalid `executionEnvironment` (`salesforce-hyperforce`), invalid `primitive` values (`public-key`, `protocol`), and a non-spec `quantumSafe` boolean. The whole selling point of the CBOM is that Dependency-Track / ServiceNow can ingest it — they'll reject it.
- **PDF render crashes on non-Latin org/asset names.** Reproduced empirically: an org named with Turkish characters throws `WinAnsi cannot encode "Ş"`. pdf-lib's `StandardFonts.Helvetica` can't encode Turkish/Polish/CJK/emoji — for an EU-first product, a customer named `Şirket…` or `Kraśnik…` gets **no report at all**. Sanitize/transliterate before drawing, or embed a Unicode TTF.
- **CSV has no formula-injection protection.** `src/lib/pdf/csv.ts` doesn't escape leading `=`, `+`, `-`, `@`. An asset or Apex class named `=cmd|...` becomes a live formula when the findings CSV is opened in Excel — a real risk when the input is attacker-influenceable org metadata.
- **OpenVEX violates the spec.** `src/lib/pdf/vex.ts` puts free-text `justification` on `affected`/`under_investigation` statements (only valid on `not_affected`) and `impact_statement` on `affected` statements. Grype/Trivy validators will reject it.
- **The PDF's methodology text is false for CLI reports.** Every report asserts *"QuantumShield executes entirely in the browser … via OAuth 2.0 with PKCE."* Neither is true: the primary path is the CLI (runs on the admin's machine), and no path uses PKCE (B4). This lands in the auditor-facing compliance section.

**Trust / security surface**

- **The security page advertises a CSP that is never deployed.** `src/pages/security.astro` prints a strict `connect-src` policy, but there is no `public/_headers`, no `<meta http-equiv>`, and no header config anywhere. Since the OAuth token lives in `sessionStorage` (XSS-readable), CSP is the *only* second line of defense — and it's fictional. Ship a real `public/_headers` (CSP + `X-Content-Type-Options`, `Referrer-Policy`, `frame-ancestors`) or soften the claim.
- **Public "View source" links point to the wrong repo.** `src/pages/index.astro` and `install.astro` link to `github.com/elgeffe/quantum-shield`; the repo is `OpenSystemsFoundation/quantum-shield`. Every "View source" / trust link is dead — bad for a product whose trust story *is* "read our code."
- **README scan-surface table claims detections the engine can't produce.** The table advertises Shield AES-128/BYOK flags, "missing mTLS," "bearer-only apps," and "Apex AST" analysis; the rules engine produces none of these. Align the table with what actually fires.

**Browser UX**

- **The scan flow reports success while hiding failed categories.** `src/components/ScanView.svelte:181` redirects to the report on completion regardless of per-category failures; the report view has no place to show them. Same class of problem as B2/B3, on the browser side.
- **Core flows are keyboard-inaccessible.** Finding table rows are click-only `<tr>`s and the drawer controls are mouse-only (`ReportView.svelte`). No keyboard user (or screen-reader user) can open a finding. This is both an a11y failure and, for public-sector EU buyers, often a procurement blocker.
- **No responsive layout outside the drawer.** The landing page and app shell use fixed multi-column grids; the report table overflows horizontally on mobile (confirmed on a 390px viewport). 

**Release engineering**

- **No CI at all.** No `.github/workflows` — nothing runs typecheck, tests, or build on push/PR. With generated files and a shared engine, this will regress silently.
- **18 npm advisories (1 critical, 11 high).** The critical (`websocket-driver`) and several highs are reachable from the CLI's production runtime via `jsforce`. Run `npm audit fix`, and note that `jsforce` is only used for a type import in `sfClient.ts` — consider dropping it from prod deps entirely.
- **No deployment/security-header config for the static host.** No `_headers`/`_redirects`/`wrangler.toml`. An app holding Salesforce OAuth tokens ships with zero security headers. (Same fix as the CSP item.)

---

## Medium — fix soon after launch

- **Every network failure is diagnosed as a CORS block.** `src/lib/scan/sfClient.ts:65` turns *any* `fetch` rejection into `CorsBlockedError` telling the user to whitelist a domain in Setup → CORS. In the **CLI** (Node, no CORS concept) an offline/DNS/timeout error tells the admin to reconfigure their org's CORS. Distinguish transport errors from actual CORS.
- **Access token left in the URL fragment on callback error paths.** `src/components/CallbackHandler.svelte` never scrubs `location.hash`; on error paths the token stays in the address bar and browser history. Scrub the fragment immediately on callback, before branching.
- **`PUBLIC_DEV_MOCK` has no production guard.** `src/lib/auth/config.ts:61` enables the "skip OAuth" mock session whenever the env var is `1`. `.env.development` sets it to `1`; a stray build env would ship a public "skip OAuth" button. Hard-gate it to `import.meta.env.DEV`.
- **Three different pinned API versions.** Browser default `63.0` (`config.ts`), CLI fallback `62.0` (`sfCli.ts`), scratch def `66.0`, live org `67.0`. Pick one source of truth.
- **One artifact failure destroys all output.** `cli/output/writers.ts` renders formats in a loop with no per-format isolation, and PDF (most likely to throw — see WinAnsi) renders first. A crash on the PDF loses the CBOM/VEX/CSV/JSON too. Isolate each writer in its own try/catch.
- **`cli/` is excluded from `tsconfig.json`** — the primary front-end is never typechecked by `astro check` or any gate. Add a CLI typecheck step.
- **CLI dependency classification is inverted.** `tsx` and the CLI runtime deps are in `devDependencies`; the web toolchain is in `dependencies`. For a CLI-first product this is backwards and interacts badly with any future packed publish.
- **Unknown/mistyped flags are silently ignored.** `cli/args.ts` accepts `--unknwon-flag` and missing flag values without error, silently changing what gets scanned. Validate and reject.
- **`sf` failure details are discarded.** `sfCli.ts` surfaces `Command failed: sf ...` with the real reason (unknown alias, expired org) stripped. Pass through stderr.
- **The CLI drops all `log` events** — per-endpoint probe failures and scanner warnings never reach the user (`cli/commands/scan.ts:77` ignores `type: 'log'`). Print them to stderr.
- **Sidebar nav is decorative** — Scans / Findings / Report all link to `/app` (`AppChrome.svelte:47`).
- **Opening a failed or still-running scan from history silently restarts it** under the same ID (`AppShell.svelte:61`).
- **Zero-findings and filtered-to-zero report states render an empty table** with no explanation (`ReportView.svelte:303`).
- **ARCHITECTURE.md oversells the product.** It describes a larger scan surface than `scanners.ts` implements and claims features with **zero presence in the code**: Layer Cake charts, Plausible analytics, `/docs` FAQ+methodology routes, CORS-panel screenshots, a settings page, and a deployed-commit-SHA on the security page. It also lists CISA guidance and FIPS 206 as authoritative sources that don't exist in the catalog. Reconcile the doc with reality before it's public.
- **The overlay regulatory appendix** can't map findings until the overlay wiring (High) is fixed; keep them in sync.

---

## Low — polish

- **`quantumshield.example` placeholder** ships in every PDF's `Creator` metadata (`src/lib/pdf/renderer.ts:19`) and as the install page's static fallback. (The install page fixes itself at runtime via JS, but the PDF doesn't.)
- **OpenVEX/CBOM document IDs use a fake `https://quantum-shield/` host.**
- **Windows `sf` fallback uses hand-rolled `cmd.exe` quoting** (`cli/auth/sfCli.ts`) that mishandles quotes/metacharacters — low risk since args are org aliases the user controls, but worth using `execFile` semantics throughout.
- **Google Fonts loaded from Google's CDN on every page** (`src/layouts/Shell.astro:24`) — contradicts the self-contained, EU-first privacy story, and is the direct cause of 6 e2e tests failing in offline/proxied environments (they assert zero console errors; the font fetch fails → console error → test fails). Self-host the fonts: fixes the privacy story *and* makes the e2e suite hermetic.
- **A real dev-org ECA consumer key is committed** in the seed metadata. It's a public OAuth client ID for a throwaway scratch-org app (not a secret), but rotate it and keep committed metadata credential-free as a habit.
- **`/dev/pdf-preview` ships in the production build** (46 pages include it). Harmless but should be excluded from prod.
- **PQC classification has wrong/missing OIDs and off-by-one NIST levels** (`crypto-classification.ts`): ML-DSA gets ML-KEM's OID, SLH-DSA's OID never resolves, ML-DSA-44 is level 1 instead of 2, SHA-384 is level 3 instead of 4. Cosmetic today, but it's in a machine-readable artifact.
- **Long asset names/URLs overflow the PDF page edge** — finding-card title/asset lines aren't wrapped (`sections.ts:339`).
- **Tool version `0.0.1` is hardcoded** independently in the CBOM and VEX builders instead of sourced from `package.json`.
- **TLS findings from Remote Sites are miscategorized under "Named Credentials"** (`engine.ts:110`).
- **Finding IDs collide** when two crypto calls share an Apex line — the second is silently deduped away (`scanners.ts:424`).
- **Small-text contrast** on sidebar counts and scan-log timestamps likely fails WCAG AA (`design-system.css:235`).
- **Missing `engines`/`.nvmrc`** — Astro 6 needs Node ≥22.12; users on older Node get cryptic failures. Add an `engines` field. (Downgraded from High: the failure is loud enough at install, not silent.)
- **Dead `salesforce/` pre-commit tooling** (husky in a subfolder does nothing at repo root) and an **uncommitted `salesforce/package-lock.json`**.
- **Duplicate `sfdx-project.json`** at root and in `salesforce/`; AGENTS.md still calls the root one "untracked."
- **AGENTS.md release tracker is ~3.5 months stale** and misstates current repo state.
- **No release identity** — no git tags, no CHANGELOG, `version` stuck at `0.0.1`.

---

## A note on one *refuted* claim (for honesty)

The review initially flagged the README's `npm install -g .` global-install path as a blocker (bin imports `tsx`, a devDependency). On verification this is **not** broken on any supported npm: `npm install -g .` from a local folder **symlinks** the checkout (npm 7+), so the global `qshield` resolves `tsx` from the checkout's own `node_modules`, which `npm install` already populated. It's fine as long as the checkout isn't moved/deleted. Left here so you don't spend time "fixing" a non-bug — though moving `tsx` to `dependencies` (see Medium) would harden it for a future packed publish.

---

## Suggested path to beta

A pragmatic ordering. The blockers are small; the sequencing matters more than the size.

**Milestone 1 — "the answers are trustworthy" (the real gate):**
1. B1 token fallback — ✅ done this review.
2. B2 + B3 — make failed categories run, and make partial coverage visible in the report and every artifact. *Nothing else matters if the tool says "clean" when it didn't look.*
3. Region-filter fix and `toolingQuery` pagination (High) — wrong/incomplete results on exactly the customers you want.
4. WinAnsi PDF crash + CSV injection + CBOM/VEX schema conformance (High) — the artifacts are the product.

**Milestone 2 — "it's safe and legal to hand out":**
5. B5 LICENSE.
6. B4 browser OAuth → code+PKCE (or, if you want to ship faster, *demote browser mode to "demo/report-review only" and disable live browser scans* — the architecture already treats the CLI as primary, and this sidesteps B4 entirely for beta).
7. Real `public/_headers` + CSP, or soften the security-page claim. Fix the `elgeffe` repo links. Correct the PDF methodology text.

**Milestone 3 — "it holds up to scrutiny":**
8. CI running check/test/build/e2e on PR; `npm audit fix`; self-host fonts (also un-breaks e2e).
9. Reconcile README/ARCHITECTURE claims with the implementation; wire or remove `--overlay`.
10. Keyboard accessibility and mobile layout.

Everything in Low is genuine polish and can trail the beta.

---

## Verification appendix

| Check | Result |
|---|---|
| `npm install` (clean) | ✅ |
| `astro check` | ✅ 0 errors / 0 warnings |
| `vitest run` | ✅ 24/24 (26/26 after B1 fix + 2 new tests) |
| `astro build` | ✅ 46 pages |
| `design:lint` | ✅ 0/0 |
| Scratch org create + deploy | ✅ (seed Apex/NamedCred/RemoteSite/ECA deployed) |
| `qshield orgs` | ✅ |
| `qshield scan --probe-tls` (live org) | ✅ after B1 fix — 19 findings, all 5 artifacts written |
| CBOM structure | ⚠️ well-formed JSON but **not** CycloneDX-1.6-valid (High) |
| OpenVEX structure | ⚠️ statements present but **spec violations** (High) |
| PDF render | ✅ for ASCII names; ❌ **throws** on non-WinAnsi names (High) |
| Playwright e2e | ⚠️ 10/16 pass; 6 fail — Google-Fonts console errors + dev cold-compile timeouts (see Low/High) |
| Live browser OAuth round-trip | ⚠️ not completed — sandbox egress proxy resets the browser TLS handshake to Salesforce; B4 derived from code + ECA metadata |

*Prepared as part of a production-readiness pass. The B1 fix is committed on `claude/production-readiness-review-vnvwyc`; all other findings are documentation only — no further code was changed.*
