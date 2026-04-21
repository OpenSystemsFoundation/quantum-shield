---
order: 210
title: 'Recommendation for Key Management: Part 1 - General'
kind: reference
implementationStatus: active
citationKey: NIST_SP_800_57_PT1
sourceId: NIST-SP-800-57-pt1-r5
jurisdiction: US
documentVersion: Part 1 Rev 5
retrievalUrl: https://csrc.nist.gov/pubs/sp/800/57/pt1/r5/final
lastReviewed: '2026-04-21'
updateCadence: quarterly
summary: US key-management baseline covering cryptographic lifecycles, key inventory, cryptoperiods, and protection of keying material.
tags:
  - reference
  - us
  - nist
  - key-management
requirements:
  - id: key-lifecycle
    title: Manage keying material across its full lifecycle
    mapping: Hardcoded keys, certificate rotation windows, and key-size transition guidance should trace here.
  - id: cryptoperiod
    title: Define and enforce cryptoperiods for certificates and keys
    mapping: Certificate-expiry and planned algorithm rotations use this source as the lifecycle baseline.
---
This is the main US key-management reference for findings that are about how keys are stored, rotated, and retired rather than about one algorithm alone.

When remediation guidance changes around cryptoperiods or key ownership, update this document before adjusting rule language elsewhere.