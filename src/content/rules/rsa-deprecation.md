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
        Plan migration to ML-DSA (FIPS 204). Deploy a hybrid (classical + PQC) certificate at next rotation if partner endpoints do not yet support ML-DSA — ENISA and NCSC-NL both endorse hybrid as the transition pattern.
      rationale: >-
        RSA remains compliant today but is on the deprecation path. BSI TR-02102 recommends migration planning now; ENISA flags asymmetric signing and key transport as migration priorities because signed and encrypted artefacts are long-lived and harvestable.
      citations:
        - BSI_TR_02102_1
        - ENISA_PQC_2024
        - NCSC_NL_PQC
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
        Plan migration to ML-DSA (FIPS 204). Deploy a hybrid (classical + PQC) certificate at next rotation if partner endpoints do not yet support ML-DSA — ENISA and NCSC-NL both endorse hybrid as the transition pattern.
      rationale: >-
        RSA remains compliant today but is on the deprecation path. BSI TR-02102 recommends migration planning now; ENISA flags asymmetric signing and key transport as migration priorities because signed and encrypted artefacts are long-lived and harvestable.
      citations:
        - BSI_TR_02102_1
        - ENISA_PQC_2024
        - NCSC_NL_PQC
        - NIST_FIPS_204
      deadline: '2030-12-31'
---
This rule captures the migration window rather than current breakage.

If the migration date or recommended interim posture changes, the update belongs in this document instead of in application code.