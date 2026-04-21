---
order: 200
title: Security and Privacy Controls for Information Systems and Organizations
kind: reference
implementationStatus: active
citationKey: NIST_SP_800_53
sourceId: NIST-SP-800-53-r5
jurisdiction: US
documentVersion: Rev 5
section: AC-12, SC-8, SC-12, SC-13, SA-15, SR-5
retrievalUrl: https://csrc.nist.gov/pubs/sp/800/53/r5/upd1/final
lastReviewed: '2026-04-21'
updateCadence: quarterly
summary: US control catalog for session handling, cryptographic protection, secure development, and supply-chain security across enterprise systems.
tags:
  - reference
  - us
  - nist
  - controls
requirements:
  - id: ac-12
    title: Session termination
    mapping: Long-lived Salesforce sessions and similar token windows map here.
  - id: sc-8-sc-13
    title: Transmission confidentiality and cryptographic protection
    mapping: Plaintext transport, key-handling weaknesses, and TLS remediation text can anchor here.
  - id: sa-15-sr-5
    title: Secure development and supply-chain protections
    mapping: Hardcoded secrets and opaque package risk can be framed through these controls.
---
This reference is intentionally broad because the rule catalog uses it as the main US control baseline for non-overlay findings.

Keep the control identifiers current when NIST publishes updates so future exports can map evidence cleanly to the US control family language.