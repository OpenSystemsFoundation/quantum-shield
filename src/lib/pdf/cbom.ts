import { classifyCryptoAsset, executionEnvironmentFor } from './crypto-classification.js';
import type { CbomComponent, Report } from './types.js';

interface CycloneDxAlgorithmProperties {
  primitive: string;
  parameterSetIdentifier?: string;
  executionEnvironment?: string;
  nistQuantumSecurityLevel?: number;
}

interface CycloneDxCryptoProperties {
  assetType: string;
  algorithmProperties?: CycloneDxAlgorithmProperties;
  oid?: string;
  quantumSafe: boolean;
}

interface CycloneDxComponent {
  type: 'cryptographic-asset';
  'bom-ref': string;
  name: string;
  description?: string;
  cryptoProperties: CycloneDxCryptoProperties;
  evidence?: {
    occurrences: Array<{ location: string }>;
  };
}

function componentFor(c: CbomComponent, idx: number): CycloneDxComponent {
  const cls = classifyCryptoAsset(c);
  const algorithmProperties: CycloneDxAlgorithmProperties = {
    primitive: cls.primitive,
    parameterSetIdentifier: c.keySize ? `${c.keySize}` : undefined,
    executionEnvironment: executionEnvironmentFor(c),
    nistQuantumSecurityLevel: cls.nistQuantumSecurityLevel,
  };
  return {
    type: 'cryptographic-asset',
    'bom-ref': `quantum-shield:cbom:${idx}`,
    name: c.name,
    description: cls.legalAlgorithmName,
    cryptoProperties: {
      assetType: c.type,
      algorithmProperties,
      oid: cls.oid,
      quantumSafe: cls.quantumSafe,
    },
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
          vendor: 'QuantumShield',
          name: 'quantum-shield-scanner',
          version: '0.0.1',
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
