---
order: 10
id: R-RSA-1024
title: RSA below 2048 bits is already non-compliant
summary: Immediate failure rule for RSA keys below the minimum modern baseline.
description: RSA with key size below 2048 bits is already non-compliant today.
implementationStatus: active
appliesTo:
  - '*'
overlays:
  - pci-dss-4
  - nis2
  - dora
  - eidas2
tags:
  - rsa
  - key-size
  - current-failure
cases:
  - when:
      - field: algorithm
        op: equals
        value: RSA
      - field: keySize
        op: lt
        value: 2048
    result:
      title: RSA-{{asset.keySize}} in active use — already non-compliant
      severity: critical
      regulatoryStatus: already-non-compliant
      migrationPosture: replace-now
      effort: low
      hndlExposure: true
      currentCrypto: RSA-{{asset.keySize}}{{#if asset.signatureHash}} with {{asset.signatureHash}}{{/if}}
      recommendedReplacement: >-
        Replace the key now. Salesforce-generated certificates are offered at 2048 and 4096 bits only, so create a new 4096-bit certificate in Setup → Certificate and Key Management (or import a CA-signed one of at least 3072 bits) and repoint every integration that uses the old one. Post-quantum signatures (ML-DSA, FIPS 204) are not yet available for Salesforce certificates; track the replacement for that migration.
      rationale: >-
        RSA keys below 2048 bits provide less than 112 bits of security. NIST SP 800-131A has disallowed them for digital signature generation since the end of 2013 (Rev. 2 keeps them disallowed for signatures and key establishment), and BSI TR-02102 excludes them from its approved parameters. Use is a current compliance failure, independent of the post-quantum timeline.
      citations:
        - NIST_SP_800_131A
        - BSI_TR_02102_1
        - NIST_FIPS_204
      deadline: '2013-12-31'
---
This rule is intentionally strict and date-independent: if the platform still exposes RSA below 2048 bits, the scanner should emit an immediate non-compliance finding without needing a code release.

Keep remediation text and cited sources here so review of the rule logic happens in the same document as the rationale.