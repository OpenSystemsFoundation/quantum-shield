---
order: 90
id: R-SESSION-LENGTH
title: Long session timeouts are a session-hygiene advisory
summary: Low-severity hygiene note for org session timeouts of eight hours or more. Not a cryptographic finding.
description: Flags an org-wide session timeout of eight hours or more as a hygiene advisory. It is not a cryptographic or post-quantum finding and carries no deadline.
implementationStatus: active
appliesTo:
  - session-settings
tags:
  - session
  - hygiene
  - advisory
cases:
  - when:
      - field: kind
        op: equals
        value: session-settings
      - field: location
        op: capture-number
        pattern: '(\d+)\s*minutes'
        capture: minutes
      - field: captures.minutes
        op: gte
        value: 480
    result:
      title: Session timeout is {{captures.minutes}} minutes — session-hygiene advisory
      severity: low
      regulatoryStatus: advisory
      migrationPosture: advisory
      effort: low
      hndlExposure: false
      currentCrypto: 'Session timeout: {{captures.minutes}} minutes (not a cryptographic setting)'
      recommendedReplacement: >-
        Consider a shorter timeout in Setup → Session Settings (for example 2 hours) and require re-authentication for privileged actions. Choose the value from your own access-control policy.
      rationale: >-
        A long session timeout lengthens the window in which a stolen session can be replayed. NIST SP 800-53 AC-12 requires sessions to be terminated under organisation-defined conditions; it sets no numeric limit, so this is a hygiene note rather than a compliance failure. It says nothing about the strength of the org's cryptography and is unrelated to the post-quantum transition.
      citations:
        - NIST_SP_800_53
---
This rule is kept as a low-severity hygiene note. Earlier versions rated it medium, cited NIS 2 and mapped it to PCI DSS and HIPAA; none of those sources sets a session-length limit, so those claims were removed.
