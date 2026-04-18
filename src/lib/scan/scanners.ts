import type { Category, CryptoAsset } from '@lib/pdf';
import type { SfClient } from './sfClient.js';

export interface Scanner {
  category: Category;
  label: string;
  scan(client: SfClient, emit: (asset: CryptoAsset) => void): Promise<void>;
}

interface ToolingCertificate {
  Id: string;
  DeveloperName: string;
  KeySize: number;
  OptionsIsPrivateKeyExportable?: boolean;
  ExpirationDate?: string;
  MasterLabel?: string;
  NamespacePrefix?: string | null;
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
  DeveloperName: string;
  EndpointUrl: string;
  IsActive: boolean;
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
        'SELECT Id, DeveloperName, MasterLabel, KeySize, ExpirationDate, NamespacePrefix FROM Certificate';
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
      try {
        const res = await client.toolingQuery<ConnectedApp>(
          'SELECT Id, Name, ContactEmail FROM ConnectedApplication',
        );
        for (const app of res.records) {
          emit({
            kind: 'connected-app',
            name: app.Name,
            identifier: app.Id,
            algorithm: 'RSA',
            keySize: 2048,
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
        'SELECT Id, DeveloperName, EndpointUrl, IsActive FROM RemoteSiteSetting',
      );
      for (const r of res.records) {
        if (!r.IsActive) continue;
        emit({
          kind: 'remote-site',
          name: r.DeveloperName,
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

function shieldEncryptionScanner(): Scanner {
  return {
    category: 'shield-encryption',
    label: 'Shield Platform Encryption',
    async scan(client, emit) {
      try {
        const res = await client.toolingQuery<{ Id: string; Type: string; Status: string }>(
          'SELECT Id, Type, Status FROM TenantSecret',
        );
        for (const r of res.records) {
          if (r.Status !== 'ACTIVE') continue;
          emit({
            kind: 'shield-key',
            name: `Tenant secret (${r.Type})`,
            identifier: r.Id,
            algorithm: 'AES',
            keySize: 128,
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
  { regex: /Crypto\.sign\s*\(\s*['"]RSA[-_]?SHA256['"]/gi, algo: 'RSA-SHA256' },
  { regex: /Crypto\.sign\s*\(\s*['"]RSA[-_]?SHA512['"]/gi, algo: 'RSA-SHA512' },
  { regex: /Crypto\.sign\s*\(\s*['"]ECDSA[-_]?SHA256['"]/gi, algo: 'ECDSA-SHA256' },
  { regex: /Crypto\.encryptWithManagedIV\s*\(\s*['"]AES128['"]/gi, algo: 'AES-128' },
  { regex: /Crypto\.encryptWithManagedIV\s*\(\s*['"]AES192['"]/gi, algo: 'AES-192' },
  { regex: /Blob\.valueOf\s*\(\s*['"][A-Za-z0-9+/=]{32,}['"]\s*\)[^;]*encryptWithManagedIV/gi, algo: 'HARDCODED-AES-KEY' },
];

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
          const lines = cls.Body.split('\n');
          for (const { regex, algo } of APEX_CRYPTO_PATTERNS) {
            regex.lastIndex = 0;
            let match: RegExpExecArray | null;
            while ((match = regex.exec(cls.Body)) !== null) {
              const offset = match.index;
              const line = cls.Body.slice(0, offset).split('\n').length;
              void lines;
              emit({
                kind: 'apex-call',
                name: `${cls.Name}.cls`,
                identifier: `${cls.Id}:${line}`,
                location: `${cls.Name}.cls:${line}`,
                algorithm: algo,
              });
            }
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
        const res = await client.toolingQuery<{ Id: string; SessionTimeout: number }>(
          'SELECT Id, SessionTimeout FROM SessionSettings',
        );
        for (const r of res.records) {
          const hours = Math.round((r.SessionTimeout ?? 0) / 60);
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
