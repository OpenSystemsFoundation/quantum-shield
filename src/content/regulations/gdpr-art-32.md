---
order: 10
title: GDPR Article 32 — security of processing
kind: overlay
implementationStatus: active
citationKey: GDPR_ART_32
overlayId: gdpr
overlayLabel: GDPR — security of processing (Art. 32)
sourceId: gdpr-art32
jurisdiction: EU
documentVersion: '2016/679'
section: Art. 32(1)(a)
retrievalUrl: https://eur-lex.europa.eu/eli/reg/2016/679/oj
lastReviewed: '2026-04-21'
updateCadence: quarterly
summary: Baseline EU requirement to apply state-of-the-art technical safeguards, including encryption and risk-appropriate cryptographic controls.
tags:
  - overlay
  - eu
  - privacy
requirements:
  - id: art-32-1-a
    title: Pseudonymisation and encryption
    mapping: Findings that expose weak, deprecated, or absent cryptographic protection for personal data map here.
  - id: art-32-1-d
    title: Regular testing and evaluation
    mapping: Recurrent scans and evidence trails support the expectation of ongoing review.
---
This document is the primary privacy overlay for QuantumShield.

We use it to translate cryptographic findings into GDPR language when the affected Salesforce configuration could expose personal data in transit, at rest, or through long-lived signatures and trust chains.

Update this document when EDPB guidance, national supervisory authority guidance, or jurisprudence changes how Article 32 is interpreted for encryption, key management, or state-of-the-art controls.