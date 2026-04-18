import type { Report } from './types.js';

interface CycloneDxComponent {
  type: 'cryptographic-asset';
  'bom-ref': string;
  name: string;
  cryptoProperties: {
    assetType: string;
    algorithmProperties?: {
      primitive: string;
      parameterSetIdentifier?: string;
      executionEnvironment?: string;
      nistQuantumSecurityLevel?: number;
    };
    oid?: string;
    quantumSafe: boolean;
  };
  evidence?: {
    occurrences: Array<{ location: string }>;
  };
}

export function buildCbomJson(report: Report): string {
  const components: CycloneDxComponent[] = report.cbom.map((c, idx) => ({
    type: 'cryptographic-asset',
    'bom-ref': `quantum-shield:cbom:${idx}`,
    name: c.name,
    cryptoProperties: {
      assetType: c.type,
      algorithmProperties: {
        primitive: c.algorithm,
        parameterSetIdentifier: c.keySize ? `${c.keySize}` : undefined,
      },
      quantumSafe: c.quantumSafe,
    },
    evidence: {
      occurrences: [{ location: c.location }],
    },
  }));

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
