# QuantumShield

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](./LICENSE)

Free, open-source post-quantum readiness scanner for Salesforce orgs, from the [Open Systems Foundation](https://opensf.foundation). No accounts, no paid tiers: everything here is free for everyone under the Apache 2.0 licence. Try the browser app at [quantumshield.opensf.foundation](https://quantumshield.opensf.foundation).

One TypeScript scan engine, two front-ends:

- **Local CLI (`qshield`)** — recommended for real orgs. Reuses the `sf` CLI session you already have on macOS, Windows, or Linux. No Connected App, no CORS setup, and no QuantumShield auth infrastructure in the path.
- **Browser app** — optional static UI for in-browser scans, demos, and report review. Uses an External Client App or Connected App you own plus a one-time CORS allowlist entry in the org.

Both produce the same artifacts: a PDF executive report, a CycloneDX v1.6 CBOM, an OpenVEX document, a findings CSV, and a raw report JSON. Every artifact records **per-category coverage** (`scanned` / `partial` / `failed` / `skipped`), so "we could not check" is never presented as "clean."

QuantumShield is beta software distributed **from source**: it is not published to npm. Install is `git clone` + `npm install` (see below).

---

## Prerequisites

- **Node.js ≥ 22.12** (`node --version`)
- **Salesforce CLI (`sf`)** installed and authenticated to the org you want to scan (CLI mode)
- **Org permissions:** a user with API access and read access to Setup metadata (e.g. *View Setup and Configuration*; *API Enabled*). Categories your user cannot query are reported as `partial`/`failed` coverage rather than silently skipped.

## CLI quickstart (recommended)

```sh
# one-time — install is from source for the beta
git clone https://github.com/OpenSystemsFoundation/quantum-shield.git
cd quantum-shield
npm install

# authenticate your org once with the Salesforce CLI
sf org login web --alias prod-eu

# scan
npm run qshield -- scan --target-org prod-eu --probe-tls --region NL,EU

# outputs land in ./qshield-out/
#   qshield-<org>-<timestamp>.pdf
#   qshield-<org>-<timestamp>.cbom.json      (CycloneDX 1.6)
#   qshield-<org>-<timestamp>.vex.json       (OpenVEX)
#   qshield-<org>-<timestamp>.findings.csv
#   qshield-<org>-<timestamp>.report.json
```

### Useful flags

```sh
qshield scan --target-org prod-eu --region NL,EU            # scope regulatory framing to NL/EU
qshield scan --format cbom,vex --probe-tls                  # CBOM + VEX + live TLS probe
qshield scan --overlay nis2,dora,pci-dss-4                  # enable regulatory overlays
qshield scan --out ./audit-2026Q2                           # custom output directory
qshield scan --allow-partial                                # CI-friendly: partial coverage exits 0
qshield scan --quiet                                        # suppress scanner progress lines
qshield orgs                                                # list orgs the sf CLI knows
qshield help                                                # all flags
```

### Exit codes

| Code | Meaning |
|---|---|
| `0` | Success. Full coverage — categories `skipped` because the org lacks the feature (e.g. Shield not licensed) still count as success. |
| `2` | Usage error: unknown command/flag, missing or invalid flag value. |
| `3` | Partial scan: the report was written, but at least one category has coverage `partial` or `failed`. Pass `--allow-partial` to downgrade to `0`. |
| `10` | Authentication failure: `sf` CLI missing, unknown org alias, or expired session. |
| `20` | Scan aborted, or every requested output format failed to write. |

### Global install

```sh
npm install -g .
qshield scan -o prod-eu --region NL,EU --probe-tls
```

Note: `npm install -g .` **symlinks** the checkout — the global `qshield` command resolves its dependencies from the clone's `node_modules`. If you move or delete the clone, the global command breaks; re-run `npm install -g .` from the new location.

---

## Browser mode (optional)

```sh
npm install
npm run dev
# open http://localhost:4321/connect
```

Browser mode is the static web UI. It never uses a shared QuantumShield Connected App: you create an External Client App or Connected App in your own org, paste the Consumer Key into the setup wizard, and add the site's origin to your org's CORS allowlist. Sign-in uses OAuth 2.0 authorization code with PKCE and requests only the `api` and `id` scopes.

If you only care about production scans, you can ignore browser mode entirely and use the CLI.

---

## What it scans

All read-only, metadata and configuration only — never record data, field values, or file bodies.

| Target | Source | What is checked |
|---|---|---|
| X.509 certificates (SSO, integrations) | Tooling API `Certificate` | RSA key size as reported by the API; quantum-vulnerable asymmetric keys, undersized RSA |
| Connected Apps & External Client Apps | Tooling API `ConnectedApplication`, `ExternalClientApplication` | **Inventory only.** Salesforce's API does not expose OAuth signing-key configuration, so no key-size claims are made — review JWT certificates manually in Setup |
| Named Credentials & External Credentials | REST API `NamedCredential`, `ExternalCredential` | Non-HTTPS endpoints; configured authentication protocol as reported by the API |
| Remote Site Settings | Tooling API `RemoteSiteSetting` | Non-HTTPS endpoints (active sites only) |
| TLS endpoints (CLI only, `--probe-tls`) | Live `node:tls` handshake | Negotiated TLS version, cipher and key-exchange group; TLS 1.2 flagged as HNDL-exposed, static RSA key exchange (no forward secrecy) flagged as critical. Probes run from your machine, not from Salesforce, so findings note that Salesforce callouts should still be assumed classical even when the endpoint supports a hybrid KEM. Hybrid-KEM detection (X25519MLKEM768 etc.) requires a local OpenSSL ≥ 3.5 — on older stacks the verdict is recorded as *unknown*, not "no hybrid" |
| SAML SSO & Auth Providers | REST API `SamlSsoConfig`, `AuthProvider` | SAML request-signature method (`RSA-SHA1` vs `RSA-SHA256`); auth providers inventoried by type. IdP certificate key sizes are not exposed by the API and are not guessed |
| Shield Platform Encryption | REST API `TenantSecret` | Tenant secret type, BYOK/EKM vs Salesforce-derived key material, rotation history; active secrets not rotated in over 365 days are flagged. Orgs without Shield record the category as `skipped` with a note — not as clean |
| Apex classes | Tooling API `ApexClass.Body` (pattern analysis, comments stripped) | `Crypto.generateDigest` MD5/SHA-1, `Crypto.sign`/`signWithCertificate` incl. the `'RSA'`→RSA-SHA1 alias, `Crypto.generateMac` HMAC-MD5/HMAC-SHA1, AES-128/192 encrypt/decrypt, hardcoded AES key literals |
| Installed managed packages | Tooling API `InstalledSubscriberPackage` | Inventory for supply-chain visibility (their crypto cannot be inspected) |
| Session settings | Tooling API `SessionSettings` | Session timeout configuration |

Coverage semantics: every category ends a scan as `scanned`, `partial` (some queries failed), `failed`, or `skipped` (feature not present in the org), and that status is carried into the PDF, CBOM, VEX, CSV, and JSON. Treat anything other than `scanned` as *unverified*.

---

## Standards & sources

- **Cryptographic Bill of Materials:** OWASP CycloneDX v1.6 (ECMA-424), schema-valid, with `cryptoProperties` populated for each crypto asset.
- **Exploitability:** OpenVEX v0.2.0, one statement per finding, consumable by Grype, Trivy, and Dependency-Track.
- **NIST PQC:** FIPS 203 (ML-KEM / Kyber), FIPS 204 (ML-DSA / Dilithium), FIPS 205 (SLH-DSA / SPHINCS+).
- **Regulatory sources** (25 of them, each as a canonical Markdown file under `src/content/regulations/`): NIST SP 800-131A r3, SP 800-52 r2, SP 800-53 r5, SP 800-57 Pt1 r5, IR 8547; NSA CNSA 2.0; BSI TR-02102; NCSC-NL PQC factsheet; ANSSI PQC; NCSC-UK PQC; ENISA PQC 2024; NIS Cooperation Group PQC roadmap; GDPR Art. 32; NIS 2 Art. 21; DORA Art. 9; eIDAS 2; PCI DSS 4.0; HIPAA Security Rule; CMMC 2.0; SWIFT CSP; FTC Safeguards Rule. Salesforce's own PQC white paper (March 2026) is included as a vendor reference.

Rules are generated from the Markdown frontmatter at build time (`npm run sync:regulations`); hand-edits to `src/lib/rules/*.generated.ts` are overwritten. Rules declare which regulatory overlays they map to; enabling overlays (`--overlay`) scopes the report's regulatory appendix and never changes which rules fire.

---

## Beta caveats

- **Advisory output.** Findings are decision support, not legal advice or compliance attestation. Human review is required.
- **Detection is best-effort.** Apex analysis is pattern-based (comments are stripped, but string-built algorithm names and unusual formatting can evade it). False positives and negatives are possible.
- **API-bounded surface.** Salesforce does not expose everything (Connected App signing keys, IdP certificate details); those surfaces are inventoried, not assessed. Check the coverage section of every report.
- **TLS probe caveat.** Hybrid-KEM verdicts depend on the local OpenSSL (≥ 3.5 required); older stacks report *unknown*.
- **From-source beta.** No npm package, no signed release binaries yet; pin the commit you audit.
- Support is best-effort via [GitHub issues](https://github.com/OpenSystemsFoundation/quantum-shield/issues).

The full audit trail for the production-readiness wave is in [docs/PRODUCTION_READINESS_REVIEW.md](./docs/PRODUCTION_READINESS_REVIEW.md).

---

## Deployment

The hosted browser app runs at **https://quantumshield.opensf.foundation** as a static-assets Cloudflare Worker (`wrangler.jsonc`). There is no server code, no storage binding (D1, KV, R2) and no runtime secret: scans, reports and OAuth tokens stay in the visitor's browser.

Cloudflare builds from GitHub (Workers Builds) with:

| Setting | Value |
|---|---|
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| Build variable `NODE_VERSION` | `22.12.0` (or newer 22.x) |
| Build variable `PUBLIC_APP_ORIGIN` | `https://quantumshield.opensf.foundation` |
| Build variable `PUBLIC_SF_API_VERSION` | `66.0` |

Leave `PUBLIC_SF_CLIENT_ID` and `PUBLIC_DEV_MOCK` unset in production: each user brings their own Consumer Key, and the mock login is disabled in production builds regardless. Security headers (CSP, HSTS, caching) ship in `public/_headers`. Unknown paths serve `src/pages/404.astro`.

---

## Dev loop

```sh
npm install
npm run sync:regulations        # regenerate rule + citation tables from MD
npm run dev                     # Astro dev server (browser UI + setup wizard)
npm run qshield -- scan --target-org <alias>   # local CLI against a live org
npm test                        # vitest (unit tests for rules, scanners, CBOM, VEX, CLI bridge)
npm run check                   # astro check (TypeScript + Svelte + Astro diagnostics)
npx tsc --noEmit -p tsconfig.cli.json          # typecheck the CLI entry points
```

CI (GitHub Actions) runs typechecks, unit tests, the production build, a generated-tables freshness check, and a package.json ↔ `src/lib/version.ts` version-consistency check on every push and PR to `main`. CI deliberately runs only cheap checks that need no Salesforce org, browser, or secrets; run the Playwright e2e suite locally with `npm run test:e2e`.

Tests for the scan fixtures + a "poisoned" scratch-org bootstrap live under `salesforce/` — run `npm run capture:scan-fixtures` after standing the scratch org up to refresh the snapshot the browser uses for demo mode.

---

## License

Apache License 2.0 — see [LICENSE](./LICENSE). Copyright 2026 Open Systems Foundation.

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full design: core decisions, scan categories and coverage model, authoritative sources, scoring, report output, threat model, privacy model, and the dual web/CLI split.
