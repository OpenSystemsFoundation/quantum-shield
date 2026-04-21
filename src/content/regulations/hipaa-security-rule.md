---
order: 60
title: HIPAA Security Rule — technical safeguards
kind: overlay
implementationStatus: reference-only
citationKey: HIPAA_SECURITY_RULE
overlayId: hipaa
overlayLabel: HIPAA Security Rule — technical safeguards
sourceId: hipaa-security-rule
jurisdiction: US
documentVersion: 45 CFR Part 164
section: 45 CFR §164.312
retrievalUrl: https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-C/part-164/subpart-C
lastReviewed: '2026-04-21'
updateCadence: quarterly
summary: Healthcare overlay for encryption, transmission security, and access-control evidence where Salesforce processes protected health information.
tags:
  - overlay
  - healthcare
  - us
requirements:
  - id: 164-312-a-2-iv
    title: Encryption and decryption
    mapping: Findings affecting confidentiality controls can be mapped here for PHI-handling workflows.
  - id: 164-312-e-2-ii
    title: Transmission security
    mapping: Plaintext and weak endpoint findings support transmission security evidence.
---
This document is present so the healthcare overlay can mature without reworking the docs architecture later.

If HIPAA-specific rule logic is added, update this file first and regenerate the manifest instead of editing overlay labels or source IDs in application code.