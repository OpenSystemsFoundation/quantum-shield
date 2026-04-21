---
order: 80
id: R-APEX-CRYPTO
title: Apex cryptography usage must avoid weak primitives and hardcoded material
summary: Branching Apex rule that covers weak hashes, hardcoded keys, and quantum-vulnerable signatures.
description: Apex crypto calls using weak hashes, hardcoded keys, or quantum-vulnerable signatures require action.
implementationStatus: active
appliesTo:
  - apex-call
tags:
  - apex
  - crypto
  - source-review
cases:
  - when:
      - field: algorithm
        op: contains-any
        values:
          - MD5
          - SHA-1
    result:
      title: 'Apex uses {{asset.algorithm}}'
      severity: critical
      regulatoryStatus: already-non-compliant
      migrationPosture: replace-now
      effort: low
      hndlExposure: false
      currentCrypto: '{{asset.algorithm ?? weak hash}}'
      recommendedReplacement: Replace with Crypto.generateDigest('SHA-256', ...) or SHA-3.
      rationale: >-
        MD5 and SHA-1 are disallowed for security-relevant use under SP 800-131A and BSI TR-02102.
      citations:
        - NIST_SP_800_131A
        - BSI_TR_02102_1
      deadline: '2010-12-31'
  - when:
      - field: algorithm
        op: contains-any
        values:
          - HARDCODED
    result:
      title: Hardcoded cryptographic key in Apex
      severity: critical
      regulatoryStatus: already-non-compliant
      migrationPosture: replace-now
      effort: low
      hndlExposure: false
      currentCrypto: Hardcoded key material in source
      recommendedReplacement: >-
        Move the key to a Named Credential or Protected Custom Setting. Rotate the key immediately — the current value must be treated as compromised.
      rationale: >-
        Hardcoded cryptographic keys violate GDPR Art. 32 state-of-the-art requirements. Apex source is accessible to any user with View All Data or developer access.
      citations:
        - GDPR_ART_32
        - NIS2
      deadline: '2018-05-25'
  - when:
      - field: algorithm
        op: predicate
        predicate: quantum-vulnerable-signature
    result:
      title: 'Apex signs with {{asset.algorithm}}'
      severity: high
      regulatoryStatus: deprecated-by-date
      migrationPosture: plan-2030
      effort: medium
      hndlExposure: true
      currentCrypto: '{{asset.algorithm}}'
      recommendedReplacement: >-
        Plan migration to ML-DSA once Salesforce exposes native PQC primitives. Track as a PQC-migration asset and shorten rotation cadence in the interim.
      rationale: >-
        Salesforce does not yet expose FIPS 204 primitives via Apex, so immediate replacement is not possible. Record the asset and migrate at platform-readiness.
      citations:
        - ENISA_PQC_2024
        - NIST_FIPS_204
      deadline: '2030-12-31'
---
This is the most important proof that the rule system can stay docs-backed without becoming trivial. The rule uses multiple ordered cases, but all of them are still data-defined and reviewable in one document.