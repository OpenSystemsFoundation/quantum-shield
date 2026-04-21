---
order: 50
id: R-HTTP-ENDPOINT
title: Plaintext HTTP endpoints are immediate transport failures
summary: Current non-compliance rule for any endpoint still exposed over HTTP.
description: Plaintext HTTP endpoints fail current transport-security expectations.
implementationStatus: active
appliesTo:
  - '*'
tags:
  - transport
  - tls
  - current-failure
cases:
  - when:
      - field: endpointUrl
        op: protocol-equals
        value: 'http:'
    result:
      title: '{{asset.name}} uses plaintext HTTP'
      severity: high
      regulatoryStatus: already-non-compliant
      migrationPosture: replace-now
      effort: low
      hndlExposure: false
      currentCrypto: Plaintext HTTP — no TLS
      recommendedReplacement: >-
        Move the endpoint to HTTPS with TLS 1.2+ (TLS 1.3 preferred per BSI TR-02102). If the target service lacks TLS, terminate at a proxy or sidecar before exposing the callout.
      rationale: >-
        GDPR Art. 32 and NIS 2 Art. 21 require state-of-the-art protection of personal and operational data in transit. Plaintext HTTP is an immediate compliance failure for any processing of regulated data.
      citations:
        - GDPR_ART_32
        - NIS2
        - BSI_TR_02102_1
      deadline: '2018-05-25'
---
Transport failures need to be reviewable as policy, not hidden in code. This document is the source for both the logic and the remediation language.