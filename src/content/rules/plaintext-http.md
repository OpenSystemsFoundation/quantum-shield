---
order: 50
id: R-HTTP-ENDPOINT
title: Plaintext HTTP endpoints are immediate transport failures
summary: Current non-compliance rule for any endpoint still exposed over HTTP.
description: Plaintext HTTP endpoints fail current transport-security expectations.
implementationStatus: active
appliesTo:
  - '*'
overlays:
  - gdpr
  - nis2
  - dora
  - pci-dss-4
  - hipaa
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
      currentCrypto: Plaintext HTTP - no TLS
      recommendedReplacement: >-
        Move the endpoint to HTTPS with TLS 1.2 or later, and prefer TLS 1.3 when both sides support it. If the target service lacks TLS, terminate the connection behind a managed proxy before exposing the callout.
      rationale: >-
        NIST SP 800-52 Rev. 2 and SP 800-53 treat protected transport and cryptographic protection as baseline controls, and GDPR Art. 32 and NIS 2 Art. 21 require encryption of data in transit as a state-of-the-art measure. Plaintext HTTP leaves data and credentials exposed in transit and is not an acceptable steady-state configuration in any jurisdiction.
      citations:
        - NIST_SP_800_52
        - NIST_SP_800_53
        - GDPR_ART_32
        - NIS2
---
Transport failures need to be reviewable as policy, not hidden in code. This document is the source for both the logic and the remediation language.