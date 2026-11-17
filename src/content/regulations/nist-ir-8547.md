---
order: 220
title: Transition to Post-Quantum Cryptography Standards
kind: reference
implementationStatus: active
citationKey: NIST_IR_8547
sourceId: NIST-IR-8547
jurisdiction: US
documentVersion: Final (October 2026)
retrievalUrl: https://csrc.nist.gov/pubs/ir/8547/final
lastReviewed: '2026-11-17'
updateCadence: monthly
summary: NIST transition plan for moving products, services, and infrastructure from quantum-vulnerable public-key algorithms to approved PQC standards.
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
NIST published the final report on 27 October 2026; it replaces the November 2024 initial public draft.

The schedule it sets: every quantum-vulnerable digital signature algorithm (RSA, ECDSA, EdDSA) and key-establishment scheme (DH, ECDH, MQV, RSA) is deprecated after 2030 and disallowed under NIST standards and guidelines after 2035, whatever the key size. Symmetric algorithms with at least 128 bits of classical security, including AES-128, are placed in post-quantum security category 1 or higher and are not on that schedule. SHA-1 is recorded as deprecated for all remaining uses and disallowed in validated modules after 2030.

US federal high value assets and high impact systems have earlier dates under OMB M-26-15 (key establishment by 31 December 2030, digital signatures by 31 December 2031). Those dates bind federal agencies, not Salesforce customers in general, so rules cite the 2030 and 2035 dates.
