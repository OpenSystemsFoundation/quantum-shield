import type { CbomComponent } from './types.js';

/**
 * Maps the scan-engine's CbomComponent into the CycloneDX v1.6 cryptographic-asset
 * fields a CBOM consumer expects: NIST quantum security level, registered OID,
 * FIPS-legal algorithm name, and execution environment.
 *
 * Security levels follow NIST's PQC categories:
 *   1 → AES-128 equivalent
 *   3 → AES-192 equivalent
 *   5 → AES-256 equivalent
 *
 * Anything reachable by Shor's algorithm (RSA, DSA, ECDSA, DH, ECDH) is tagged
 * securityLevel 0 to make it obvious in machine-readable tooling that the asset
 * offers zero post-quantum security.
 */

export interface CryptoClassification {
  legalAlgorithmName: string | undefined;
  oid: string | undefined;
  nistQuantumSecurityLevel: number | undefined;
  /** `null` = not determinable from what the scanner observed. */
  quantumSafe: boolean | null;
  primitive: string;
}

const OID_BY_ALGORITHM: Record<string, string> = {
  // RFC 3279 / PKCS#1
  RSA: '1.2.840.113549.1.1.1',
  'RSA-SHA256': '1.2.840.113549.1.1.11',
  'RSA-SHA384': '1.2.840.113549.1.1.12',
  'RSA-SHA512': '1.2.840.113549.1.1.13',
  'RSA-SHA1': '1.2.840.113549.1.1.5',
  // DSA
  DSA: '1.2.840.10040.4.1',
  // ECDSA family
  ECDSA: '1.2.840.10045.2.1',
  'ECDSA-SHA256': '1.2.840.10045.4.3.2',
  'ECDSA-SHA384': '1.2.840.10045.4.3.3',
  'ECDSA-SHA512': '1.2.840.10045.4.3.4',
  // Hash functions
  MD5: '1.2.840.113549.2.5',
  'SHA-1': '1.3.14.3.2.26',
  SHA1: '1.3.14.3.2.26',
  'SHA-256': '2.16.840.1.101.3.4.2.1',
  'SHA-384': '2.16.840.1.101.3.4.2.2',
  'SHA-512': '2.16.840.1.101.3.4.2.3',
  'SHA3-256': '2.16.840.1.101.3.4.2.8',
  'SHA3-384': '2.16.840.1.101.3.4.2.9',
  'SHA3-512': '2.16.840.1.101.3.4.2.10',
  // HMAC (RFC 8018 / RFC 4231 arcs; HMAC-MD5 per RFC 2104 / IANA)
  'HMAC-MD5': '1.3.6.1.5.5.8.1.1',
  'HMAC-SHA1': '1.2.840.113549.2.7',
  'HMAC-SHA256': '1.2.840.113549.2.9',
  'HMAC-SHA512': '1.2.840.113549.2.11',
  // AES. 2.16.840.1.101.3.4.1 is the NIST AES arc, not an algorithm; only
  // mode-specific OIDs identify one. Apex Crypto.encrypt/decrypt always use
  // CBC with PKCS#5 padding, so those calls get the CBC OID for their size.
  'AES-128-CBC': '2.16.840.1.101.3.4.1.2',
  'AES-192-CBC': '2.16.840.1.101.3.4.1.22',
  'AES-256-CBC': '2.16.840.1.101.3.4.1.42',
  // NIST PQC standards — CSOR assignments:
  //   KEMs under 2.16.840.1.101.3.4.4.* (FIPS 203),
  //   signatures under 2.16.840.1.101.3.4.3.* (FIPS 204/205).
  'ML-KEM-512': '2.16.840.1.101.3.4.4.1',
  'ML-KEM-768': '2.16.840.1.101.3.4.4.2',
  'ML-KEM-1024': '2.16.840.1.101.3.4.4.3',
  'ML-DSA-44': '2.16.840.1.101.3.4.3.17',
  'ML-DSA-65': '2.16.840.1.101.3.4.3.18',
  'ML-DSA-87': '2.16.840.1.101.3.4.3.19',
  'SLH-DSA-SHA2-128S': '2.16.840.1.101.3.4.3.20',
  'SLH-DSA-SHA2-128F': '2.16.840.1.101.3.4.3.21',
  'SLH-DSA-SHA2-192S': '2.16.840.1.101.3.4.3.22',
  'SLH-DSA-SHA2-192F': '2.16.840.1.101.3.4.3.23',
  'SLH-DSA-SHA2-256S': '2.16.840.1.101.3.4.3.24',
  'SLH-DSA-SHA2-256F': '2.16.840.1.101.3.4.3.25',
  'SLH-DSA-SHAKE-128S': '2.16.840.1.101.3.4.3.26',
  'SLH-DSA-SHAKE-128F': '2.16.840.1.101.3.4.3.27',
  'SLH-DSA-SHAKE-192S': '2.16.840.1.101.3.4.3.28',
  'SLH-DSA-SHAKE-192F': '2.16.840.1.101.3.4.3.29',
  'SLH-DSA-SHAKE-256S': '2.16.840.1.101.3.4.3.30',
  'SLH-DSA-SHAKE-256F': '2.16.840.1.101.3.4.3.31',
};

const LEGAL_NAME_BY_ALGORITHM: Record<string, string> = {
  RSA: 'RSA',
  'RSA-SHA1': 'RSA-PKCS1-v1.5-SHA1',
  'RSA-SHA256': 'RSA-PKCS1-v1.5-SHA256',
  'RSA-SHA384': 'RSA-PKCS1-v1.5-SHA384',
  'RSA-SHA512': 'RSA-PKCS1-v1.5-SHA512',
  DSA: 'DSA',
  ECDSA: 'ECDSA',
  'ECDSA-SHA256': 'ECDSA-SHA256',
  'ECDSA-SHA384': 'ECDSA-SHA384',
  'ECDSA-SHA512': 'ECDSA-SHA512',
  MD5: 'MD5',
  'SHA-1': 'SHA-1',
  SHA1: 'SHA-1',
  'SHA-256': 'SHA-256',
  'SHA-384': 'SHA-384',
  'SHA-512': 'SHA-512',
  AES: 'AES',
};

/**
 * Parameter set for an ML-KEM/ML-DSA algorithm: taken from the algorithm name
 * suffix when present ("ML-DSA-44" → 44), otherwise from the reported keySize.
 */
function pqcParameterSet(upper: string, keySize: number | undefined): number | undefined {
  const match = upper.match(/^ML-(?:KEM|DSA)-(\d+)$/);
  if (match) return Number(match[1]);
  return keySize;
}

function pqcFipsName(algorithm: string, keySize: number | undefined): string | undefined {
  const upper = algorithm.toUpperCase();
  if (upper.startsWith('ML-KEM')) return `ML-KEM-${pqcParameterSet(upper, keySize) ?? 768} (FIPS 203)`;
  if (upper.startsWith('ML-DSA')) return `ML-DSA-${pqcParameterSet(upper, keySize) ?? 65} (FIPS 204)`;
  if (upper.startsWith('SLH-DSA') || upper.startsWith('SPHINCS')) return 'SLH-DSA (FIPS 205)';
  return undefined;
}

/**
 * Registered CSOR OID for a PQC algorithm. Resolved strictly within the
 * algorithm's own family so ML-DSA can never pick up an ML-KEM arc. When the
 * exact parameter set / variant is unknown we omit the OID rather than emit a
 * wrong one.
 */
function pqcOid(upper: string, keySize: number | undefined): string | undefined {
  if (upper.startsWith('ML-KEM')) {
    return OID_BY_ALGORITHM[`ML-KEM-${pqcParameterSet(upper, keySize) ?? 768}`];
  }
  if (upper.startsWith('ML-DSA')) {
    return OID_BY_ALGORITHM[`ML-DSA-${pqcParameterSet(upper, keySize) ?? 65}`];
  }
  if (upper.startsWith('SLH-DSA')) {
    // Only an exact variant name (e.g. SLH-DSA-SHA2-128S) resolves.
    return OID_BY_ALGORITHM[upper];
  }
  return undefined;
}

/**
 * NIST PQC security category per FIPS 203/204/205:
 *   ML-KEM-512 → 1, ML-KEM-768 → 3, ML-KEM-1024 → 5.
 *   ML-DSA-44 → 2, ML-DSA-65 → 3, ML-DSA-87 → 5.
 *   SLH-DSA-*-128* → 1, -192* → 3, -256* → 5.
 */
function pqcSecurityLevel(upper: string, keySize: number | undefined): number | undefined {
  if (upper.startsWith('ML-KEM')) {
    const p = pqcParameterSet(upper, keySize) ?? 768;
    return p >= 1024 ? 5 : p >= 768 ? 3 : 1;
  }
  if (upper.startsWith('ML-DSA')) {
    const p = pqcParameterSet(upper, keySize) ?? 65;
    return p >= 87 ? 5 : p >= 65 ? 3 : 2;
  }
  if (upper.startsWith('SLH-DSA') || upper.startsWith('SPHINCS')) {
    const match = upper.match(/(128|192|256)/);
    if (!match) return undefined;
    return match[1] === '256' ? 5 : match[1] === '192' ? 3 : 1;
  }
  return undefined;
}

function aesLegalName(keySize: number | undefined): string {
  if (keySize === 128) return 'AES-128';
  if (keySize === 192) return 'AES-192';
  if (keySize === 256) return 'AES-256';
  return 'AES';
}

function aesSecurityLevel(keySize: number): number {
  // NIST PQC categories are defined by AES key search: AES-128 → 1,
  // AES-192 → 3, AES-256 → 5 (NIST IR 8547, Table 6).
  if (keySize >= 256) return 5;
  if (keySize >= 192) return 3;
  return 1;
}

export function classifyCryptoAsset(component: CbomComponent): CryptoClassification {
  const algorithm = (component.algorithm || 'unknown').trim();
  const upper = algorithm.toUpperCase();
  const keySize = component.keySize;

  // Post-quantum algorithms — quantum-safe.
  const fipsName = pqcFipsName(upper, keySize);
  if (fipsName) {
    return {
      legalAlgorithmName: fipsName,
      oid: pqcOid(upper, keySize),
      nistQuantumSecurityLevel: pqcSecurityLevel(upper, keySize),
      quantumSafe: true,
      primitive: upper.startsWith('ML-KEM') ? 'kem' : 'signature',
    };
  }

  // RSA family (signature or key transport) — quantum-unsafe. Shor's
  // algorithm breaks RSA at every key size, so the NIST *quantum* security
  // level is 0 for RSA-3072 and RSA-15360 alike; classical strength is not
  // what this field reports.
  if (upper.startsWith('RSA')) {
    return {
      legalAlgorithmName: keySize ? `RSA-${keySize}` : LEGAL_NAME_BY_ALGORITHM[upper] ?? 'RSA',
      oid: OID_BY_ALGORITHM[upper] ?? OID_BY_ALGORITHM.RSA,
      nistQuantumSecurityLevel: 0,
      quantumSafe: false,
      primitive:
        component.usage === 'encryption' || component.usage === 'key-establishment' ? 'pke' : 'signature',
    };
  }

  // ECDSA / ECC — quantum-unsafe.
  if (upper.startsWith('ECDSA') || upper === 'ECC' || upper === 'ECDH') {
    return {
      legalAlgorithmName: LEGAL_NAME_BY_ALGORITHM[upper] ?? upper,
      oid: OID_BY_ALGORITHM[upper] ?? OID_BY_ALGORITHM.ECDSA,
      nistQuantumSecurityLevel: 0,
      quantumSafe: false,
      primitive: 'signature',
    };
  }

  // DSA — quantum-unsafe.
  if (upper === 'DSA') {
    return {
      legalAlgorithmName: 'DSA',
      oid: OID_BY_ALGORITHM.DSA,
      nistQuantumSecurityLevel: 0,
      quantumSafe: false,
      primitive: 'signature',
    };
  }

  // Hash functions.
  if (upper === 'MD5') {
    return {
      legalAlgorithmName: 'MD5',
      oid: OID_BY_ALGORITHM.MD5,
      nistQuantumSecurityLevel: 0,
      quantumSafe: false,
      primitive: 'hash',
    };
  }
  if (upper === 'SHA-1' || upper === 'SHA1') {
    return {
      legalAlgorithmName: 'SHA-1',
      oid: OID_BY_ALGORITHM['SHA-1'],
      nistQuantumSecurityLevel: 0,
      quantumSafe: false,
      primitive: 'hash',
    };
  }
  const hmac = /^HMAC-?(MD5|SHA-?1|SHA-?256|SHA-?384|SHA-?512)$/.exec(upper);
  if (hmac) {
    const hash = hmac[1].replace('-', '');
    const weak = hash === 'MD5' || hash === 'SHA1';
    return {
      legalAlgorithmName: `HMAC-${hash}`,
      oid: OID_BY_ALGORITHM[`HMAC-${hash}`],
      nistQuantumSecurityLevel: undefined,
      // HMAC-MD5 / HMAC-SHA-1 are retired for classical reasons; their
      // quantum resistance depends on the key length, which is not observed.
      quantumSafe: weak ? null : true,
      primitive: 'mac',
    };
  }
  if (/^SHA3-(256|384|512)$/.test(upper)) {
    const bits = upper.slice(5);
    return {
      legalAlgorithmName: upper,
      oid: OID_BY_ALGORITHM[upper],
      nistQuantumSecurityLevel: bits === '512' ? 5 : bits === '384' ? 4 : 2,
      quantumSafe: true,
      primitive: 'hash',
    };
  }
  if (upper === 'SHA-256') {
    return {
      legalAlgorithmName: 'SHA-256',
      oid: OID_BY_ALGORITHM['SHA-256'],
      nistQuantumSecurityLevel: 2,
      quantumSafe: true,
      primitive: 'hash',
    };
  }
  if (upper === 'SHA-384' || upper === 'SHA-512') {
    return {
      legalAlgorithmName: upper,
      oid: OID_BY_ALGORITHM[upper],
      // NIST PQC categories peg collision search: SHA-384 → category 4,
      // SHA-512 → category 5.
      nistQuantumSecurityLevel: upper === 'SHA-512' ? 5 : 4,
      quantumSafe: true,
      primitive: 'hash',
    };
  }

  // AES.
  if (upper === 'AES') {
    return {
      legalAlgorithmName: aesLegalName(keySize),
      oid:
        component.usage === 'encryption' && keySize
          ? OID_BY_ALGORITHM[`AES-${keySize}-CBC`]
          : undefined,
      nistQuantumSecurityLevel: keySize ? aesSecurityLevel(keySize) : undefined,
      // NIST IR 8547 places AES-128 in PQC category 1 and AES-192 in
      // category 3: every AES key size is quantum-resistant. (CNSA 2.0
      // requiring AES-256 is a policy choice, reported by R-AES-128.)
      quantumSafe: keySize ? true : null,
      primitive: 'block-cipher',
    };
  }

  if (upper.startsWith('HARDCODED')) {
    const what = upper.includes('HMAC') ? 'HMAC' : upper.includes('SIGNING') ? 'Signing' : 'AES';
    return {
      legalAlgorithmName: `${what} key (hardcoded in source)`,
      oid: undefined,
      nistQuantumSecurityLevel: undefined,
      // A key readable in source is compromised regardless of algorithm.
      quantumSafe: false,
      primitive: what === 'HMAC' ? 'mac' : what === 'Signing' ? 'signature' : 'block-cipher',
    };
  }

  if (upper === 'UNRESOLVED') {
    return {
      legalAlgorithmName: 'Unresolved (algorithm passed as a variable)',
      oid: undefined,
      nistQuantumSecurityLevel: undefined,
      quantumSafe: null,
      primitive: 'unknown',
    };
  }

  if (upper === 'OAUTH') {
    return {
      legalAlgorithmName: 'OAuth 2.0 (bearer)',
      oid: undefined,
      nistQuantumSecurityLevel: undefined,
      quantumSafe: null,
      // "protocol" is not a CycloneDX 1.6 primitive — protocols are described
      // via assetType/protocolProperties instead.
      primitive: 'other',
    };
  }

  return {
    legalAlgorithmName: algorithm,
    oid: undefined,
    nistQuantumSecurityLevel: undefined,
    quantumSafe: component.quantumSafe ?? null,
    primitive: 'other',
  };
}

/**
 * Human-readable execution-environment detail. CycloneDX 1.6 restricts
 * algorithmProperties.executionEnvironment to a closed enum, so this detail is
 * carried in a component property instead.
 */
export const EXECUTION_ENVIRONMENT_DETAIL = 'salesforce-hyperforce';

/**
 * Derives the execution environment for CycloneDX 1.6. The spec only allows
 * software-plain-ram / software-encrypted-ram / software-tee / hardware /
 * other / unknown; managed Salesforce infrastructure is opaque to us, so we
 * report "other" and carry the platform detail in a component property
 * (EXECUTION_ENVIRONMENT_DETAIL). Kept as a function so we can specialise
 * per-component (e.g. external Mule endpoints) later.
 */
export function executionEnvironmentFor(_component: CbomComponent): string {
  return 'other';
}
