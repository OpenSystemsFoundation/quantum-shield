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
        Rotate immediately to ML-DSA (FIPS 204) for signing or ML-KEM (FIPS 203) for key transport. If interoperability blocks PQC adoption, RSA-3072 with SHA-256 is the minimum acceptable interim step.
      rationale: >-
        RSA key lengths below 2048 bits are disallowed under NIST SP 800-131A Rev 3 and excluded from BSI TR-02102 approved parameters. Use is a current compliance failure, independent of the post-quantum timeline.
      citations:
        - NIST_SP_800_131A
        - BSI_TR_02102_1
        - NIST_FIPS_204
      deadline: '2020-12-31'
---
This rule is intentionally strict and date-independent: if the platform still exposes RSA below 2048 bits, the scanner should emit an immediate non-compliance finding without needing a code release.

Keep remediation text and cited sources here so review of the rule logic happens in the same document as the rationale.