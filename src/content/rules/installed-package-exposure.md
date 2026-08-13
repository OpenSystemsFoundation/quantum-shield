---
order: 100
id: R-INSTALLED-PACKAGE-CRYPTO
title: Managed packages are supply-chain PQC exposures
summary: Advisory rule for opaque third-party packages that may contain unmanaged cryptography.
description: Installed managed packages should be tracked as PQC supply-chain exposures.
implementationStatus: active
appliesTo:
  - installed-package
overlays:
  - nis2
  - dora
  - swift-csp
tags:
  - packages
  - supply-chain
  - advisory
cases:
  - when:
      - field: kind
        op: equals
        value: installed-package
    result:
      title: '{{asset.name}} — supply-chain PQC exposure'
      severity: low
      regulatoryStatus: advisory
      migrationPosture: advisory
      effort: medium
      hndlExposure: false
      currentCrypto: Third-party managed package; cryptographic internals not inspectable
      recommendedReplacement: >-
        Request the vendor's cryptographic inventory and PQC migration statement. Track the package as a supply-chain exposure until the vendor publishes a roadmap for any RSA, ECC, or proprietary crypto that aligns with FIPS 203 and FIPS 204.
      rationale: >-
        Managed packages are opaque to QuantumShield scanning. NIST SP 800-53 supply-chain controls and NIST IR 8547 both require transition planning for dependent products and services whose cryptography is outside direct code review.
      citations:
        - NIST_SP_800_53
        - ENISA_PQC_2024
        - NIST_IR_8547
---
Opaque dependencies should be reviewed as policy, not hidden behind a hard-coded special case.