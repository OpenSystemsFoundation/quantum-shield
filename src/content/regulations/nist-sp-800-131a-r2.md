---
order: 180
title: Transitioning the Use of Cryptographic Algorithms and Key Lengths
kind: reference
implementationStatus: active
citationKey: NIST_SP_800_131A
sourceId: NIST-SP-800-131A-r2
jurisdiction: INTL
documentVersion: Rev 2
section: §3, §9, §10
retrievalUrl: https://csrc.nist.gov/pubs/sp/800/131/a/r2/final
lastReviewed: '2026-11-17'
updateCadence: quarterly
summary: Current-state transition baseline for disallowed and legacy-use algorithms, hash functions, and minimum acceptable key sizes.
tags:
  - reference
  - nist
  - transition
requirements:
  - id: disallowed-now
    title: Already disallowed or legacy algorithms
    mapping: Critical findings for SHA-1 signatures, short RSA keys, and similar current failures cite this baseline.
---
Revision 2 (March 2019) is the edition in force. It keeps RSA keys below 2048 bits and SHA-1 signature generation disallowed — both transitions took effect at the end of 2013 under the original 2011 edition — and still accepts SHA-1 outside digital signatures and HMAC with keys of at least 112 bits.

Revision 3 exists only as an initial public draft (October 2024) at the time of the last review. It proposes retiring SHA-1 and the 224-bit hash functions by the end of 2030 and moving from 112-bit to 128-bit security strength. Findings must not cite Rev. 3 for present-day prohibitions until it is final.

Keep this document current whenever NIST changes the status of specific algorithms or key-length classes.
