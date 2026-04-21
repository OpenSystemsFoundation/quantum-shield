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
      title: Session timeout exceeds NIST session-termination guidance
      severity: medium
      regulatoryStatus: advisory
      migrationPosture: advisory
      effort: low
      hndlExposure: false
      currentCrypto: 'Session lifetime: {{captures.hours}} hours'
      recommendedReplacement: >-
        Reduce session lifetime to 2 hours with idle timeout at 30 minutes or less. Reauthenticate for privileged or high-risk actions so token theft windows do not persist for most of a workday.
      rationale: >-
        NIST SP 800-53 AC-12 treats session termination as a baseline control. Long-lived Salesforce sessions expand the replay window after credential theft or device compromise and weaken upstream cryptographic protections.
      citations:
        - NIST_SP_800_53
---
This rule shows how operational settings can still be encoded declaratively, including small captured values like the hour count parsed from the scanned location string.