---
order: 20
id: R-RSA-2048
title: RSA at 2048 bits or more requires PQC migration planning
summary: Transition rule for RSA that is still acceptable today but needs scheduled replacement.
description: RSA at 2048 bits or more is approved today, deprecated after 2030 and disallowed after 2035 under NIST IR 8547.
implementationStatus: active
appliesTo:
  - '*'
overlays:
  - nis2
  - dora
  - cmmc
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
        RSA-{{asset.keySize}} remains approved today. NIST IR 8547 deprecates all quantum-vulnerable signature and key-establishment algorithms after 2030 and disallows them under NIST standards after 2035, whatever the key size; NSA CNSA 2.0 sets earlier dates for US national security systems only. Inventory the asset now so partner dependencies and certificate chains are ready before the 2030 deprecation.
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
        RSA-{{asset.keySize}} remains approved today. NIST IR 8547 deprecates all quantum-vulnerable signature and key-establishment algorithms after 2030 and disallows them under NIST standards after 2035, whatever the key size; NSA CNSA 2.0 sets earlier dates for US national security systems only. Inventory the asset now so partner dependencies and certificate chains are ready before the 2030 deprecation.
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
        op: missing
    result:
      title: RSA with an unknown key size — plan PQC migration
      severity: high
      regulatoryStatus: deprecated-by-date
      migrationPosture: plan-2030
      effort: medium
      hndlExposure: true
      currentCrypto: RSA (key size not exposed by the Salesforce API){{#if asset.signatureHash}} with {{asset.signatureHash}}{{/if}}
      recommendedReplacement: >-
        Confirm the key size of the underlying certificate in Setup and replace it if it is below 2048 bits. Then plan the migration with the rest of the RSA inventory: ML-DSA (FIPS 204) for signing, ML-KEM (FIPS 203) for key establishment, as soon as the platform and the counterparty support them.
      rationale: >-
        The configuration uses RSA, but the Salesforce API does not expose the key size here, so it could not be checked against the 2048-bit minimum. Whatever its size, NIST IR 8547 deprecates RSA after 2030 and disallows it under NIST standards after 2035.
      citations:
        - NIST_IR_8547
        - NSA_CNSA_2_0
        - NIST_FIPS_203
        - NIST_FIPS_204
      deadline: '2030-12-31'
---
This rule captures the migration window rather than current breakage.

If the migration date or recommended interim posture changes, the update belongs in this document instead of in application code.