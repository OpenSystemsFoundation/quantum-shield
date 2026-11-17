---
order: 250
title: "Cryptographic Agility: Securing the Salesforce Ecosystem Against the Quantum Threat"
kind: reference
implementationStatus: active
citationKey: SALESFORCE_PQC_2026
sourceId: SALESFORCE-PQC-2026
jurisdiction: INTL
documentVersion: '2026-03-18'
section: Salesforce's Quantum Protection Strategy
retrievalUrl: https://compliance.salesforce.com/en/documents/a00Kd00000z7HMjIAM
lastReviewed: '2026-11-17'
updateCadence: quarterly
summary: Salesforce's own PQC readiness white paper — current platform crypto posture and the customer-side hardening it recommends.
tags:
  - reference
  - pqc
  - vendor
  - salesforce
requirements:
  - id: no-pqc-in-core-yet
    title: Salesforce has not announced NIST PQC algorithms in its core services
    mapping: Used to caveat TLS findings — a hybrid-capable partner endpoint does not mean Salesforce callouts negotiate ML-KEM.
  - id: retire-rsa-key-exchange
    title: Move away from RSA key exchange; adopt TLS 1.3 with forward secrecy
    mapping: Cited by the static-RSA key-exchange and TLS 1.2 probe findings.
  - id: key-rotation
    title: Regularly rotate and test rotation of encryption keys
    mapping: Cited by the Shield tenant-secret rotation finding.
---
Vendor guidance, not a regulation. Salesforce states that data at rest is protected with AES-256 (considered quantum-resistant), that it supports TLS 1.2 and 1.3 with perfect-forward-secrecy cipher suites, and that it has not yet publicly announced ML-KEM or ML-DSA in its core services.

For customers it recommends retiring static RSA key exchange, adopting TLS 1.3 for integrations, using strong key lengths, and practising key rotation. QuantumShield cites it where a finding repeats Salesforce's own advice, and to explain why Salesforce-side callouts should still be treated as classical key establishment.
