---
order: 100
id: R-INSTALLED-PACKAGE-CRYPTO
title: Managed packages are supply-chain PQC exposures
summary: Advisory rule for opaque third-party packages that may contain unmanaged cryptography.
description: Installed managed packages should be tracked as PQC supply-chain exposures.
implementationStatus: active
appliesTo:
  - installed-package
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
        Request the vendor's PQC migration statement. Track the package as a supply-chain exposure until the vendor publishes a roadmap aligned with FIPS 203 and 204.
      rationale: >-
        Managed packages are opaque to QuantumShield scanning. ENISA and NCSC-NL both emphasize supply-chain crypto-agility as a post-quantum migration priority.
      citations:
        - ENISA_PQC_2024
        - NCSC_NL_PQC
---
Opaque dependencies should be reviewed as policy, not hidden behind a hard-coded special case.