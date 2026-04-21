---
order: 70
title: CMMC 2.0 — cryptographic controls baseline
kind: overlay
implementationStatus: reference-only
citationKey: CMMC_2
overlayId: cmmc
overlayLabel: CMMC 2.0 — cryptographic controls
sourceId: cmmc-2
jurisdiction: US
documentVersion: '2.0'
section: SC.L2-3.13.8, SC.L2-3.13.11
retrievalUrl: https://dodcio.defense.gov/CMMC/Model/
lastReviewed: '2026-04-21'
updateCadence: quarterly
summary: Defense-supply-chain overlay for encryption-in-transit and cryptographic control baselines.
tags:
  - overlay
  - defense
  - us
requirements:
  - id: sc-l2-3-13-8
    title: Implement cryptographic mechanisms to prevent unauthorized disclosure
    mapping: Transit and trust-chain weaknesses can be framed here when protecting controlled information.
  - id: sc-l2-3-13-11
    title: Employ FIPS-validated cryptography when used to protect confidentiality
    mapping: Deprecated algorithms and insufficient key sizes are relevant evidence points.
---
This overlay is intentionally narrow and control-oriented.

Keep the requirement mapping aligned with CMMC/NIST 800-171 phrasing so future evidence exports can trace findings cleanly into defense compliance workflows.