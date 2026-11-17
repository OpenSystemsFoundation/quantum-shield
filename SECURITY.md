# Security policy

QuantumShield is a security tool, so we take reports about its own security
seriously. Thank you for helping keep its users safe.

## Supported versions

QuantumShield is in beta and is distributed from source. Security fixes land
on `main` and in the next tagged release. Only the latest release and `main`
are supported; please reproduce on one of them before reporting.

| Version | Supported |
|---|---|
| `main` | Yes |
| Latest `v0.x` release | Yes |
| Older releases | No |

The hosted browser app at <https://quantumshield.opensf.foundation> is built
from `main` and is always in scope.

## Reporting a vulnerability

**Please do not open a public issue, discussion or pull request for a
security problem.**

Report it privately through GitHub:
**[Report a vulnerability](https://github.com/OpenSystemsFoundation/quantum-shield/security/advisories/new)**
(the *Security* tab of this repository → *Report a vulnerability*).

If you cannot use GitHub, email **info@opensf.foundation** with the subject
line `QuantumShield security` and we will move the conversation to a private
GitHub advisory.

A useful report includes:

- what is affected (CLI, browser app, hosted site, a generated artifact, the
  Salesforce seed project, CI/release pipeline) and the commit or version;
- steps to reproduce, or a proof of concept;
- the impact you see (for example: token exposure, data leaving the user's
  machine, a CSP bypass, code execution from crafted org metadata, a finding
  that is silently suppressed);
- any suggested fix.

Please do not include real customer org data, access tokens or credentials in
the report. Redacted or scratch-org data is fine.

## What to expect

This project is maintained by volunteers at the Open Systems Foundation, so
these are targets, not contractual guarantees:

- **Acknowledgement** within 3 working days.
- **Initial assessment** (accepted, needs more information, or not a
  vulnerability) within 10 working days.
- **Fix or mitigation** for accepted issues as fast as severity warrants;
  we aim for 30 days for high and critical issues and 90 days at most.

We coordinate disclosure with you: we publish a GitHub Security Advisory (and
request a CVE where appropriate) once a fix is released, and credit you unless
you prefer to stay anonymous. Please give us a reasonable chance to fix the
issue before disclosing it publicly; we ask for no more than 90 days.

## Scope

In scope:

- The `qshield` CLI and the shared scan engine under `src/lib/` and `cli/`.
- The static browser app and the hosted site, including its Content Security
  Policy and security headers (`public/_headers`).
- Generated artifacts (PDF, CycloneDX CBOM, OpenVEX, CSV, JSON), for example
  injection from crafted org metadata.
- The build, CI and release workflows under `.github/`.

Out of scope:

- Vulnerabilities in Salesforce itself; report those to
  [Salesforce](https://www.salesforce.com/company/disclosure/).
- Findings that the scanner reports correctly about *your* org.
- Missing detections or false positives without a security impact on the
  user; please open a normal issue for those.
- Volumetric denial of service against the hosted site, social engineering,
  and physical attacks.
- Reports produced only by automated scanners without a demonstrated impact.

## Safe harbour

We will not pursue or support legal action against anyone who researches and
reports in good faith under this policy: test only against orgs and systems
you own or are authorised to test, avoid privacy violations and service
disruption, and give us time to fix the issue before disclosure.

## Security design

How QuantumShield handles tokens, org data and the browser trust boundary is
documented in [ARCHITECTURE.md](./ARCHITECTURE.md#threat-model-cli-vs-browser)
and on the site's [security page](https://quantumshield.opensf.foundation/security).
Releases carry a CycloneDX SBOM and signed build-provenance attestations; see
[CONTRIBUTING.md](./CONTRIBUTING.md#verifying-a-release).
