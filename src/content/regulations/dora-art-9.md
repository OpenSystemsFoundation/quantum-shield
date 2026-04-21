---
order: 30
title: DORA — ICT risk management
kind: overlay
implementationStatus: active
citationKey: DORA
overlayId: dora
overlayLabel: DORA — ICT risk management (Art. 9)
sourceId: dora-regulation
jurisdiction: EU
documentVersion: '2022/2554'
section: Art. 9(2)
retrievalUrl: https://eur-lex.europa.eu/eli/reg/2022/2554/oj
lastReviewed: '2026-04-21'
updateCadence: quarterly
summary: Financial-sector resilience overlay for cryptographic controls that affect ICT risk, third-party exposure, and migration planning.
tags:
  - overlay
  - eu
  - finance
requirements:
  - id: art-9-2
    title: ICT systems, protocols, and tools
    mapping: Findings affecting trust chains, SSO, remote sites, and long-lived signatures map to ICT protection expectations.
  - id: art-28
    title: Third-party risk considerations
    mapping: Package and integration findings can be cited as supporting evidence for ICT third-party risk review.
---
This overlay is used when Salesforce is part of a regulated financial-entity control plane.

The document should stay focused on how DORA changes remediation priority, evidence expectations, and governance framing. Detailed algorithm migration guidance belongs in the technical standards documents referenced from here.