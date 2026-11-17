---
name: quantumshield
description: Scan a Salesforce org for post-quantum cryptography risk with the qshield CLI and explain the results. Use when asked to check an org (production, sandbox or scratch) for quantum readiness, harvest-now-decrypt-later exposure, weak certificates or TLS, or to produce a CBOM, OpenVEX, PDF or CSV crypto report.
---

# QuantumShield (`qshield`) for agents

`qshield` is a read-only, local CLI that scans a Salesforce org's cryptography
(certificates, Connected Apps, Named Credentials, Remote Sites, SSO, Shield
Platform Encryption, Apex crypto, session settings, packages, and optionally
live TLS endpoints) and writes a PDF, a CycloneDX CBOM, OpenVEX, CSV and a full
JSON report. It reuses the Salesforce CLI (`sf`) session that is already on the
machine. Nothing is uploaded anywhere and nothing is written to the org.

Every command is non-interactive. Pass `--json` and stdout carries exactly one
JSON document, success or failure; progress and logs never go to stdout.

## 1. Run it

Pick the first that works:

```sh
# inside a clone of this repository (after `npm install`)
npm run --silent qshield -- <command> [flags]

# anywhere, no clone (needs Node >= 22.23.4)
npx -y github:OpenSystemsFoundation/quantum-shield <command> [flags]

# if installed globally (`npm install -g .` from a clone)
qshield <command> [flags]
```

Below, `qshield` stands for whichever form you use. Use `npm run --silent` so
npm's own banner does not end up on stdout in front of the JSON.

## 2. Check readiness first

```sh
qshield doctor --json                       # default sf org
qshield doctor --target-org <alias> --json  # a specific org
```

Read `ok`, then each entry in `checks` (`node`, `sf-cli`, `orgs`,
`target-org`); a failed check has a `fix`. `orgs` lists every org `sf` knows
(alias, username, `isDefault`, `isScratch`, `isSandbox`).

- **No authenticated org.** `sf org login web --alias <name>` opens a browser,
  so ask the user to run it; do not try to complete a browser login yourself.
  Headless alternatives the user may already have set up: `sf org login jwt`,
  `sf org login sfdx-url`, or a scratch org from `sf org create scratch`.
- **Several orgs and the user did not say which.** Ask, or prefer a sandbox or
  scratch org over production. Never guess production.

## 3. Scan

```sh
qshield scan --target-org <alias> --json
```

Useful flags:

| Flag | Use |
|---|---|
| `--target-org, -o <alias>` | Org to scan (default: sf's default org, or `SF_TARGET_ORG`). |
| `--out, -O <dir>` | Output directory (default `./qshield-out`). |
| `--format pdf,cbom,vex,csv,json` | Limit outputs. Keep `json` if you will read details. |
| `--fail-on <critical\|high\|medium\|low>` | Exit 4 when any finding is at or above that severity. |
| `--probe-tls` | Also handshake with each external endpoint (makes network connections from this machine; mention it to the user). |
| `--region US,EU,NL,DE,FR,UK,INTL` | Which jurisdictions' citations to show. Never changes findings. |
| `--overlay gdpr,dora,nis2,eidas2,pci-dss-4,hipaa,cmmc,swift-csp` | Regulatory overlays for the appendix. |
| `--allow-partial` | Treat partial coverage as success (exit 0 instead of 3). |

A scan of a small org takes well under a minute. Run `qshield help scan` for
everything.

## 4. Exit codes (stable)

| Code | Meaning | What to do |
|---|---|---|
| 0 | Scan complete, full coverage. | Report the results. |
| 2 | Usage error. | Read `error.message` / `error.details`, fix the flags, retry once. |
| 3 | Report written, some categories `partial` or `failed`. | Report results **and** list `coverage.incomplete`. Usually the user lacks a permission. |
| 4 | Report written, `--fail-on` threshold met. | Report results; this is a finding, not a tool failure. |
| 10 | Auth: `sf` missing, unknown alias, expired session, no org. | Run `doctor --json`, then ask the user to log in. Do not retry in a loop. |
| 20 | Scan aborted or no output could be written. | Show `error.message`; check the `--out` directory is writable. |
| 1 | Internal error. | Re-run with `QSHIELD_DEBUG=1` and show the stack trace on stderr. |

On failure with `--json`, stdout is `{"schema":"qshield.error/v1","ok":false,
"exitCode":N,"error":{"code","message","hint"}}`. Error codes: `USAGE`,
`AUTH_FAILED`, `SF_CLI_MISSING`, `SCAN_ABORTED`,
`INTERNAL`.

## 5. Read the result

The scan result (`schema: "qshield.scan-result/v1"`) has:

- `org`: id, name, type (`production | sandbox | developer | scratch`).
- `summary`: `totalFindings`, `bySeverity`, `byCategory`, `hndlFindings`,
  `earliestDeadline`, and `postureSentence` (a one-line verdict you can quote).
- `coverage`: `complete`, `incomplete[]` and `skipped[]`. **A category that is
  not fully scanned is unverified: zero findings there does not mean it is
  clean.** `skipped` means the feature is not available in the org (for
  example Shield not provisioned), which is fine.
- `topFindings`: the 10 most urgent findings, already ranked.
- `files`: paths of everything written. The `*.report.json` file has every
  finding with rationale and citations; the PDF is for humans.

Finding fields worth explaining to the user:

- `severity`: `critical | high | medium | low`.
- `hndlExposure`: true when traffic or data protected by this crypto can be
  recorded today and decrypted later by a quantum computer ("harvest now,
  decrypt later"). Only encryption and key exchange qualify; signatures do not.
  These come first when data has a long shelf life.
- `migrationPosture`: `replace-now` (already weak today), `plan-2030`,
  `prepare-2033`, or `advisory`.
- `regulatoryStatus`: `already-non-compliant`, `deprecated-by-date`,
  `disallowed-by-date`, or `advisory`; `deadline` is the date it applies.
- `currentCrypto` → `recommendedReplacement`: what to change it to.
- `effort`: `low | medium | high` rough migration effort.
- `priority` (present when the report carries risk prioritization): its
  `band` (`act-now | plan | monitor`) and `reason` take precedence over raw
  severity when you summarise what to fix first.

## 6. Report back

Give the user, in this order:

1. The `postureSentence` and the org you scanned.
2. Counts by severity and the HNDL count.
3. The top 3 to 5 findings: what, which asset, why, and the replacement.
4. Any incomplete coverage, named, with the likely cause.
5. Where the files are (PDF for people, CBOM/VEX for tooling).

## Rules

- Read-only. qshield never writes to the org; you should not either as part
  of a scan. Do not change org settings to "fix" findings unless the user asks
  for that separately.
- Never print, log or paste the access token, `sf org display --verbose`
  output, or an sfdx auth URL.
- Do not upload report files anywhere unless the user asks. They describe the
  org's security setup.
- Do not claim an org is "quantum safe". Report what was found and what was
  not covered.
- For CI, use `qshield scan --json --fail-on high --format json,vex` and gate
  on exit code 4. Keep `--allow-partial` off unless the user accepts gaps.
