---
order: 160
title: Module-Lattice-Based Digital Signature Standard (ML-DSA)
kind: reference
implementationStatus: active
citationKey: NIST_FIPS_204
sourceId: NIST-FIPS-204
jurisdiction: INTL
documentVersion: '2024-08'
retrievalUrl: https://csrc.nist.gov/pubs/fips/204/final
lastReviewed: '2026-04-21'
updateCadence: quarterly
summary: Canonical NIST replacement reference for digital-signature recommendations across certificates, SSO, and app trust chains.
tags:
  - reference
  - nist
  - pqc
requirements:
  - id: ml-dsa
    title: Approved PQC signature mechanism
    mapping: Referenced in remediation guidance for RSA and ECDSA signing surfaces.
---
This is the main replacement target for signature-focused findings.

When remediation text changes, update this source document first so the generated manifest stays aligned with the authoritative replacement standard.