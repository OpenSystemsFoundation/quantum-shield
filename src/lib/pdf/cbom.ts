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
  algorithmProperties?: CycloneDxAlgorithmProperties;
  relatedCryptoMaterialProperties?: { type: string };
  protocolProperties?: { type: string };
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
 * enum. Keys/libraries (and any future kind such as session-settings-derived
 * material) are "related-crypto-material" — "key" and "library" are not valid
 * assetType values.
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
  return c.type === 'key' ? 'key' : 'other';
}

function componentFor(c: CbomComponent, idx: number): CycloneDxComponent {
  const cls = classifyCryptoAsset(c);
  const assetType = assetTypeFor(c);
  const algorithmProperties: CycloneDxAlgorithmProperties = {
    primitive: cls.primitive,
    parameterSetIdentifier: c.keySize ? `${c.keySize}` : undefined,
    executionEnvironment: executionEnvironmentFor(c),
    nistQuantumSecurityLevel: cls.nistQuantumSecurityLevel,
  };
  const cryptoProperties: CycloneDxCryptoProperties = {
    assetType,
    algorithmProperties,
    oid: cls.oid,
  };
  if (assetType === 'related-crypto-material') {
    cryptoProperties.relatedCryptoMaterialProperties = { type: relatedMaterialTypeFor(c) };
  }
  if (assetType === 'protocol') {
    cryptoProperties.protocolProperties = {
      type: /\bTLS\b/i.test(c.algorithm) ? 'tls' : 'other',
    };
  }
  return {
    type: 'cryptographic-asset',
    'bom-ref': `quantum-shield:cbom:${idx}`,
    name: c.name,
    description: cls.legalAlgorithmName,
    cryptoProperties,
    // "quantumSafe" is not part of the CycloneDX cryptoProperties schema —
    // carry it (and the execution-environment detail) as spec-legal
    // name/value properties instead.
    properties: [
      { name: 'quantumshield:quantum-safe', value: String(cls.quantumSafe) },
      { name: 'quantumshield:execution-environment', value: EXECUTION_ENVIRONMENT_DETAIL },
    ],
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
