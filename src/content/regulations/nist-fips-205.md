---
order: 170
title: Stateless Hash-Based Digital Signature Standard (SLH-DSA)
kind: reference
implementationStatus: active
citationKey: NIST_FIPS_205
sourceId: NIST-FIPS-205
jurisdiction: INTL
documentVersion: '2024-08'
retrievalUrl: https://csrc.nist.gov/pubs/fips/205/final
lastReviewed: '2026-04-21'
updateCadence: quarterly
summary: Alternative NIST signature standard used where stateless hash-based signatures are the preferred remediation path.
tags:
  - reference
  - nist
  - pqc
requirements:
  - id: slh-dsa
    title: Alternative PQC signature mechanism
    mapping: Supports remediation guidance where hash-based signatures are more appropriate than ML-DSA.
---
This source is secondary to ML-DSA in current rules, but it should remain indexed because some customer environments will prefer its assurance trade-offs.