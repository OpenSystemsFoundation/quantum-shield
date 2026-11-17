import {
  EXECUTION_ENVIRONMENT_DETAIL,
  classifyCryptoAsset,
  executionEnvironmentFor,
} from './crypto-classification.js';
import { QSHIELD_NAME, QSHIELD_VERSION } from '../version.js';
import type { CbomComponent, Report } from './types.js';

interface CycloneDxAlgorithmProperties {
  primitive: string;
  parameterSetIdentifier?: string;
  executionEnvironment?: string;
  nistQuantumSecurityLevel?: number;
}

interface CycloneDxCryptoProperties {
  /** CycloneDX 1.6 enum: algorithm | certificate | protocol | related-crypto-material */
  assetType: string;
  /** Only on assetType=algorithm. */
  algorithmProperties?: CycloneDxAlgorithmProperties;
  /** Only on assetType=certificate. */
  certificateProperties?: { notValidAfter?: string };
  /** Only on assetType=related-crypto-material. */
  relatedCryptoMaterialProperties?: { type: string; size?: number };
  /** Only on assetType=protocol. */
  protocolProperties?: { type: string; version?: string; cipherSuites?: Array<{ name: string }> };
  oid?: string;
}

interface CycloneDxComponent {
  type: 'cryptographic-asset';
  'bom-ref': string;
  name: string;
  description?: string;
  cryptoProperties: CycloneDxCryptoProperties;
  /** Spec-legal name/value extension point for non-schema facts. */
  properties?: Array<{ name: string; value: string }>;
  evidence?: {
    occurrences: Array<{ location: string }>;
  };
}

/**
 * Maps the scanner's component type onto CycloneDX 1.6's closed assetType
 * enum. Keys are "related-crypto-material" — "key" is not a valid assetType.
 * `library` only appears in reports written by older versions.
 */
const ASSET_TYPE_BY_COMPONENT_TYPE: Record<string, string> = {
  certificate: 'certificate',
  key: 'related-crypto-material',
  algorithm: 'algorithm',
  protocol: 'protocol',
  library: 'related-crypto-material',
};

function assetTypeFor(c: CbomComponent): string {
  return ASSET_TYPE_BY_COMPONENT_TYPE[c.type] ?? 'related-crypto-material';
}

/** CycloneDX 1.6 relatedCryptoMaterialProperties.type enum values we emit. */
function relatedMaterialTypeFor(c: CbomComponent): string {
  if (c.type !== 'key') return 'other';
  const upper = c.algorithm.toUpperCase();
  if (upper === 'AES' || upper.includes('AES') || upper.includes('HMAC')) return 'secret-key';
  if (upper.includes('SIGNING')) return 'private-key';
  return 'key';
}

/** CycloneDX requires RFC 3339 date-times; Salesforce returns "+0000" offsets. */
function toIsoDateTime(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? undefined : new Date(ms).toISOString();
}

/**
 * Protocol type for CycloneDX. An HTTPS endpoint is TLS even when it was not
 * probed (the version is then simply absent); plaintext HTTP is "other".
 * Older reports carry no `protocol` field, so fall back to the algorithm text.
 */
function protocolTypeFor(c: CbomComponent): string {
  if (c.protocol) return c.protocol === 'tls' ? 'tls' : 'other';
  return /\bTLS/i.test(c.algorithm) || /^https:/i.test(c.algorithm) ? 'tls' : 'other';
}

function quantumSafeLabel(value: boolean | null): string {
  return value === null ? 'unknown' : String(value);
}

function componentFor(c: CbomComponent, idx: number): CycloneDxComponent {
  const cls = classifyCryptoAsset(c);
  const assetType = assetTypeFor(c);
  const cryptoProperties: CycloneDxCryptoProperties = { assetType };
  const properties: Array<{ name: string; value: string }> = [
    // "quantumSafe" is not part of the CycloneDX cryptoProperties schema —
    // carry it (and the execution-environment detail) as spec-legal
    // name/value properties instead. Tri-state: true | false | unknown.
    { name: 'quantumshield:quantum-safe', value: quantumSafeLabel(cls.quantumSafe) },
    { name: 'quantumshield:execution-environment', value: EXECUTION_ENVIRONMENT_DETAIL },
  ];

  // Each assetType takes only its own *Properties object: algorithm
  // parameters on a certificate or a protocol are not schema-meaningful and
  // mislead consumers into treating an endpoint as an algorithm.
  if (assetType === 'algorithm') {
    cryptoProperties.algorithmProperties = {
      primitive: cls.primitive,
      parameterSetIdentifier: c.keySize ? `${c.keySize}` : undefined,
      executionEnvironment: executionEnvironmentFor(c),
      nistQuantumSecurityLevel: cls.nistQuantumSecurityLevel,
    };
    cryptoProperties.oid = cls.oid;
  } else if (assetType === 'certificate') {
    const notValidAfter = toIsoDateTime(c.notValidAfter);
    cryptoProperties.certificateProperties = notValidAfter ? { notValidAfter } : {};
    properties.push({
      name: 'quantumshield:public-key-algorithm',
      value: c.keySize ? `${c.algorithm}-${c.keySize}` : c.algorithm,
    });
  } else if (assetType === 'protocol') {
    const type = protocolTypeFor(c);
    cryptoProperties.protocolProperties = {
      type,
      ...(c.protocolVersion ? { version: c.protocolVersion } : {}),
      // A probed endpoint's `algorithm` is the negotiated cipher suite.
      ...(type === 'tls' && c.protocolVersion ? { cipherSuites: [{ name: c.algorithm }] } : {}),
    };
  } else {
    cryptoProperties.relatedCryptoMaterialProperties = {
      type: relatedMaterialTypeFor(c),
      ...(c.keySize ? { size: c.keySize } : {}),
    };
    properties.push({ name: 'quantumshield:algorithm', value: cls.legalAlgorithmName ?? c.algorithm });
  }

  return {
    type: 'cryptographic-asset',
    'bom-ref': `quantum-shield:cbom:${idx}`,
    name: c.name,
    description: cls.legalAlgorithmName,
    cryptoProperties,
    properties,
    evidence: { occurrences: [{ location: c.location }] },
  };
}

export function buildCbomJson(report: Report): string {
  const components = report.cbom.map((c, idx) => componentFor(c, idx));

  const bom = {
    bomFormat: 'CycloneDX',
    specVersion: '1.6',
    version: 1,
    serialNumber: `urn:uuid:${cryptoRandomUuid()}`,
    metadata: {
      timestamp: report.generatedAt,
      tools: [
        {
          vendor: QSHIELD_NAME,
          name: 'quantum-shield-scanner',
          version: QSHIELD_VERSION,
        },
      ],
      component: {
        type: 'application',
        name: report.org.orgName,
        'bom-ref': `salesforce-org:${report.org.orgId}`,
      },
    },
    components,
  };

  return JSON.stringify(bom, null, 2);
}

function cryptoRandomUuid(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`;
}
