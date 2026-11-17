---
order: 70
id: R-CERT-EXPIRY
title: Certificates inside the rotation window need action
summary: Operational hygiene rule for expired certificates and certificates expiring soon.
description: Certificates inside the 90-day window should be rotated; expired certificates are flagged however long ago they expired.
implementationStatus: active
appliesTo:
  - certificate
overlays:
  - pci-dss-4
  - eidas2
tags:
  - certificate
  - rotation
  - hygiene
cases:
  - when:
      - field: expiresAt
        op: days-until-between
        min: -1000000
        max: 0
    result:
      title: Certificate expired on {{computed.expiresAtDate}}
      severity: high
      regulatoryStatus: advisory
      migrationPosture: advisory
      effort: low
      hndlExposure: false
      currentCrypto: '{{asset.algorithm ?? Unknown}}{{#if asset.keySize}}-{{asset.keySize}}{{/if}}; expires {{asset.expiresAt}}'
      recommendedReplacement: >-
        Replace the certificate now, or delete it if nothing references it. Check every integration, SSO configuration and Named Credential that uses it — connections relying on an expired certificate fail or are rejected by the counterparty.
      rationale: >-
        The certificate is past its validity period. NIST SP 800-57 treats the end of a key's cryptoperiod as the point at which it must be replaced; an expired certificate left in place either breaks the integration or signals that expiry is not being checked.
      citations:
        - NIST_SP_800_57_PT1
        - BSI_TR_02102_1
        - EIDAS2
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
        Rotate before expiry. Use the scheduled renewal window to validate hybrid certificate issuance or other PQC-ready trust-chain changes where counterparties allow it.
      rationale: >-
        Scheduled certificate renewal is a standard key-management event under NIST SP 800-57 and a low-risk point to exercise PQC transition playbooks described in NIST IR 8547.
      citations:
        - NIST_SP_800_57_PT1
        - BSI_TR_02102_1
        - EIDAS2
        - NIST_IR_8547
      deadline: '{{computed.expiresAtDate}}'
---
This rule keeps a time-sensitive operational policy in documentation instead of in a hard-coded function.