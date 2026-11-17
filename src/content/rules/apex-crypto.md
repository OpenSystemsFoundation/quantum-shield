---
order: 80
id: R-APEX-CRYPTO
title: Apex cryptography usage must avoid weak primitives and hardcoded material
summary: Branching Apex rule that covers weak hashes and MACs, SHA-1 signatures, hardcoded keys, unresolved algorithms, and quantum-vulnerable signatures.
description: Apex Crypto calls using weak hashes, hardcoded keys, algorithms that cannot be resolved statically, or quantum-vulnerable signatures require action.
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
        op: one-of
        values:
          - HMAC-MD5
          - HMAC-SHA1
    result:
      title: 'Apex uses {{asset.algorithm}} for message authentication'
      severity: high
      regulatoryStatus: deprecated-by-date
      migrationPosture: replace-now
      effort: low
      hndlExposure: false
      currentCrypto: '{{asset.algorithm}}'
      recommendedReplacement: Replace with Crypto.generateMac('hmacSHA256', ...) or hmacSHA512, and agree the change with the party that verifies the MAC.
      rationale: >-
        HMAC over SHA-1 or MD5 is not broken the way the bare digests are, and NIST SP 800-131A Rev. 2 still accepts HMAC-SHA-1 with a key of at least 112 bits. But NIST is retiring SHA-1 from every remaining use — NIST IR 8547 records it as deprecated and disallowed in validated modules after 2030 — MD5 was never a NIST-approved hash, and BSI TR-02102 recommends neither for MACs.
      citations:
        - NIST_SP_800_131A
        - NIST_IR_8547
        - BSI_TR_02102_1
      deadline: '2030-12-31'
  - when:
      - field: algorithm
        op: one-of
        values:
          - RSA-SHA1
          - ECDSA-SHA1
    result:
      title: 'Apex uses {{asset.algorithm}} signatures — SHA-1 signature generation is disallowed'
      severity: critical
      regulatoryStatus: already-non-compliant
      migrationPosture: replace-now
      effort: medium
      hndlExposure: false
      currentCrypto: '{{asset.algorithm}}'
      recommendedReplacement: >-
        Sign with Crypto.sign('RSA-SHA256', ...) or stronger today, and track the call for ML-DSA (FIPS 204) migration alongside the rest of the signature inventory. If the call only verifies signatures from a partner, ask the partner to re-sign with SHA-256.
      rationale: >-
        NIST SP 800-131A has disallowed SHA-1 for digital signature generation since the end of 2013; verifying existing SHA-1 signatures is permitted for legacy use only. The underlying RSA or ECDSA primitive is additionally deprecated after 2030 and disallowed after 2035 under NIST IR 8547. Note that in Apex, the algorithm name 'RSA' is an alias for RSA-SHA1.
      citations:
        - NIST_SP_800_131A
        - NIST_IR_8547
        - BSI_TR_02102_1
      deadline: '2013-12-31'
  - when:
      - field: algorithm
        op: one-of
        values:
          - MD5
    result:
      title: 'Apex computes MD5 digests'
      severity: critical
      regulatoryStatus: already-non-compliant
      migrationPosture: replace-now
      effort: low
      hndlExposure: false
      currentCrypto: MD5
      recommendedReplacement: Replace with Crypto.generateDigest('SHA-256', ...) or SHA3-256. If the digest is only a non-security checksum (cache key, change detection), record that decision so the next review does not have to rediscover it.
      rationale: >-
        MD5 was never a NIST-approved hash function (it is not in FIPS 180-4) and BSI TR-02102 excludes it. Collisions can be produced in seconds, so it gives no integrity or authenticity guarantee.
      citations:
        - NIST_SP_800_131A
        - BSI_TR_02102_1
  - when:
      - field: algorithm
        op: one-of
        values:
          - SHA-1
          - SHA1
    result:
      title: 'Apex computes SHA-1 digests'
      severity: high
      regulatoryStatus: deprecated-by-date
      migrationPosture: replace-now
      effort: low
      hndlExposure: false
      currentCrypto: SHA-1
      recommendedReplacement: Replace with Crypto.generateDigest('SHA-256', ...) or SHA3-256.
      rationale: >-
        A bare SHA-1 digest is not yet disallowed: NIST SP 800-131A Rev. 2 still accepts SHA-1 outside digital signatures. It is deprecated, though — NIST IR 8547 records SHA-1 as deprecated for all remaining uses and disallowed in validated modules after 2030 — and practical collision attacks are public, so it must not be relied on for collision resistance.
      citations:
        - NIST_SP_800_131A
        - NIST_IR_8547
        - BSI_TR_02102_1
      deadline: '2030-12-31'
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
        op: equals
        value: UNRESOLVED
    result:
      title: Apex crypto call with an algorithm that could not be resolved
      severity: low
      regulatoryStatus: advisory
      migrationPosture: advisory
      effort: low
      hndlExposure: false
      currentCrypto: Algorithm passed as a variable or expression; not resolvable by static scanning
      recommendedReplacement: >-
        Open the call site and confirm which algorithm reaches it at run time. If it can be MD5, SHA-1, an RSA or ECDSA signature, or AES below 256 bits, treat it like the corresponding finding. Prefer a constant so future scans can verify it.
      rationale: >-
        The algorithm argument of this Crypto call is a variable, parameter or expression, so QuantumShield could not determine which primitive is used. The call is listed so it is reviewed by a person instead of being silently counted as clean. NIST SP 800-57 expects an inventory of where and how cryptography is used.
      citations:
        - NIST_SP_800_57_PT1
  - when:
      - field: algorithm
        op: predicate
        predicate: quantum-vulnerable-signature
    result:
      title: 'Apex uses {{asset.algorithm}} signatures'
      severity: high
      regulatoryStatus: deprecated-by-date
      migrationPosture: plan-2030
      effort: medium
      hndlExposure: false
      currentCrypto: '{{asset.algorithm}}'
      recommendedReplacement: >-
        Plan migration to ML-DSA (FIPS 204). Where the relying party cannot yet accept PQ signatures, treat the asset as a tracked transition item and move to hybrid certificate or signature strategies as the surrounding platform permits.
      rationale: >-
        NIST IR 8547 deprecates RSA and ECDSA signatures after 2030 and disallows them under NIST standards after 2035; NSA CNSA 2.0 sets earlier dates for US national security systems. Salesforce does not yet expose FIPS 204 primitives in Apex, so the immediate requirement is inventory and partner-readiness planning. Signatures are not exposed to harvest-now-decrypt-later: forging one requires a quantum computer at the time of verification.
      citations:
        - NIST_IR_8547
        - NIST_FIPS_204
        - NSA_CNSA_2_0
      deadline: '2030-12-31'
---
The rule uses multiple ordered cases, all data-defined and reviewable in one document. Calls that use SHA-256 or stronger digests, HMAC-SHA256 or stronger, and AES-256 match no case: they are recorded in the cryptographic inventory (CBOM) without a finding.
