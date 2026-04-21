---
order: 180
title: Transitioning the Use of Cryptographic Algorithms and Key Lengths
kind: reference
implementationStatus: active
citationKey: NIST_SP_800_131A
sourceId: NIST-SP-800-131A-r3
jurisdiction: INTL
documentVersion: Rev 3
section: §5.6.1, §6.2.1
retrievalUrl: https://csrc.nist.gov/pubs/sp/800/131/a/r3/final
lastReviewed: '2026-04-21'
updateCadence: quarterly
summary: Current-state transition baseline for disallowed hashes, deprecated algorithms, and minimum acceptable key sizes.
tags:
  - reference
  - nist
  - transition
requirements:
  - id: disallowed-now
    title: Already disallowed or legacy algorithms
    mapping: Critical findings for SHA-1, MD5, short RSA keys, and similar current failures cite this baseline.
---
This is the strongest source for present-day compliance failures that are already unacceptable before the post-quantum deadline arrives.

Keep this document current whenever NIST changes the status of specific algorithms or key-length classes.