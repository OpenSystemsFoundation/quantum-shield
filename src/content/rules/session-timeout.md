---
order: 90
id: R-SESSION-LENGTH
title: Long session lifetimes weaken upstream cryptographic protections
summary: Advisory rule that flags long Salesforce session lifetimes.
description: Session lifetime exceeding guidance should be flagged as a supporting exposure.
implementationStatus: active
appliesTo:
  - '*'
tags:
  - session
  - token
  - exposure-window
cases:
  - when:
      - field: name
        op: equals
        value: SessionSettings
      - field: location
        op: capture-number
        pattern: '(\d+)\s*h'
        capture: hours
      - field: captures.hours
        op: gte
        value: 8
    result:
      title: Session timeout exceeds NCSC-NL guidance
      severity: medium
      regulatoryStatus: advisory
      migrationPosture: advisory
      effort: low
      hndlExposure: false
      currentCrypto: 'Session lifetime: {{captures.hours}} hours'
      recommendedReplacement: >-
        Reduce session lifetime to 2 hours with idle timeout at 30 minutes. Require MFA for all user profiles handling personal data, per NCSC-NL and NIS 2 guidance.
      rationale: >-
        Long sessions extend the window for token theft and reduce the practical effectiveness of cryptographic controls upstream.
      citations:
        - NCSC_NL_PQC
        - NIS2
---
This rule shows how operational settings can still be encoded declaratively, including small captured values like the hour count parsed from the scanned location string.