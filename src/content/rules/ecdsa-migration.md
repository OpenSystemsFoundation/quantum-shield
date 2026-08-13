---
order: 30
id: R-ECDSA
title: ECDSA and ECC signatures require PQC migration planning
summary: Advisory-to-deprecation rule for elliptic-curve signing primitives.
description: ECDSA and related ECC signing primitives are compliant today but deprecated by the PQC horizon.
implementationStatus: active
appliesTo:
  - '*'
overlays:
  - nis2
  - dora
  - cmmc
tags:
  - ecdsa
  - ecc
  - pqc
cases:
  - when:
      - field: algorithm
        op: contains-any
        values:
          - ECDSA
          - ECC
    result:
      title: '{{asset.algorithm}} — plan PQC migration'
      severity: medium
      regulatoryStatus: deprecated-by-date
      migrationPosture: plan-2030
      effort: medium
      hndlExposure: true
      currentCrypto: '{{asset.algorithm}}{{#if asset.keySize}}-{{asset.keySize}}{{/if}}'
      recommendedReplacement: >-
        Plan migration to ML-DSA (FIPS 204). Where a hash-based signature profile is a better fit for long-lived verification, evaluate SLH-DSA (FIPS 205) and use hybrid certificate strategies while ecosystem support catches up.
      rationale: >-
        ECDSA and related ECC signatures remain compliant today, but NIST IR 8547 and NSA CNSA 2.0 place them on the quantum transition path. Signature inventories, certificate chains, and relying-party interoperability should be updated before the 2030 horizon.
      citations:
        - NIST_IR_8547
        - NSA_CNSA_2_0
        - NIST_FIPS_204
        - NIST_FIPS_205
      deadline: '2030-12-31'
---
Elliptic-curve rules are expressed declaratively here so new transition language or alternate replacement standards can be updated by editing the documentation.