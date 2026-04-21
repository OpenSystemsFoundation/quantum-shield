---
order: 190
title: Guidelines for the Selection, Configuration, and Use of Transport Layer Security (TLS) Implementations
kind: reference
implementationStatus: active
citationKey: NIST_SP_800_52
sourceId: NIST-SP-800-52-r2
jurisdiction: US
documentVersion: Rev 2
retrievalUrl: https://csrc.nist.gov/pubs/sp/800/52/r2/final
lastReviewed: '2026-04-21'
updateCadence: quarterly
summary: US baseline for selecting and configuring TLS implementations, including protocol-version and certificate expectations for data in transit.
tags:
  - reference
  - us
  - nist
  - tls
requirements:
  - id: tls-version
    title: Use approved TLS versions and configurations
    mapping: Plaintext HTTP and weak transport findings should cite this baseline for minimum transport protections.
  - id: certificate-validation
    title: Validate certificates and trust anchors in TLS deployments
    mapping: Certificate rotation and endpoint hardening guidance can trace here when trust chains are being updated.
---
This is the primary US transport-security reference for Salesforce callouts, web endpoints, and partner integrations.

Review this source whenever NIST updates TLS version guidance or federal profiles so transport findings stay anchored to a current US baseline.