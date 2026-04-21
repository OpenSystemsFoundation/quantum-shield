---
order: 40
title: eIDAS trust services baseline
kind: overlay
implementationStatus: reference-only
citationKey: EIDAS2
overlayId: eidas2
overlayLabel: eIDAS — trust services
sourceId: eidas-trust-services
jurisdiction: EU
documentVersion: '2014/910'
section: Trust services controls
retrievalUrl: https://eur-lex.europa.eu/eli/reg/2014/910/oj
lastReviewed: '2026-04-21'
updateCadence: quarterly
summary: Trust-services overlay reserved for signature, certificate, and identity findings that need eIDAS framing.
tags:
  - overlay
  - eu
  - identity
requirements:
  - id: trust-services
    title: Signature and trust-service assurance
    mapping: Certificate and signing findings can be framed here once dedicated eIDAS mappings are implemented in rules.
---
This overlay is currently reference-only. It exists so the documentation and generated manifest already reserve a stable place for eIDAS-driven mappings.

When we add explicit trust-service rules, this document should become the normative source for overlay labels, requirement anchors, and change tracking.