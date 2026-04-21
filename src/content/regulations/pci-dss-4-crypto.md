---
order: 50
title: PCI DSS 4.0 — cryptography and key-management requirements
kind: overlay
implementationStatus: reference-only
citationKey: PCI_DSS_4
overlayId: pci-dss-4
overlayLabel: PCI DSS 4.0 — cryptography and key management
sourceId: pci-dss-4
jurisdiction: INTL
documentVersion: '4.0.1'
section: Req. 3.5–3.7
retrievalUrl: https://docs-prv.pcisecuritystandards.org/PCI%20DSS/Standard/PCI-DSS-v4_0_1.pdf
lastReviewed: '2026-04-21'
updateCadence: quarterly
summary: Payment-security overlay for key management, strong cryptography, and certificate hygiene where Salesforce touches cardholder workflows.
tags:
  - overlay
  - payments
  - intl
requirements:
  - id: req-3-5
    title: Key protection and lifecycle management
    mapping: Hardcoded keys, weak key sizes, and unmanaged signing materials map here.
  - id: req-4
    title: Strong cryptography in transit
    mapping: HTTP endpoints and weak trust chains support transit protection findings.
---
This overlay is reference-only until the rules engine grows payment-specific mappings.

Keep the requirement anchors concise and implementation-oriented so future rule additions can cite them directly without duplicating standard text in code.