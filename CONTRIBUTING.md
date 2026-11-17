# Contributing to QuantumShield

Thanks for helping. QuantumShield is a free, Apache-2.0 project of the
[Open Systems Foundation](https://opensf.foundation), and contributions of all
sizes are welcome: bug reports, corrections to a rule or a deadline, new
regulatory sources, documentation, and code.

By taking part you agree to follow the [Code of Conduct](./CODE_OF_CONDUCT.md).
**Security problems are not reported in issues**: see [SECURITY.md](./SECURITY.md).

## Ways to help

- **Report a bug** with the bug report form. Include the command or page, what
  you expected, what happened, and the coverage section of the report if a
  scan is involved. Remove org names, usernames and tokens first.
- **Correct a rule or a citation.** Findings must trace to a primary source.
  Open an issue with the *Rule or source correction* form and link the
  section of the standard that supports the change.
- **Propose a feature** with the feature request form. QuantumShield is
  deliberately read-only, backend-free and CLI-first; see
  [Design principles](#design-principles) before proposing something that
  changes that.
- **Improve the docs**: `README.md`, `ARCHITECTURE.md`, the `/install` and
  `/security` pages, and the rule and regulation pages under `src/content/`.

## Development setup

Requirements: Node.js ≥ 22.12 and npm. The Salesforce CLI (`sf`) is only
needed to run real scans.

```sh
git clone https://github.com/OpenSystemsFoundation/quantum-shield.git
cd quantum-shield
npm install
npm run dev            # browser app on http://localhost:4321
npm run qshield -- help
```

`npm run dev` uses `.env.development`, which turns on a mock sign-in so you can
click through the browser app without a Salesforce org. The `/demo` page shows
a sample report from bundled fixtures.

To test against a real org, use a scratch org seeded from `salesforce/`
(see [salesforce/README.md](./salesforce/README.md)) rather than a production
org.

## Before you open a pull request

Run the same checks CI runs:

```sh
npm run sync:regulations             # regenerate rule/regulation tables
npx tsc --noEmit -p tsconfig.json    # typecheck web + engine
npx tsc --noEmit -p tsconfig.cli.json  # typecheck the CLI
npm test                             # unit tests
npm run build                        # production build
```

Also run, when relevant:

- `npm run check` for Astro/Svelte diagnostics.
- `npm run test:e2e` (Playwright) for browser UX changes. It is not run in CI.
- `npm run design:lint` if you change `DESIGN.md` or visual styling.

## Pull request guidelines

- Keep each pull request focused on one change, and describe what changed and
  how you verified it. The pull request template has a short checklist.
- Add or update unit tests for rule, scanner, CLI and artifact changes.
- Add a line under `## [Unreleased]` in [CHANGELOG.md](./CHANGELOG.md) for any
  user-visible change.
- Keep public claims consistent across `README.md`, `ARCHITECTURE.md`, the site
  copy, and the rule and regulation content.
- Do not edit `*.generated.ts` files by hand; change the Markdown source and
  run `npm run sync:regulations`.
- Do not commit credentials, access tokens, real org data, or local tool
  settings.

### Rules and regulatory sources

Rules live in `src/content/rules/*.md` and regulatory sources in
`src/content/regulations/*.md`. The YAML frontmatter is the source of truth:
the build turns it into the tables under `src/lib/rules/`. When you add or
change a rule:

- cite at least one primary source (NIST, NSA, BSI, ANSSI, NCSC, ENISA, the
  regulation itself), with the exact section where possible;
- set severity, regulatory status and migration posture from what the source
  says, not from how alarming the finding sounds;
- never let a rule depend on a value the Salesforce API does not expose. If
  the API does not report a key size or algorithm, the scanner records the
  asset without it and no rule that needs it fires.

### Design principles

These are product decisions, so a change to them needs an issue and a
maintainer's agreement before code:

- **Read-only.** The scanner never writes to a Salesforce org.
- **No backend.** No server code, no storage of org data, no analytics, no
  third-party requests from the site.
- **User-owned credentials.** No shared Connected App; the browser app uses an
  External Client App or Connected App the user creates, the CLI reuses the
  `sf` session.
- **Honest coverage.** "We could not check" must never render as "clean".

## Commit messages

Use the imperative mood in the subject line ("Fix SHA-1 detection in signXML"),
keep it under about 72 characters, and explain the *why* in the body when it
is not obvious.

## Licensing of contributions

QuantumShield is licensed under the [Apache License 2.0](./LICENSE). Under
section 5 of that licence, any contribution you intentionally submit is
licensed under the same terms, without additional conditions. You keep your
copyright. Only submit work you have the right to contribute.

## Releases

Maintainers cut releases by bumping `version` in `package.json` and
`QSHIELD_VERSION` in `src/lib/version.ts`, moving the `[Unreleased]` changelog
entries under the new version, and pushing a `vX.Y.Z` tag. The release
workflow builds the site, generates a CycloneDX SBOM, attests build
provenance, and publishes the GitHub Release.

### Verifying a release

Every release asset has a signed build-provenance attestation, and the SBOM has
an SBOM attestation. With the [GitHub CLI](https://cli.github.com):

```sh
gh attestation verify quantum-shield-v0.1.0-site.tar.gz \
  --repo OpenSystemsFoundation/quantum-shield
gh attestation verify quantum-shield-v0.1.0.cdx.json \
  --repo OpenSystemsFoundation/quantum-shield
```

## Questions

Open an issue, or browse the docs at
<https://quantumshield.opensf.foundation/install>.
