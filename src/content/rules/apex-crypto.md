---
order: 80
id: R-APEX-CRYPTO
title: Apex cryptography usage must avoid weak primitives and hardcoded material
summary: Branching Apex rule that covers weak hashes, hardcoded keys, and quantum-vulnerable signatures.
description: Apex crypto calls using weak hashes, hardcoded keys, or quantum-vulnerable signatures require action.
implementationStatus: active
appliesTo:
  - apex-call
overlays:
  - pci-dss-4
  - nis2
  - dora
  - hipaa
tags:
  - apex
  - crypto
  - source-review
cases:
  - when:
      - field: algorithm
        op: contains-any
        values:
          - HMAC-MD5
          - HMAC-SHA1
    result:
      title: 'Apex generates {{asset.algorithm}} MACs'
      severity: high
      regulatoryStatus: deprecated-by-date
      migrationPosture: replace-now
      effort: low
      hndlExposure: false
      currentCrypto: '{{asset.algorithm}}'
      recommendedReplacement: Replace with Crypto.generateMac('hmacSHA256', ...) or hmacSHA512.
      rationale: >-
        HMAC constructions over MD5 and SHA-1 are not broken the way the raw digests are, but NIST SP 800-131A Rev 3 retires all SHA-1 and MD5 based mechanisms, and BSI TR-02102 does not include them among recommended MAC mechanisms. Migrate MAC generation to SHA-256 or stronger before the 2030 retirement.
      citations:
        - NIST_SP_800_131A
        - BSI_TR_02102_1
      deadline: '2030-12-31'
  - when:
      - field: algorithm
        op: contains-any
        values:
          - RSA-SHA1
          - ECDSA-SHA1
    result:
      title: 'Apex signs with {{asset.algorithm}} — SHA-1 signatures are disallowed'
      severity: critical
      regulatoryStatus: already-non-compliant
      migrationPosture: replace-now
      effort: medium
      hndlExposure: true
      currentCrypto: '{{asset.algorithm}}'
      recommendedReplacement: >-
        Re-sign with Crypto.sign('RSA-SHA256', ...) today — SHA-1 signature generation has been disallowed since 2013 — and track the asset for ML-DSA (FIPS 204) migration alongside the rest of the signature inventory.
      rationale: >-
        NIST SP 800-131A disallows SHA-1 for digital signature generation, and the underlying RSA/ECDSA primitive is additionally on the post-quantum transition path under NIST IR 8547 and CNSA 2.0. Note that in Apex, Crypto.sign('RSA', ...) is an alias for RSA-SHA1.
      citations:
        - NIST_SP_800_131A
        - NIST_IR_8547
        - BSI_TR_02102_1
      deadline: '2010-12-31'
  - when:
      - field: algorithm
        op: contains-any
        values:
          - MD5
          - SHA-1
          - SHA1
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
        NIST SP 800-131A disallows MD5 and SHA-1 for security-relevant use, and BSI TR-02102 reaches the same conclusion.
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
        Move the key to a Named Credential or Protected Custom Setting. Maintain an owner and rotation procedure for the secret, and rotate it immediately because the current value must be treated as compromised.
      rationale: >-
        Hardcoded cryptographic keys bypass key-management controls and collapse the separation between code and keying material. Once source is exposed, the embedded key must be treated as compromised.
      citations:
        - NIST_SP_800_53
        - NIST_SP_800_57_PT1
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
        Plan migration to ML-DSA (FIPS 204). Where the relying party cannot yet accept PQ signatures, treat the asset as a tracked transition item and move to hybrid certificate or signature strategies as the surrounding platform permits.
      rationale: >-
        NIST IR 8547 and NSA CNSA 2.0 both put digital-signature migration on the near-term transition path. Salesforce does not yet expose FIPS 204 primitives in Apex, so the immediate requirement is inventory, shortened rotation, and partner-readiness planning.
      citations:
        - NIST_IR_8547
        - NIST_FIPS_204
        - NSA_CNSA_2_0
      deadline: '2030-12-31'
---
This is the most important proof that the rule system can stay docs-backed without becoming trivial. The rule uses multiple ordered cases, but all of them are still data-defined and reviewable in one document.