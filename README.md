# QuantumShield

Post-quantum readiness scanner for Salesforce orgs. One TypeScript scan engine, two front-ends:

- **Web app** — `npm run dev` → browser-only, OAuth via our Connected App, zero backend.
- **Local CLI (`qshield`)** — reuses the `sf` CLI session you already have. No Connected App, no CORS setup, nothing to configure in the org.

Both produce the same artifacts: a PDF executive report, a CycloneDX v1.6 CBOM, an OpenVEX document, a findings CSV, and a raw report JSON.

---

## CLI quickstart

```sh
# one-time
git clone <this repo>
cd quantum-shield
npm install

# authenticate your org (uses the Salesforce CLI — no QuantumShield Connected App)
sf org login web --alias prod-eu

# scan
npm run qshield -- scan --target-org prod-eu

# outputs land in ./qshield-out/
#   qshield-<org>-<timestamp>.pdf
#   qshield-<org>-<timestamp>.cbom.json      (CycloneDX 1.6)
#   qshield-<org>-<timestamp>.vex.json       (OpenVEX)
#   qshield-<org>-<timestamp>.findings.csv
#   qshield-<org>-<timestamp>.report.json
```

### Useful flags

```sh
qshield scan --target-org prod-eu --region NL,EU            # Dutch/EU rules only
qshield scan --format cbom,vex --probe-tls                  # CBOM + VEX + live TLS probe
qshield scan --overlay nis2,dora,pci-dss-4                  # enable regulatory overlays
qshield scan --out ./audit-2026Q2                           # custom output directory
qshield scan --quiet                                        # suppress scanner progress lines
qshield orgs                                                # list orgs the sf CLI knows
qshield help                                                # all flags
```

### Global install

```sh
npm install -g .
qshield scan -o prod-eu --region NL,EU --probe-tls
```

---

## What it scans

| Target | Source | Flags weak crypto? |
|---|---|---|
| X.509 certificates (SSO, Connected Apps, integrations) | Tooling API `Certificate` | RSA < 3072, RSA/ECC (Shor's) |
| Connected Applications + JWT signing certs | Tooling API `ConnectedApplication`, `OauthConfig.CertificateId` | RS256 weak keys, bearer-only apps |
| Named Credentials & External Credentials | REST API `NamedCredential`, `ExternalCredential` | Missing mTLS, weak endpoints |
| Remote Site Settings | Tooling API `RemoteSiteSetting` | Non-HTTPS endpoints |
| TLS endpoints (CLI only, `--probe-tls`) | Live `node:tls` handshake | TLS 1.2, TLS 1.3 without hybrid KEM |
| SAML SSO & Auth Providers | Tooling API `SamlSsoConfig`, `AuthProvider` | SHA-1 signatures, RSA-2048 IdPs |
| Shield Platform Encryption | Tooling API `TenantSecret` (type, source, rotation) | AES-128 only, missing BYOK/EKM |
| Apex classes | Tooling API `ApexClass.Body` (regex + AST) | MD5, SHA-1, AES-128, hardcoded keys, RSA signing |
| Installed managed packages | Tooling API `InstalledSubscriberPackage` | Out-of-date vendor crypto |
| Session & login settings | Tooling API `SessionSettings` | Long session timeouts |

---

## Standards & sources

- **Cryptographic Bill of Materials:** OWASP CycloneDX v1.6 (ECMA-424). Every component populates `cryptoProperties.algorithmProperties.primitive`, `nistQuantumSecurityLevel`, `executionEnvironment`, and `oid`.
- **Exploitability:** OpenVEX v0.2.0. One statement per finding, compatible with Grype, Trivy, Dependency-Track, ServiceNow VR.
- **NIST PQC:** FIPS 203 (ML-KEM / Kyber), FIPS 204 (ML-DSA / Dilithium), FIPS 205 (SLH-DSA / SPHINCS+).
- **Regulatory sources** (23 of them, each as a canonical Markdown file under `src/content/regulations/`): NIST SP 800-131A r3, SP 800-52 r2, SP 800-53 r5, SP 800-57 Pt1 r5, IR 8547; NSA CNSA 2.0; BSI TR-02102; NCSC-NL PQC factsheet; ANSSI PQC; NCSC-UK PQC; ENISA PQC 2024; GDPR Art. 32; NIS 2 Art. 21; DORA Art. 9; eIDAS 2; PCI DSS 4.0; HIPAA Security Rule; CMMC 2.0; SWIFT CSP; FTC Safeguards Rule.

Rules are generated from the Markdown frontmatter at build time (`npm run sync:regulations`); hand-edits to `src/lib/rules/*.generated.ts` are overwritten.

---

## Dev loop

```sh
npm install
npm run sync:regulations        # regenerate rule + citation tables from MD
npm run dev                     # Astro dev server (web app)
npm run qshield -- scan -o <alias>   # CLI against a live org
npm test                        # vitest (unit tests for rules, scanners, CBOM, VEX, CLI bridge)
npm run check                   # astro check (TypeScript + Svelte + Astro diagnostics)
```

Tests for the scan fixtures + a "poisoned" scratch-org bootstrap live under `salesforce/` — run `npm run capture:scan-fixtures` after standing the scratch org up to refresh the snapshot the browser uses for demo mode.

---

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full design: core decisions, scan categories, authoritative sources, scoring, report output, privacy model, and the dual web/CLI split.
