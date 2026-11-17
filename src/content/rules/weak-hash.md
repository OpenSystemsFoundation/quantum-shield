---
order: 40
id: R-WEAK-HASH
title: Weak signature hashes are already non-compliant
summary: Immediate failure rule for SHA-1, SHA1, MD5, and MD4 signature usage.
description: SHA-1 and MD5 class hashes are disallowed today for digital signatures.
implementationStatus: active
appliesTo:
  - '*'
overlays:
  - pci-dss-4
  - nis2
  - dora
  - gdpr
tags:
  - hash
  - integrity
  - current-failure
cases:
  - when:
      - field: signatureHash
        op: one-of
        values:
          - SHA-1
          - SHA1
          - MD5
          - MD4
    result:
      title: '{{asset.signatureHash}} signature in use — already non-compliant'
      severity: critical
      regulatoryStatus: already-non-compliant
      migrationPosture: replace-now
      effort: low
      hndlExposure: false
      currentCrypto: '{{asset.signatureHash}} signature'
      recommendedReplacement: >-
        Replace with SHA-256 or SHA-3. For signed assertions, reissue the signing certificate if the hash was baked into the signature.
      rationale: >-
        NIST SP 800-131A has disallowed SHA-1 for digital signature generation since the end of 2013 (Rev. 2 keeps it disallowed and permits verification for legacy use only). MD5 and MD4 were never NIST-approved hash functions. BSI TR-02102 excludes all of them. Practical collision attacks on SHA-1 are public; MD5 is broken for any security-relevant use.
      citations:
        - NIST_SP_800_131A
        - BSI_TR_02102_1
      deadline: '2013-12-31'
---
This rule is a direct current-state prohibition and should remain extremely conservative.