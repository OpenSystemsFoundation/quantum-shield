---
order: 20
title: NIS 2 Directive — cybersecurity risk-management measures
kind: overlay
implementationStatus: active
citationKey: NIS2
overlayId: nis2
overlayLabel: NIS 2 — risk-management measures (Art. 21)
sourceId: nis2-directive
jurisdiction: EU
documentVersion: '2022/2555'
section: Art. 21(2)(h)
retrievalUrl: https://eur-lex.europa.eu/eli/dir/2022/2555/oj
lastReviewed: '2026-04-21'
updateCadence: quarterly
summary: EU cyber-risk-management overlay used where cryptographic weaknesses materially affect resilience, supply chain, or operational security obligations.
tags:
  - overlay
  - eu
  - resilience
requirements:
  - id: art-21-2-h
    title: Encryption and cryptography
    mapping: Weak hashes, deprecated asymmetric crypto, and plaintext endpoints map directly to the explicit encryption control requirement.
  - id: art-21-2-d
    title: Supply-chain security
    mapping: Third-party package visibility and externally facing trust chains provide supporting evidence for supplier-risk review.
---
QuantumShield uses this directive as the operational cyber-resilience overlay for EU-regulated customers.

It is not a cryptography standard by itself. Instead, it tells us when technical findings should be framed as governance and risk-management gaps that require planned remediation, documented ownership, and evidence retention.