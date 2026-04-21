---
order: 20
id: R-RSA-2048
title: RSA at 2048 or 3072 bits requires PQC migration planning
summary: Transition rule for RSA that is still acceptable today but needs scheduled replacement.
description: RSA-2048 and RSA-3072 remain usable today but are on the deprecation path.
implementationStatus: active
appliesTo:
  - '*'
tags:
  - rsa
  - migration
  - pqc
cases:
  - when:
      - field: algorithm
        op: equals
        value: RSA
      - field: keySize
        op: between
        min: 2048
        max: 3071
    result:
      title: RSA-{{asset.keySize}} — plan PQC migration
      severity: high
      regulatoryStatus: deprecated-by-date
      migrationPosture: plan-2030
      effort: medium
      hndlExposure: true
      currentCrypto: RSA-{{asset.keySize}}{{#if asset.signatureHash}} with {{asset.signatureHash}}{{/if}}
      recommendedReplacement: >-
        Plan migration at the next major rotation window. For signing uses, target ML-DSA (FIPS 204); for key-establishment uses, target ML-KEM (FIPS 203). Where partner ecosystems are not yet ready, deploy hybrid certificates or dual-stack handshakes during the transition.
      rationale: >-
        RSA-{{asset.keySize}} remains usable today, but NIST IR 8547 and NSA CNSA 2.0 treat RSA-based signatures and key establishment as transition priorities. Inventory the asset now so partner dependencies and certificate chains are ready before the PQC deadline.
      citations:
        - NIST_IR_8547
        - NSA_CNSA_2_0
        - NIST_FIPS_203
        - NIST_FIPS_204
      deadline: '2030-12-31'
  - when:
      - field: algorithm
        op: equals
        value: RSA
      - field: keySize
        op: gte
        value: 3072
    result:
      title: RSA-{{asset.keySize}} — plan PQC migration
      severity: medium
      regulatoryStatus: deprecated-by-date
      migrationPosture: plan-2030
      effort: medium
      hndlExposure: true
      currentCrypto: RSA-{{asset.keySize}}{{#if asset.signatureHash}} with {{asset.signatureHash}}{{/if}}
      recommendedReplacement: >-
        Plan migration at the next major rotation window. For signing uses, target ML-DSA (FIPS 204); for key-establishment uses, target ML-KEM (FIPS 203). Where partner ecosystems are not yet ready, deploy hybrid certificates or dual-stack handshakes during the transition.
      rationale: >-
        RSA-{{asset.keySize}} remains usable today, but NIST IR 8547 and NSA CNSA 2.0 treat RSA-based signatures and key establishment as transition priorities. Inventory the asset now so partner dependencies and certificate chains are ready before the PQC deadline.
      citations:
        - NIST_IR_8547
        - NSA_CNSA_2_0
        - NIST_FIPS_203
        - NIST_FIPS_204
      deadline: '2030-12-31'
---
This rule captures the migration window rather than current breakage.

If the migration date or recommended interim posture changes, the update belongs in this document instead of in application code.