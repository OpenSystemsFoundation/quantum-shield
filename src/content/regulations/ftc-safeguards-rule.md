---
order: 240
title: FTC Safeguards Rule - Standards for Safeguarding Customer Information
kind: reference
implementationStatus: reference-only
citationKey: FTC_SAFEGUARDS
sourceId: FTC-Safeguards-Rule
jurisdiction: US
documentVersion: 16 CFR Part 314
section: 16 CFR 314.3, 314.4(c), 314.4(f)
retrievalUrl: https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-314
lastReviewed: '2026-04-21'
updateCadence: quarterly
summary: US financial-sector reference for written information security programs, encryption, secure development, MFA, and service-provider oversight.
tags:
  - reference
  - us
  - ftc
  - financial-services
requirements:
  - id: 314-4-c-3
    title: Protect customer information by encryption in transit and at rest
    mapping: Transport and key-handling findings can be cross-mapped here when the deployment handles covered customer information.
  - id: 314-4-f
    title: Oversee service providers and third-party safeguards
    mapping: Third-party package and vendor-roadmap findings can use this reference in FTC-regulated environments.
---
This reference is intentionally present as US market context, but it should not be treated as a global citation outside FTC-regulated financial institutions.

If future overlays need sector-specific rule logic, start from this document rather than hardcoding FTC-specific behavior into application code.