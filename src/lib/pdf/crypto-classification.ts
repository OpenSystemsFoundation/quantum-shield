import type { CbomComponent } from './types.js';

/**
 * Maps the scan-engine's CbomComponent into the CycloneDX v1.6 cryptographic-asset
 * fields a CBOM consumer expects: NIST quantum security level, registered OID,
 * FIPS-legal algorithm name, and execution environment.
 *
 * Security levels follow NIST's PQC categories:
 *   1 → AES-128 equivalent   (quantum-vulnerable classical primitives land here
 *                             or below because Shor's defeats RSA/ECC entirely,
 *                             but we report the *classical* strength so auditors
 *                             see the contrast.)
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
  quantumSafe: boolean;
  primitive: string;
}

const OID_BY_ALGORITHM: Record<string, string> = {
  // RFC 3279 / PKCS#1
  RSA: '1.2.840.113549.1.1.1',
  'RSA-SHA256': '1.2.840.113549.1.1.11',
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
  // AES (CBC by default in OID registry — actual mode is carried separately)
  AES: '2.16.840.1.101.3.4.1',
  'AES-128-CBC': '2.16.840.1.101.3.4.1.2',
  'AES-192-CBC': '2.16.840.1.101.3.4.1.22',
  'AES-256-CBC': '2.16.840.1.101.3.4.1.42',
  // NIST PQC finalists — registered OIDs under 2.16.840.1.101.3.4.3.*
  'ML-KEM-512': '2.16.840.1.101.3.4.4.1',
  'ML-KEM-768': '2.16.840.1.101.3.4.4.2',
  'ML-KEM-1024': '2.16.840.1.101.3.4.4.3',
  'ML-DSA-44': '2.16.840.1.101.3.4.3.17',
  'ML-DSA-65': '2.16.840.1.101.3.4.3.18',
  'ML-DSA-87': '2.16.840.1.101.3.4.3.19',
  'SLH-DSA-SHA2-128S': '2.16.840.1.101.3.4.3.20',
  'SLH-DSA-SHA2-256S': '2.16.840.1.101.3.4.3.24',
};

const LEGAL_NAME_BY_ALGORITHM: Record<string, string> = {
  RSA: 'RSA',
  'RSA-SHA1': 'RSA-PKCS1-v1.5-SHA1',
  'RSA-SHA256': 'RSA-PKCS1-v1.5-SHA256',
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

function pqcFipsName(algorithm: string, keySize: number | undefined): string | undefined {
  const upper = algorithm.toUpperCase();
  if (upper.startsWith('ML-KEM')) return `ML-KEM-${keySize ?? 768} (FIPS 203)`;
  if (upper.startsWith('ML-DSA')) return `ML-DSA-${keySize ?? 65} (FIPS 204)`;
  if (upper.startsWith('SLH-DSA') || upper.startsWith('SPHINCS')) return 'SLH-DSA (FIPS 205)';
  return undefined;
}

function aesLegalName(keySize: number | undefined): string {
  if (keySize === 128) return 'AES-128';
  if (keySize === 192) return 'AES-192';
  if (keySize === 256) return 'AES-256';
  return 'AES';
}

function rsaSecurityLevel(keySize: number | undefined): number {
  // RSA is fully broken by Shor's — report classical level so consumers see
  // transition urgency. Per NIST SP 800-57: RSA-3072 ≈ AES-128, RSA-7680 ≈
  // AES-192, RSA-15360 ≈ AES-256. Still quantum-unsafe at every size.
  if (!keySize) return 0;
  if (keySize >= 15360) return 5;
  if (keySize >= 7680) return 3;
  if (keySize >= 3072) return 1;
  return 0;
}

function aesSecurityLevel(keySize: number | undefined): number {
  // Grover halves effective bits: AES-128 → 64, AES-256 → 128. Category 5 only
  // AES-256 reaches; AES-192 → 3; AES-128 is category 1 and considered
  // acceptable-for-now by NIST (not by CNSA 2.0).
  if (keySize === 256) return 5;
  if (keySize === 192) return 3;
  if (keySize === 128) return 1;
  return 1;
}

export function classifyCryptoAsset(component: CbomComponent): CryptoClassification {
  const algorithm = (component.algorithm || 'unknown').trim();
  const upper = algorithm.toUpperCase();
  const keySize = component.keySize;

  // Post-quantum algorithms — quantum-safe.
  const fipsName = pqcFipsName(upper, keySize);
  if (fipsName) {
    const oid =
      OID_BY_ALGORITHM[`ML-KEM-${keySize ?? 768}`] ??
      OID_BY_ALGORITHM[`ML-DSA-${keySize ?? 65}`] ??
      undefined;
    return {
      legalAlgorithmName: fipsName,
      oid,
      nistQuantumSecurityLevel: keySize === 1024 || keySize === 87 || keySize === 256 ? 5 : keySize === 768 || keySize === 65 ? 3 : 1,
      quantumSafe: true,
      primitive: upper.startsWith('ML-KEM') ? 'kem' : 'signature',
    };
  }

  // RSA family (signature or key transport) — quantum-unsafe.
  if (upper.startsWith('RSA')) {
    return {
      legalAlgorithmName: keySize ? `RSA-${keySize}` : LEGAL_NAME_BY_ALGORITHM[upper] ?? 'RSA',
      oid: OID_BY_ALGORITHM[upper] ?? OID_BY_ALGORITHM.RSA,
      nistQuantumSecurityLevel: rsaSecurityLevel(keySize),
      quantumSafe: false,
      primitive: component.type === 'certificate' ? 'public-key' : 'signature',
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
      nistQuantumSecurityLevel: upper === 'SHA-512' ? 5 : 3,
      quantumSafe: true,
      primitive: 'hash',
    };
  }

  // AES.
  if (upper === 'AES') {
    return {
      legalAlgorithmName: aesLegalName(keySize),
      oid: OID_BY_ALGORITHM.AES,
      nistQuantumSecurityLevel: aesSecurityLevel(keySize),
      quantumSafe: keySize === 256,
      primitive: 'block-cipher',
    };
  }

  if (upper === 'HARDCODED-AES-KEY') {
    return {
      legalAlgorithmName: 'AES (hardcoded key material)',
      oid: OID_BY_ALGORITHM.AES,
      nistQuantumSecurityLevel: 0,
      quantumSafe: false,
      primitive: 'block-cipher',
    };
  }

  if (upper === 'OAUTH') {
    return {
      legalAlgorithmName: 'OAuth 2.0 (bearer)',
      oid: undefined,
      nistQuantumSecurityLevel: undefined,
      quantumSafe: false,
      primitive: 'protocol',
    };
  }

  return {
    legalAlgorithmName: algorithm,
    oid: undefined,
    nistQuantumSecurityLevel: undefined,
    quantumSafe: component.quantumSafe,
    primitive: component.type === 'protocol' ? 'protocol' : 'other',
  };
}

/**
 * Derives the execution environment string for CycloneDX. Every component the
 * Salesforce scanner produces runs on managed Salesforce infrastructure, so
 * for now this is a constant; we leave it as a function so we can specialise
 * per-component (e.g. external Mule endpoints) later.
 */
export function executionEnvironmentFor(_component: CbomComponent): string {
  return 'salesforce-hyperforce';
}
