import type { Category, CryptoAsset } from '@lib/pdf';
import { SalesforceApiError, type ScanClient } from './sfClient.js';

export interface Scanner {
  category: Category;
  label: string;
  scan(client: ScanClient, emit: (asset: CryptoAsset) => void): Promise<void>;
}

/**
 * Thrown by a scanner when the underlying platform feature is not available
 * in this org (not licensed / not enabled). The engine records the category
 * as `skipped` rather than `failed` so reports state the reason honestly.
 */
export class ScannerSkipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScannerSkipError';
  }
}

/**
 * Thrown by a multi-query scanner when some sub-queries succeeded and others
 * failed. Assets already emitted are kept; the engine records the category as
 * `partial` with the failure detail.
 */
export class ScannerPartialError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScannerPartialError';
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isUnavailableSobject(err: unknown): boolean {
  return err instanceof SalesforceApiError && err.sobjectUnavailable;
}

interface ToolingCertificate {
  Id: string;
  DeveloperName: string;
  KeySize: number;
  OptionsIsPrivateKeyExportable?: boolean;
  ExpirationDate?: string;
  MasterLabel?: string;
}

interface ConnectedAppRecord {
  Id: string;
  Name: string;
  DeveloperName?: string;
  ContactEmail?: string;
  RefreshTokenValidityPeriod?: number;
}

interface ExternalClientAppRecord {
  Id: string;
  DeveloperName: string;
  MasterLabel?: string;
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
  RequestSignatureMethod?: string;
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
          // Salesforce Setup-generated certificates are RSA; KeySize is the
          // real modulus size reported by the Tooling API.
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
      // The Tooling API exposes no OAuth signing-key configuration for
      // ConnectedApplication (no OauthConfig relationship), so we inventory
      // the apps without inventing crypto facts about them. Rules only fire
      // on fields we actually observed.
      const problems: string[] = [];

      try {
        const res = await client.toolingQuery<ConnectedAppRecord>(
          'SELECT Id, Name, DeveloperName, ContactEmail, RefreshTokenValidityPeriod FROM ConnectedApplication',
        );
        for (const app of res.records) {
          emit({
            kind: 'connected-app',
            name: app.Name,
            identifier: app.Id,
            location:
              'Connected App (OAuth signing configuration is not exposed by the Salesforce API — review JWT certificates manually in Setup)',
          });
        }
      } catch (err) {
        if (!isUnavailableSobject(err)) problems.push(`ConnectedApplication: ${errorMessage(err)}`);
      }

      try {
        const eca = await client.toolingQuery<ExternalClientAppRecord>(
          'SELECT Id, DeveloperName, MasterLabel FROM ExternalClientApplication',
        );
        for (const app of eca.records) {
          emit({
            kind: 'connected-app',
            name: app.MasterLabel ?? app.DeveloperName,
            identifier: app.Id,
            location: 'External Client App (code + PKCE flows; no implicit grant surface)',
          });
        }
      } catch (err) {
        // ExternalClientApplication only exists on newer API versions.
        if (!isUnavailableSobject(err)) {
          problems.push(`ExternalClientApplication: ${errorMessage(err)}`);
        }
      }

      if (problems.length > 0) throw new ScannerPartialError(problems.join('; '));
    },
  };
}

function namedCredentialsScanner(): Scanner {
  return {
    category: 'named-credentials',
    label: 'Named & External Credentials',
    async scan(client, emit) {
      const problems: string[] = [];
      let attempted = 0;
      let succeeded = 0;

      attempted += 1;
      try {
        const nc = await client.query<NamedCredentialRecord>(
          'SELECT Id, DeveloperName, MasterLabel, Endpoint, PrincipalType FROM NamedCredential',
        );
        succeeded += 1;
        for (const r of nc.records) {
          emit({
            kind: 'named-credential',
            name: r.MasterLabel ?? r.DeveloperName,
            identifier: r.Id,
            endpointUrl: r.Endpoint,
          });
        }
      } catch (err) {
        problems.push(`NamedCredential: ${errorMessage(err)}`);
      }

      attempted += 1;
      try {
        const ec = await client.query<ExternalCredentialRecord>(
          'SELECT Id, DeveloperName, MasterLabel, AuthenticationProtocol FROM ExternalCredential',
        );
        succeeded += 1;
        for (const r of ec.records) {
          emit({
            kind: 'external-credential',
            name: r.MasterLabel ?? r.DeveloperName,
            identifier: r.Id,
            // Report the protocol as configured; we do not fabricate
            // key material facts the API does not expose.
            algorithm: r.AuthenticationProtocol,
            location: r.AuthenticationProtocol
              ? `Authentication protocol: ${r.AuthenticationProtocol}`
              : undefined,
          });
        }
      } catch (err) {
        if (!isUnavailableSobject(err)) {
          problems.push(`ExternalCredential: ${errorMessage(err)}`);
        }
      }

      if (problems.length > 0) {
        if (succeeded === 0 && problems.length === attempted) {
          throw new Error(problems.join('; '));
        }
        throw new ScannerPartialError(problems.join('; '));
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
      const problems: string[] = [];

      // SamlSsoConfig and AuthProvider are standard REST objects, not
      // Tooling objects — querying them through /tooling fails on real orgs.
      try {
        const saml = await client.query<SamlSsoConfigRecord>(
          'SELECT Id, DeveloperName, MasterLabel, RequestSignatureMethod FROM SamlSsoConfig',
        );
        for (const r of saml.records) {
          const method = r.RequestSignatureMethod?.toUpperCase();
          emit({
            kind: 'saml-sso',
            name: r.MasterLabel ?? r.DeveloperName,
            identifier: r.Id,
            // RequestSignatureMethod is real configuration ('RSA-SHA1' /
            // 'RSA-SHA256'); we derive only from it and do not guess key
            // sizes the API does not expose.
            algorithm: method?.startsWith('RSA') ? 'RSA' : undefined,
            signatureHash: method?.includes('SHA1') ? 'SHA-1' : method ? 'SHA-256' : undefined,
            location: r.RequestSignatureMethod
              ? `SAML request signature method: ${r.RequestSignatureMethod}`
              : undefined,
          });
        }
      } catch (err) {
        if (!isUnavailableSobject(err)) problems.push(`SamlSsoConfig: ${errorMessage(err)}`);
      }

      try {
        const ap = await client.query<AuthProviderRecord>(
          'SELECT Id, DeveloperName, ProviderType, FriendlyName FROM AuthProvider',
        );
        for (const r of ap.records) {
          emit({
            kind: 'oidc-provider',
            name: r.FriendlyName ?? r.DeveloperName,
            identifier: r.Id,
            location: `Auth provider type: ${r.ProviderType}`,
          });
        }
      } catch (err) {
        if (!isUnavailableSobject(err)) problems.push(`AuthProvider: ${errorMessage(err)}`);
      }

      if (problems.length > 0) throw new ScannerPartialError(problems.join('; '));
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
      let res;
      try {
        res = await client.query<TenantSecretRecord>(
          'SELECT Id, Type, Status, Version, Source, RemoteKeyIdentifier, CreatedDate FROM TenantSecret',
        );
      } catch (err) {
        if (isUnavailableSobject(err)) {
          throw new ScannerSkipError(
            'Shield Platform Encryption is not enabled in this org (TenantSecret is not available).',
          );
        }
        throw err;
      }

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
          // Shield Platform Encryption derives AES-256 data encryption keys
          // from the tenant secret (probabilistic and deterministic schemes
          // alike), so 256 reflects the platform's documented behaviour.
          algorithm: 'AES',
          keySize: 256,
          location,
          ...(latestCreated ? { lastRotatedAt: latestCreated } : {}),
        });
      }
    },
  };
}

/**
 * Replaces Apex comments with whitespace, preserving line numbers and
 * string literals, so crypto patterns never match commented-out code.
 */
export function stripApexComments(body: string): string {
  const out = body.split('');
  let state: 'code' | 'line-comment' | 'block-comment' | 'string' = 'code';
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    const next = body[i + 1];
    switch (state) {
      case 'code':
        if (ch === "'") {
          state = 'string';
        } else if (ch === '/' && next === '/') {
          state = 'line-comment';
          out[i] = ' ';
        } else if (ch === '/' && next === '*') {
          state = 'block-comment';
          out[i] = ' ';
        }
        break;
      case 'string':
        if (ch === '\\') {
          i += 1; // skip escaped char (leave both in place)
        } else if (ch === "'") {
          state = 'code';
        }
        break;
      case 'line-comment':
        if (ch === '\n') {
          state = 'code';
        } else {
          out[i] = ' ';
        }
        break;
      case 'block-comment':
        if (ch === '*' && next === '/') {
          out[i] = ' ';
          out[i + 1] = ' ';
          i += 1;
          state = 'code';
        } else if (ch !== '\n') {
          out[i] = ' ';
        }
        break;
    }
  }
  return out.join('');
}

/**
 * Normalises an Apex crypto algorithm argument to the catalog's canonical
 * spelling. Per the Apex Crypto class docs, 'RSA' is an alias for RSA-SHA1.
 */
function normaliseApexSignAlgo(raw: string): string {
  const cleaned = raw.toUpperCase().replace(/[_\s]/g, '-');
  if (cleaned === 'RSA') return 'RSA-SHA1';
  return cleaned;
}

const APEX_DIGEST_PATTERN = /Crypto\.generateDigest\s*\(\s*['"](MD5|SHA-?1)['"]/gi;
const APEX_SIGN_PATTERN =
  /Crypto\.(?:sign|signWithCertificate)\s*\(\s*['"]([A-Za-z0-9_-]+)['"]/gi;
const APEX_MAC_PATTERN = /Crypto\.generateMac\s*\(\s*['"]hmac(MD5|SHA1)['"]/gi;
const APEX_AES_PATTERN =
  /Crypto\.(?:encrypt|decrypt)(?:WithManagedIV)?\s*\(\s*['"]AES(128|192)['"]/gi;

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
      const res = await client.toolingQuery<ApexClassRecord>(
        'SELECT Id, Name, Body, ApiVersion, NamespacePrefix FROM ApexClass WHERE NamespacePrefix = null',
      );
      for (const cls of res.records) {
        if (!cls.Body) continue;
        const body = stripApexComments(cls.Body);
        const lineAt = (offset: number) => body.slice(0, offset).split('\n').length;
        const emitCall = (line: number, algorithm: string, keySize?: number) => {
          emit({
            kind: 'apex-call',
            name: `${cls.Name}.cls`,
            // Include the algorithm so two different crypto calls on the
            // same line produce distinct finding ids instead of colliding.
            identifier: `${cls.Id}:${line}:${algorithm.replace(/\s+/g, '')}`,
            location: `${cls.Name}.cls:${line}`,
            algorithm,
            keySize,
          });
        };

        for (const match of body.matchAll(APEX_DIGEST_PATTERN)) {
          const algo = match[1].toUpperCase().replace(/^SHA-?1$/, 'SHA-1');
          emitCall(lineAt(match.index ?? 0), algo);
        }

        for (const match of body.matchAll(APEX_SIGN_PATTERN)) {
          emitCall(lineAt(match.index ?? 0), normaliseApexSignAlgo(match[1]));
        }

        for (const match of body.matchAll(APEX_MAC_PATTERN)) {
          emitCall(lineAt(match.index ?? 0), `HMAC-${match[1].toUpperCase()}`);
        }

        for (const match of body.matchAll(APEX_AES_PATTERN)) {
          emitCall(lineAt(match.index ?? 0), 'AES', Number(match[1]));
        }

        for (const offset of findHardcodedApexKeys(body)) {
          const line = lineAt(offset);
          emit({
            kind: 'apex-call',
            name: `${cls.Name}.cls`,
            identifier: `${cls.Id}:${line}:HARDCODED`,
            location: `${cls.Name}.cls:${line}`,
            algorithm: 'HARDCODED-AES-KEY',
          });
        }
      }
    },
  };
}

function sessionLoginScanner(): Scanner {
  return {
    category: 'session-login',
    label: 'Session & login settings',
    async scan(client, emit) {
      let res;
      try {
        res = await client.toolingQuery<{ Id: string; SessionTimeout: string | number }>(
          'SELECT Id, SessionTimeout FROM SessionSettings',
        );
      } catch (err) {
        if (isUnavailableSobject(err)) {
          throw new ScannerSkipError('SessionSettings is not queryable on this org edition.');
        }
        throw err;
      }
      for (const r of res.records) {
        const hours = sessionTimeoutToHours(r.SessionTimeout);
        if (hours === undefined) continue;
        emit({
          kind: 'session-settings',
          name: 'SessionSettings',
          identifier: r.Id,
          location: `${hours}h session timeout`,
        });
      }
    },
  };
}

function packagesScanner(): Scanner {
  return {
    category: 'packages',
    label: 'Managed packages',
    async scan(client, emit) {
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
