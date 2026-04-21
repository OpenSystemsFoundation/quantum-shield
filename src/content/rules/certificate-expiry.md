---
order: 70
id: R-CERT-EXPIRY
title: Certificates inside the rotation window need action
summary: Operational hygiene rule for expired certificates and certificates expiring soon.
description: Certificates inside the 90-day window should be rotated and expired certificates should be flagged immediately.
implementationStatus: active
appliesTo:
  - certificate
tags:
  - certificate
  - rotation
  - hygiene
cases:
  - when:
      - field: expiresAt
        op: days-until-between
        min: -30
        max: -1
    result:
      title: Certificate expired
      severity: high
      regulatoryStatus: advisory
      migrationPosture: advisory
      effort: low
      hndlExposure: false
      currentCrypto: '{{asset.algorithm ?? Unknown}}{{#if asset.keySize}}-{{asset.keySize}}{{/if}}; expires {{asset.expiresAt}}'
      recommendedReplacement: >-
        Rotate before expiry. Consider issuing the replacement as a hybrid classical plus PQC certificate to validate PQC readiness in the partner chain.
      rationale: >-
        Operational hygiene. A forced rotation is an opportunity to trial PQC migration with minimal risk.
      citations:
        - ENISA_PQC_2024
      deadline: '{{computed.expiresAtDate}}'
  - when:
      - field: expiresAt
        op: days-until-between
        min: 0
        max: 90
    result:
      title: Certificate expires in {{computed.daysUntilExpiryCeil}} days
      severity: low
      regulatoryStatus: advisory
      migrationPosture: advisory
      effort: low
      hndlExposure: false
      currentCrypto: '{{asset.algorithm ?? Unknown}}{{#if asset.keySize}}-{{asset.keySize}}{{/if}}; expires {{asset.expiresAt}}'
      recommendedReplacement: >-
        Rotate before expiry. Consider issuing the replacement as a hybrid classical plus PQC certificate to validate PQC readiness in the partner chain.
      rationale: >-
        Operational hygiene. A forced rotation is an opportunity to trial PQC migration with minimal risk.
      citations:
        - ENISA_PQC_2024
      deadline: '{{computed.expiresAtDate}}'
---
This rule keeps a time-sensitive operational policy in documentation instead of in a hard-coded function.