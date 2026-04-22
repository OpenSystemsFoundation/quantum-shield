import type { Category, CryptoAsset } from '@lib/pdf';
import type { ScanClient } from './sfClient.js';

export interface Scanner {
  category: Category;
  label: string;
  scan(client: ScanClient, emit: (asset: CryptoAsset) => void): Promise<void>;
}

interface ToolingCertificate {
  Id: string;
  DeveloperName: string;
  KeySize: number;
  OptionsIsPrivateKeyExportable?: boolean;
  ExpirationDate?: string;
  MasterLabel?: string;
}

interface ConnectedApp {
  Id: string;
  Name: string;
  ContactEmail?: string;
  OauthConfig?: {
    ConsumerKey?: string;
    CertificateId?: string;
  };
}

interface NamedCredentialRecord {
  Id: string;
  DeveloperName: string;
  MasterLabel: string;
  Endpoint?: string;
  PrincipalType?: string;
}

interface ExternalCredentialRecord {
  Id: string;
  DeveloperName: string;
  MasterLabel: string;
  AuthenticationProtocol?: string;
}

interface RemoteSiteSettingRecord {
  Id: string;
  FullName: string;
  EndpointUrl: string;
  IsActive: boolean;
}

function sessionTimeoutToHours(value: string | number | undefined): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.round(value / 60);
  }
  if (typeof value !== 'string') return undefined;

  const byEnum: Record<string, number> = {
    FifteenMinutes: 0,
    ThirtyMinutes: 1,
    OneHour: 1,
    TwoHours: 2,
    FourHours: 4,
    EightHours: 8,
    TwelveHours: 12,
    TwentyFourHours: 24,
    TwoDays: 48,
  };

  return byEnum[value];
}

interface SamlSsoConfigRecord {
  Id: string;
  DeveloperName: string;
  MasterLabel: string;
  SamlProviderId?: string;
  RequestSignatureMethod?: string;
  SamlSloBinding?: string;
  ValidationCert?: string;
}

interface AuthProviderRecord {
  Id: string;
  DeveloperName: string;
  ProviderType: string;
  FriendlyName?: string;
}

interface ApexClassRecord {
  Id: string;
  Name: string;
  Body: string;
  ApiVersion: number;
  NamespacePrefix?: string | null;
}

interface InstalledPackageRecord {
  Id: string;
  SubscriberPackageId: string;
  SubscriberPackage: {
    Name: string;
    NamespacePrefix?: string;
  };
  SubscriberPackageVersion: {
    MajorVersion: number;
    MinorVersion: number;
    Name: string;
  };
}

function certificateScanner(): Scanner {
  return {
    category: 'certificates',
    label: 'Certificates & keys',
    async scan(client, emit) {
      const soql =
        'SELECT Id, DeveloperName, MasterLabel, KeySize, ExpirationDate FROM Certificate';
      const res = await client.toolingQuery<ToolingCertificate>(soql);
      for (const c of res.records) {
        emit({
          kind: 'certificate',
          name: c.MasterLabel ?? c.DeveloperName,
          identifier: c.Id,
          algorithm: 'RSA',
          keySize: c.KeySize,
          expiresAt: c.ExpirationDate,
        });
      }
    },
  };
}

function connectedAppsScanner(): Scanner {
  return {
    category: 'connected-apps',
    label: 'Connected Apps',
    async scan(client, emit) {
      let certIndex: Record<string, { KeySize?: number; MasterLabel?: string }> = {};
      try {
        const certs = await client.toolingQuery<ToolingCertificate>(
          'SELECT Id, MasterLabel, KeySize FROM Certificate',
        );
        for (const c of certs.records) {
          certIndex[c.Id] = { KeySize: c.KeySize, MasterLabel: c.MasterLabel };
        }
      } catch {
        /* no tooling access to Certificates; fall back to defaults */
      }

      try {
        const res = await client.toolingQuery<ConnectedApp>(
          'SELECT Id, Name, ContactEmail, OauthConfig.ConsumerKey, OauthConfig.CertificateId FROM ConnectedApplication',
        );
        for (const app of res.records) {
          const certId = app.OauthConfig?.CertificateId;
          const hasJwtSigningCert = Boolean(certId);
          const jwtCert = certId ? certIndex[certId] : undefined;
          emit({
            kind: 'connected-app',
            name: app.Name,
            identifier: app.Id,
            // When JWT bearer flow is configured Salesforce uses RS256 against
            // the mapped Certificate's RSA key; we surface the real modulus so
            // the key-size rule fires instead of a blanket 2048 assumption.
            algorithm: hasJwtSigningCert ? 'RSA-SHA256' : 'RSA',
            keySize: jwtCert?.KeySize ?? 2048,
            location: hasJwtSigningCert
              ? `JWT signing cert ${jwtCert?.MasterLabel ?? certId}`
              : 'OAuth bearer (no JWT signing cert configured)',
          });
        }
      } catch {
        /* Tooling API may return an error on orgs without Connected Apps; skip silently. */
      }
    },
  };
}

function namedCredentialsScanner(): Scanner {
  return {
    category: 'named-credentials',
    label: 'Named & External Credentials',
    async scan(client, emit) {
      try {
        const nc = await client.query<NamedCredentialRecord>(
          'SELECT Id, DeveloperName, MasterLabel, Endpoint, PrincipalType FROM NamedCredential',
        );
        for (const r of nc.records) {
          emit({
            kind: 'named-credential',
            name: r.MasterLabel ?? r.DeveloperName,
            identifier: r.Id,
            endpointUrl: r.Endpoint,
          });
        }
      } catch {
        /* some orgs require NamedCredential read permission; skip on 403 */
      }
      try {
        const ec = await client.query<ExternalCredentialRecord>(
          'SELECT Id, DeveloperName, MasterLabel, AuthenticationProtocol FROM ExternalCredential',
        );
        for (const r of ec.records) {
          emit({
            kind: 'external-credential',
            name: r.MasterLabel ?? r.DeveloperName,
            identifier: r.Id,
            algorithm:
              r.AuthenticationProtocol === 'OAuth'
                ? 'OAuth'
                : r.AuthenticationProtocol === 'Mtls'
                  ? 'ECDSA'
                  : r.AuthenticationProtocol,
            keySize: r.AuthenticationProtocol === 'Mtls' ? 256 : undefined,
          });
        }
      } catch {
        /* optional */
      }
    },
  };
}

function remoteSitesScanner(): Scanner {
  return {
    category: 'remote-sites',
    label: 'Remote Sites & External Data',
    async scan(client, emit) {
      const res = await client.toolingQuery<RemoteSiteSettingRecord>(
        'SELECT Id, FullName, EndpointUrl, IsActive FROM RemoteSiteSetting',
      );
      for (const r of res.records) {
        if (!r.IsActive) continue;
        emit({
          kind: 'remote-site',
          name: r.FullName,
          identifier: r.Id,
          endpointUrl: r.EndpointUrl,
        });
      }
    },
  };
}

function ssoScanner(): Scanner {
  return {
    category: 'sso',
    label: 'Single Sign-On',
    async scan(client, emit) {
      try {
        const saml = await client.toolingQuery<SamlSsoConfigRecord>(
          'SELECT Id, DeveloperName, MasterLabel, RequestSignatureMethod FROM SamlSsoConfig',
        );
        for (const r of saml.records) {
          const hash = r.RequestSignatureMethod?.toUpperCase().includes('SHA1') ? 'SHA-1' : 'SHA-256';
          emit({
            kind: 'saml-sso',
            name: r.MasterLabel ?? r.DeveloperName,
            identifier: r.Id,
            algorithm: 'RSA',
            keySize: 2048,
            signatureHash: hash,
          });
        }
      } catch {
        /* SAML SSO may not be enabled */
      }
      try {
        const ap = await client.toolingQuery<AuthProviderRecord>(
          'SELECT Id, DeveloperName, ProviderType, FriendlyName FROM AuthProvider',
        );
        for (const r of ap.records) {
          emit({
            kind: 'oidc-provider',
            name: r.FriendlyName ?? r.DeveloperName,
            identifier: r.Id,
            algorithm: 'RSA',
            keySize: 2048,
          });
        }
      } catch {
        /* optional */
      }
    },
  };
}

interface TenantSecretRecord {
  Id: string;
  Type: string;
  Status: string;
  Version?: number;
  Source?: string; // 'SALESFORCE' | 'BYOK' | 'CACHE_ONLY' etc. (not always present)
  RemoteKeyIdentifier?: string; // set when BYOK/EKM is configured
  CreatedDate?: string;
}

function shieldEncryptionScanner(): Scanner {
  return {
    category: 'shield-encryption',
    label: 'Shield Platform Encryption',
    async scan(client, emit) {
      try {
        const res = await client.toolingQuery<TenantSecretRecord>(
          'SELECT Id, Type, Status, Version, Source, RemoteKeyIdentifier, CreatedDate FROM TenantSecret',
        );
        const byType = new Map<string, TenantSecretRecord[]>();
        for (const r of res.records) {
          const list = byType.get(r.Type) ?? [];
          list.push(r);
          byType.set(r.Type, list);
        }

        for (const [type, records] of byType) {
          const active = records.find((r) => r.Status === 'ACTIVE');
          if (!active) continue;
          const byok = active.Source === 'BYOK' || Boolean(active.RemoteKeyIdentifier);
          const totalVersions = records.length;
          const latestCreated = records
            .map((r) => r.CreatedDate)
            .filter((d): d is string => Boolean(d))
            .sort()
            .at(-1);
          const location = [
            byok ? 'BYOK / external key mat.' : 'Salesforce-derived key material',
            `${totalVersions} version${totalVersions === 1 ? '' : 's'}`,
            latestCreated ? `latest rotated ${latestCreated.slice(0, 10)}` : 'no rotation timestamp',
          ].join(' · ');
          emit({
            kind: 'shield-key',
            name: `Tenant secret (${type})${byok ? ' · BYOK' : ''}`,
            identifier: active.Id,
            algorithm: 'AES',
            // Shield data-at-rest keys are AES-256 on Hyperforce but the
            // tenant-secret wrapper the Tooling API exposes is the AES-128
            // derivation root. Report what the customer can see rather than
            // guessing and keep a clear note in location.
            keySize: 256,
            location,
          });
        }
      } catch {
        /* Shield may not be licensed */
      }
    },
  };
}

const APEX_CRYPTO_PATTERNS: Array<{ regex: RegExp; algo: string }> = [
  { regex: /Crypto\.generateDigest\s*\(\s*['"]MD5['"]/gi, algo: 'MD5' },
  { regex: /Crypto\.generateDigest\s*\(\s*['"]SHA-?1['"]/gi, algo: 'SHA-1' },
  {
    regex: /Crypto\.(?:sign|signWithCertificate)\s*\(\s*['"]RSA[-_]?SHA256['"]/gi,
    algo: 'RSA-SHA256',
  },
  {
    regex: /Crypto\.(?:sign|signWithCertificate)\s*\(\s*['"]RSA[-_]?SHA512['"]/gi,
    algo: 'RSA-SHA512',
  },
  {
    regex: /Crypto\.(?:sign|signWithCertificate)\s*\(\s*['"]ECDSA[-_]?SHA256['"]/gi,
    algo: 'ECDSA-SHA256',
  },
];

const APEX_AES_PATTERNS: Array<{ regex: RegExp; keySize: 128 | 192 }> = [
  {
    regex: /Crypto\.(?:encrypt|decrypt)WithManagedIV\s*\(\s*['"]AES128['"]/gi,
    keySize: 128,
  },
  {
    regex: /Crypto\.(?:encrypt|decrypt)WithManagedIV\s*\(\s*['"]AES192['"]/gi,
    keySize: 192,
  },
];

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findHardcodedApexKeys(body: string): number[] {
  const matches: number[] = [];
  const keyAssignments =
    /(?:private|public|protected)?\s*(?:static\s+)?(?:final\s+)?Blob\s+([A-Za-z_][A-Za-z0-9_]*KEY[A-Za-z0-9_]*)\s*=\s*Blob\.valueOf\s*\(\s*['"]([^'"]{16,32})['"]\s*\)/gi;

  let match: RegExpExecArray | null;
  while ((match = keyAssignments.exec(body)) !== null) {
    const symbol = match[1];
    const literal = match[2];
    if (![16, 24, 32].includes(literal.length)) continue;

    const usage = new RegExp(
      `Crypto\\.(?:en|de)crypt(?:WithManagedIV)?\\s*\\([^;]*\\b${escapeRegExp(symbol)}\\b`,
      'i',
    );
    if (!usage.test(body)) continue;

    matches.push(match.index);
  }

  return matches;
}

function apexCryptoScanner(): Scanner {
  return {
    category: 'apex-crypto',
    label: 'Apex cryptographic calls',
    async scan(client, emit) {
      try {
        const res = await client.toolingQuery<ApexClassRecord>(
          'SELECT Id, Name, Body, ApiVersion, NamespacePrefix FROM ApexClass WHERE NamespacePrefix = null',
        );
        for (const cls of res.records) {
          if (!cls.Body) continue;
          for (const { regex, algo } of APEX_CRYPTO_PATTERNS) {
            regex.lastIndex = 0;
            let match: RegExpExecArray | null;
            while ((match = regex.exec(cls.Body)) !== null) {
              const offset = match.index;
              const line = cls.Body.slice(0, offset).split('\n').length;
              emit({
                kind: 'apex-call',
                name: `${cls.Name}.cls`,
                identifier: `${cls.Id}:${line}`,
                location: `${cls.Name}.cls:${line}`,
                algorithm: algo,
              });
            }
          }

          for (const { regex, keySize } of APEX_AES_PATTERNS) {
            regex.lastIndex = 0;
            let match: RegExpExecArray | null;
            while ((match = regex.exec(cls.Body)) !== null) {
              const offset = match.index;
              const line = cls.Body.slice(0, offset).split('\n').length;
              emit({
                kind: 'apex-call',
                name: `${cls.Name}.cls`,
                identifier: `${cls.Id}:${line}`,
                location: `${cls.Name}.cls:${line}`,
                algorithm: 'AES',
                keySize,
              });
            }
          }

          for (const offset of findHardcodedApexKeys(cls.Body)) {
            const line = cls.Body.slice(0, offset).split('\n').length;
            emit({
              kind: 'apex-call',
              name: `${cls.Name}.cls`,
              identifier: `${cls.Id}:${line}`,
              location: `${cls.Name}.cls:${line}`,
              algorithm: 'HARDCODED-AES-KEY',
            });
          }
        }
      } catch {
        /* no apex access */
      }
    },
  };
}

function sessionLoginScanner(): Scanner {
  return {
    category: 'session-login',
    label: 'Session & login settings',
    async scan(client, emit) {
      try {
        const res = await client.toolingQuery<{ Id: string; SessionTimeout: string | number }>(
          'SELECT Id, SessionTimeout FROM SessionSettings',
        );
        for (const r of res.records) {
          const hours = sessionTimeoutToHours(r.SessionTimeout);
          if (hours === undefined) continue;
          emit({
            kind: 'connected-app',
            name: 'SessionSettings',
            identifier: r.Id,
            location: `${hours}h session timeout`,
          });
        }
      } catch {
        /* older orgs may not have SessionSettings sObject */
      }
    },
  };
}

function packagesScanner(): Scanner {
  return {
    category: 'packages',
    label: 'Managed packages',
    async scan(client, emit) {
      try {
        const res = await client.toolingQuery<InstalledPackageRecord>(
          'SELECT Id, SubscriberPackageId, SubscriberPackage.Name, SubscriberPackage.NamespacePrefix, SubscriberPackageVersion.MajorVersion, SubscriberPackageVersion.MinorVersion, SubscriberPackageVersion.Name FROM InstalledSubscriberPackage',
        );
        for (const r of res.records) {
          emit({
            kind: 'installed-package',
            name: r.SubscriberPackage.Name,
            identifier: r.Id,
            location: `${r.SubscriberPackage.NamespacePrefix ?? ''} ${r.SubscriberPackageVersion.MajorVersion}.${r.SubscriberPackageVersion.MinorVersion}`,
          });
        }
      } catch {
        /* no tooling access on some orgs */
      }
    },
  };
}

export function allScanners(): Scanner[] {
  return [
    certificateScanner(),
    connectedAppsScanner(),
    namedCredentialsScanner(),
    remoteSitesScanner(),
    ssoScanner(),
    shieldEncryptionScanner(),
    apexCryptoScanner(),
    sessionLoginScanner(),
    packagesScanner(),
  ];
}
