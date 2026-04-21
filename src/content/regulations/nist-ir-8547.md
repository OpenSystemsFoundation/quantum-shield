---
order: 220
title: Transition to Post-Quantum Cryptography Standards
kind: reference
implementationStatus: active
citationKey: NIST_IR_8547
sourceId: NIST-IR-8547
jurisdiction: US
documentVersion: Initial Public Draft
retrievalUrl: https://csrc.nist.gov/pubs/ir/8547/ipd
lastReviewed: '2026-04-21'
updateCadence: monthly
summary: NIST transition-planning draft for moving products, services, and infrastructure from quantum-vulnerable public-key algorithms to approved PQC standards.
tags:
  - reference
  - us
  - nist
  - pqc
  - transition
requirements:
  - id: pqc-transition-plan
    title: Inventory and transition quantum-vulnerable standards
    mapping: RSA, ECDSA, package exposure, and certificate-renewal findings use this document for US migration framing.
  - id: product-service-timelines
    title: Plan migration for products, services, and infrastructure
    mapping: Vendor roadmap and platform-readiness guidance should cite this document when immediate replacement is unavailable.
---
This is a draft, but it is the clearest NIST transition-planning document for products and services that still depend on RSA or ECC.

Review it promptly when NIST publishes a final or revised edition so migration deadlines and language stay aligned with the current US transition plan.