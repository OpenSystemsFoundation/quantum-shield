import type { Category, CryptoAsset } from '@lib/pdf';
import { SalesforceApiError, type QueryResult, type ScanClient } from './sfClient.js';

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

/**
 * Salesforce answers INVALID_TYPE ("sObject type 'X' is not supported") both
 * when an object does not exist at the session's API version / org edition
 * AND when the running user is not permitted to see it. The two cannot be
 * told apart from the response, so the scanners never read it as "the org
 * has none": the object is reported as not checked.
 */
function unavailableNote(objectName: string): string {
  return `${objectName} is not available at this API version or not permitted for this user (INVALID_TYPE)`;
}

interface QueryAttempt {
  api: 'query' | 'toolingQuery';
  soql: string;
}

/**
 * Runs the attempts in order and returns the first that the org accepts.
 * Some setup objects are exposed through the REST API on some API versions
 * and through the Tooling API on others (ExternalClientApplication is REST
 * only before v67; ExternalCredential is Tooling only), so one object may
 * need both. Returns `null` when every attempt answered INVALID_TYPE; any
 * other error propagates.
 */
async function queryFirstAvailable<T>(
  client: ScanClient,
  attempts: QueryAttempt[],
): Promise<QueryResult<T> | null> {
  for (const attempt of attempts) {
    try {
      return attempt.api === 'query'
        ? await client.query<T>(attempt.soql)
        : await client.toolingQuery<T>(attempt.soql);
    } catch (err) {
      if (!isUnavailableSobject(err)) throw err;
    }
  }
  return null;
}

/**
 * Shared bookkeeping for scanners that read several objects. Decides the
 * honest outcome once every object has been tried:
 *   - everything read            → returns (category `scanned`)
 *   - nothing readable, all INVALID_TYPE → ScannerSkipError (`skipped`)
 *   - nothing readable, real errors      → Error (`failed`)
 *   - a mix                              → ScannerPartialError (`partial`)
 */
class ObjectOutcomes {
  private succeeded = 0;
  private readonly unavailable: string[] = [];
  private readonly failures: string[] = [];

  ok(): void {
    this.succeeded += 1;
  }

  notAvailable(objectName: string): void {
    this.unavailable.push(unavailableNote(objectName));
  }

  failed(objectName: string, err: unknown): void {
    this.failures.push(`${objectName}: ${errorMessage(err)}`);
  }

  finish(): void {
    const problems = [...this.failures, ...this.unavailable];
    if (problems.length === 0) return;
    const detail = problems.join('; ');
    if (this.succeeded === 0) {
      if (this.failures.length === 0) throw new ScannerSkipError(detail);
      throw new Error(detail);
    }
    throw new ScannerPartialError(detail);
  }
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

/**
 * SessionSettings.SessionTimeout enum → minutes. These are the values the
 * Metadata/Tooling API defines; anything else is reported as unreadable
 * instead of being guessed.
 */
const SESSION_TIMEOUT_MINUTES: Record<string, number> = {
  FifteenMinutes: 15,
  ThirtyMinutes: 30,
  SixtyMinutes: 60,
  TwoHours: 120,
  FourHours: 240,
  EightHours: 480,
  TwelveHours: 720,
  TwentyFourHours: 1440,
};

export function sessionTimeoutToMinutes(value: string | number | undefined | null): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.round(value);
  }
  if (typeof value !== 'string') return undefined;
  return SESSION_TIMEOUT_MINUTES[value];
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
      // The API exposes no OAuth signing-key configuration for Connected Apps
      // or External Client Apps, so we inventory the apps without inventing
      // crypto facts about them. Rules only fire on fields we observed.
      const outcomes = new ObjectOutcomes();

      try {
        const res = await queryFirstAvailable<ConnectedAppRecord>(client, [
          {
            api: 'toolingQuery',
            soql: 'SELECT Id, Name, DeveloperName, ContactEmail, RefreshTokenValidityPeriod FROM ConnectedApplication',
          },
        ]);
        if (res) {
          outcomes.ok();
          for (const app of res.records) {
            emit({
              kind: 'connected-app',
              name: app.Name,
              identifier: app.Id,
              location:
                'Connected App (OAuth signing configuration is not exposed by the Salesforce API — review JWT certificates manually in Setup)',
            });
          }
        } else {
          outcomes.notAvailable('ConnectedApplication');
        }
      } catch (err) {
        outcomes.failed('ConnectedApplication', err);
      }

      try {
        // REST first: ExternalClientApplication is a REST object on every API
        // version that has External Client Apps, but a Tooling object only
        // from v67. Asking Tooling alone at v66 answered INVALID_TYPE, which
        // used to be reported as "scanned, 0 apps".
        const eca = await queryFirstAvailable<ExternalClientAppRecord>(client, [
          { api: 'query', soql: 'SELECT Id, DeveloperName, MasterLabel FROM ExternalClientApplication' },
          { api: 'toolingQuery', soql: 'SELECT Id, DeveloperName, MasterLabel FROM ExternalClientApplication' },
        ]);
        if (eca) {
          outcomes.ok();
          for (const app of eca.records) {
            emit({
              kind: 'connected-app',
              name: app.MasterLabel ?? app.DeveloperName,
              identifier: app.Id,
              location:
                'External Client App (OAuth signing configuration is not exposed by the Salesforce API — review in Setup)',
            });
          }
        } else {
          outcomes.notAvailable('ExternalClientApplication');
        }
      } catch (err) {
        outcomes.failed('ExternalClientApplication', err);
      }

      outcomes.finish();
    },
  };
}

function namedCredentialsScanner(): Scanner {
  return {
    category: 'named-credentials',
    label: 'Named & External Credentials',
    async scan(client, emit) {
      const outcomes = new ObjectOutcomes();

      try {
        const nc = await queryFirstAvailable<NamedCredentialRecord>(client, [
          {
            api: 'query',
            soql: 'SELECT Id, DeveloperName, MasterLabel, Endpoint, PrincipalType FROM NamedCredential',
          },
        ]);
        if (nc) {
          outcomes.ok();
          for (const r of nc.records) {
            emit({
              kind: 'named-credential',
              name: r.MasterLabel ?? r.DeveloperName,
              identifier: r.Id,
              endpointUrl: r.Endpoint,
            });
          }
        } else {
          outcomes.notAvailable('NamedCredential');
        }
      } catch (err) {
        outcomes.failed('NamedCredential', err);
      }

      try {
        // ExternalCredential is a Tooling API object; the REST query answers
        // INVALID_TYPE even in orgs that have external credentials.
        const ec = await queryFirstAvailable<ExternalCredentialRecord>(client, [
          {
            api: 'toolingQuery',
            soql: 'SELECT Id, DeveloperName, MasterLabel, AuthenticationProtocol FROM ExternalCredential',
          },
          {
            api: 'query',
            soql: 'SELECT Id, DeveloperName, MasterLabel, AuthenticationProtocol FROM ExternalCredential',
          },
        ]);
        if (ec) {
          outcomes.ok();
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
        } else {
          outcomes.notAvailable('ExternalCredential');
        }
      } catch (err) {
        outcomes.failed('ExternalCredential', err);
      }

      outcomes.finish();
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
      const outcomes = new ObjectOutcomes();

      // SamlSsoConfig and AuthProvider are standard REST objects, not
      // Tooling objects — querying them through /tooling fails on real orgs.
      try {
        const saml = await queryFirstAvailable<SamlSsoConfigRecord>(client, [
          {
            api: 'query',
            soql: 'SELECT Id, DeveloperName, MasterLabel, RequestSignatureMethod FROM SamlSsoConfig',
          },
        ]);
        if (saml) {
          outcomes.ok();
          for (const r of saml.records) {
            const method = r.RequestSignatureMethod?.toUpperCase();
            emit({
              kind: 'saml-sso',
              name: r.MasterLabel ?? r.DeveloperName,
              identifier: r.Id,
              // RequestSignatureMethod is real configuration ('RSA-SHA1' /
              // 'RSA-SHA256'). The key size is not exposed here, so keySize
              // stays undefined and the "RSA with an unknown key size" rule
              // case reports it instead of the asset passing silently.
              algorithm: method?.startsWith('RSA') ? 'RSA' : undefined,
              signatureHash: method?.includes('SHA1') ? 'SHA-1' : method ? 'SHA-256' : undefined,
              usage: 'signature',
              location: r.RequestSignatureMethod
                ? `SAML request signature method: ${r.RequestSignatureMethod}`
                : undefined,
            });
          }
        } else {
          outcomes.notAvailable('SamlSsoConfig');
        }
      } catch (err) {
        outcomes.failed('SamlSsoConfig', err);
      }

      try {
        const ap = await queryFirstAvailable<AuthProviderRecord>(client, [
          { api: 'query', soql: 'SELECT Id, DeveloperName, ProviderType, FriendlyName FROM AuthProvider' },
        ]);
        if (ap) {
          outcomes.ok();
          for (const r of ap.records) {
            emit({
              kind: 'oidc-provider',
              name: r.FriendlyName ?? r.DeveloperName,
              identifier: r.Id,
              location: `Auth provider type: ${r.ProviderType}`,
            });
          }
        } else {
          outcomes.notAvailable('AuthProvider');
        }
      } catch (err) {
        outcomes.failed('AuthProvider', err);
      }

      outcomes.finish();
    },
  };
}

interface TenantSecretRecord {
  Id: string;
  Type: string;
  Status: string;
  Version?: number;
  /**
   * Where the key material comes from. Documented values:
   *   HSM      — generated by Salesforce
   *   UPLOADED — customer-supplied (Bring Your Own Key)
   *   REMOTE   — fetched from a key service outside Salesforce (Cache-Only
   *              Key Service / External Key Management; "Fetched" in Setup)
   */
  Source?: string;
  RemoteKeyIdentifier?: string; // set for REMOTE (cache-only) keys
  CreatedDate?: string;
}

export type TenantSecretOrigin = 'salesforce' | 'byok' | 'external';

export function tenantSecretOrigin(record: Pick<TenantSecretRecord, 'Source' | 'RemoteKeyIdentifier'>): TenantSecretOrigin {
  const source = record.Source?.toUpperCase();
  if (source === 'REMOTE' || (!source && Boolean(record.RemoteKeyIdentifier))) return 'external';
  if (source === 'UPLOADED') return 'byok';
  return 'salesforce';
}

const TENANT_SECRET_ORIGIN_LABEL: Record<TenantSecretOrigin, string> = {
  salesforce: 'Salesforce-generated key material',
  byok: 'Customer-supplied key material (BYOK)',
  external: 'Key fetched from an external key service (cache-only / EKM)',
};

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
          // INVALID_TYPE does not prove Shield is off: a user without the
          // "Manage Encryption Keys" permission gets the same answer.
          throw new ScannerSkipError(
            'Shield Platform Encryption keys were not checked: TenantSecret is not available to this user. Either Shield Platform Encryption is not provisioned in this org, or the user lacks the "Manage Encryption Keys" permission.',
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
        const origin = tenantSecretOrigin(active);
        const totalVersions = records.length;
        const latestCreated = records
          .map((r) => r.CreatedDate)
          .filter((d): d is string => Boolean(d))
          .sort()
          .at(-1);
        const location = [
          TENANT_SECRET_ORIGIN_LABEL[origin],
          `${totalVersions} version${totalVersions === 1 ? '' : 's'}`,
          latestCreated ? `latest rotated ${latestCreated.slice(0, 10)}` : 'no rotation timestamp',
        ].join(' · ');
        emit({
          kind: 'shield-key',
          name: `Tenant secret (${type})${origin === 'byok' ? ' · BYOK' : origin === 'external' ? ' · external key' : ''}`,
          identifier: active.Id,
          // Shield Platform Encryption derives AES-256 data encryption keys
          // from the tenant secret (probabilistic and deterministic schemes
          // alike), so 256 reflects the platform's documented behaviour.
          algorithm: 'AES',
          keySize: 256,
          usage: 'key-material',
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
          out[i + 1] = ' ';
          i += 1;
        } else if (ch === '/' && next === '*') {
          // Consume both opener characters. Otherwise the '*' of "/*" is
          // re-read as the start of a closing "*/" and "/*/" would open and
          // close a comment at once, exposing the commented-out code after it.
          state = 'block-comment';
          out[i] = ' ';
          out[i + 1] = ' ';
          i += 1;
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

/** An Apex source unit (class or trigger) to scan for Crypto calls. */
export interface ApexSource {
  id: string;
  /** Display name including extension, e.g. `Signer.cls`, `OrderSync.trigger`. */
  fileName: string;
  body: string;
}

type ApexCryptoFn =
  | 'generatedigest'
  | 'generatemac'
  | 'verifyhmac'
  | 'sign'
  | 'signwithcertificate'
  | 'signxml'
  | 'verify'
  | 'verifywithcertificate'
  | 'encrypt'
  | 'decrypt'
  | 'encryptwithmanagediv'
  | 'decryptwithmanagediv'
  | 'generateaeskey';

/**
 * Every System.Crypto method that takes an algorithm (or key size) as its
 * first argument. Apex identifiers are case-insensitive, hence the `i` flag.
 * `\b` keeps user classes such as `MyCrypto.sign(...)` from matching.
 */
const APEX_CRYPTO_CALL =
  /\bCrypto\s*\.\s*(generateDigest|generateMac|verifyHMac|signWithCertificate|signXML|sign|verifyWithCertificate|verify|encryptWithManagedIV|decryptWithManagedIV|encrypt|decrypt|generateAesKey)\s*\(/gi;

/** 1-based position of the secret-key argument for calls that take one. */
const KEY_ARG_POSITION: Partial<Record<ApexCryptoFn, number>> = {
  encrypt: 2,
  decrypt: 2,
  encryptwithmanagediv: 2,
  decryptwithmanagediv: 2,
  generatemac: 3,
  verifyhmac: 3,
  sign: 3,
};

/**
 * Splits the argument list of a call whose opening parenthesis is at
 * `openParen`, honouring nested parentheses/brackets and string literals.
 * Returns each argument's trimmed text and its offset in `body`.
 */
function splitCallArgs(body: string, openParen: number): Array<{ text: string; offset: number }> {
  const args: Array<{ text: string; offset: number }> = [];
  let depth = 0;
  let start = openParen + 1;
  let inString = false;
  const push = (end: number) => {
    const raw = body.slice(start, end);
    const lead = raw.length - raw.trimStart().length;
    if (raw.trim().length > 0) args.push({ text: raw.trim(), offset: start + lead });
  };
  for (let i = openParen + 1; i < body.length; i += 1) {
    const ch = body[i];
    if (inString) {
      if (ch === '\\') i += 1;
      else if (ch === "'") inString = false;
      continue;
    }
    if (ch === "'") inString = true;
    else if (ch === '(' || ch === '[' || ch === '{') depth += 1;
    else if (ch === ')' || ch === ']' || ch === '}') {
      if (depth === 0) {
        push(i);
        return args;
      }
      depth -= 1;
    } else if (ch === ',' && depth === 0) {
      push(i);
      start = i + 1;
    } else if (ch === ';' && depth === 0) {
      break; // malformed / truncated call — stop at the statement end
    }
  }
  return args;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const STRING_LITERAL = /^'((?:[^'\\]|\\.)*)'$/;
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Resolves an algorithm argument to its string value when that is possible
 * without executing code: a literal, or an identifier that is initialised
 * from exactly one string literal in the same source unit (a constant).
 * Anything else — parameters, expressions, values assigned twice — is
 * unresolved.
 */
function resolveStringArg(body: string, arg: string): string | undefined {
  const literal = STRING_LITERAL.exec(arg);
  if (literal) return literal[1];
  if (!IDENTIFIER.test(arg)) return undefined;
  const assignments = [
    ...body.matchAll(new RegExp(`\\b${escapeRegExp(arg)}\\s*=(?!=)\\s*([^;]*);`, 'gi')),
  ];
  if (assignments.length !== 1) return undefined;
  const value = STRING_LITERAL.exec(assignments[0][1].trim());
  return value ? value[1] : undefined;
}

/**
 * Literal key material: an expression that builds a Blob straight from a
 * string literal in source.
 */
const LITERAL_KEY_EXPR =
  /^(?:Blob\s*\.\s*valueOf|EncodingUtil\s*\.\s*base64Decode|EncodingUtil\s*\.\s*convertFromHex)\s*\(\s*'(?:[^'\\]|\\.)+'\s*\)$/i;

/**
 * If `arg` (the key argument of a Crypto call) is hardcoded key material,
 * returns the offset to report: the call's argument for an inline literal, or
 * the declaration for a variable initialised from a literal. Keys that arrive
 * as method parameters, from Custom Settings / Metadata, or from
 * Crypto.generateAesKey are not flagged.
 */
function hardcodedKeyOffset(body: string, arg: { text: string; offset: number }): number | undefined {
  if (LITERAL_KEY_EXPR.test(arg.text)) return arg.offset;
  if (!IDENTIFIER.test(arg.text)) return undefined;
  const declaration = new RegExp(`\\b${escapeRegExp(arg.text)}\\s*=(?!=)\\s*([^;]*);`, 'gi');
  for (const match of body.matchAll(declaration)) {
    if (LITERAL_KEY_EXPR.test(match[1].trim())) return match.index ?? 0;
  }
  return undefined;
}

function normaliseDigest(raw: string): string {
  const upper = raw.toUpperCase().replace(/\s+/g, '');
  if (upper === 'SHA1' || upper === 'SHA-1') return 'SHA-1';
  const sha2 = /^SHA-?(224|256|384|512)$/.exec(upper);
  if (sha2) return `SHA-${sha2[1]}`;
  return upper; // MD5, SHA3-256, SHA3-384, SHA3-512, …
}

function normaliseMac(raw: string): string {
  const upper = raw.toUpperCase().replace(/[\s_-]/g, '');
  return upper.startsWith('HMAC') ? `HMAC-${upper.slice(4)}` : `HMAC-${upper}`;
}

/**
 * Normalises an Apex signature algorithm argument to the catalog's canonical
 * spelling. Per the Apex Crypto class docs, 'RSA' is an alias for RSA-SHA1.
 */
function normaliseSignature(raw: string): string {
  const cleaned = raw.toUpperCase().replace(/[_\s]/g, '-');
  if (cleaned === 'RSA') return 'RSA-SHA1';
  return cleaned;
}

/**
 * Finds every System.Crypto call in one Apex source unit and returns it as an
 * asset — including calls that use strong algorithms (SHA-256, HMAC-SHA256,
 * AES-256), which produce no finding but belong in the cryptographic
 * inventory, and calls whose algorithm cannot be resolved statically.
 */
export function scanApexSource(source: ApexSource): CryptoAsset[] {
  const body = stripApexComments(source.body);
  const lineAt = (offset: number) => body.slice(0, offset).split('\n').length;
  const assets = new Map<string, CryptoAsset>();
  const add = (offset: number, fields: Pick<CryptoAsset, 'algorithm' | 'keySize' | 'usage'>, tag?: string) => {
    const line = lineAt(offset);
    // Include the algorithm so two different crypto calls on the same line
    // produce distinct finding ids instead of colliding.
    const idTag = tag ?? `${(fields.algorithm ?? '').replace(/\s+/g, '')}${fields.keySize ?? ''}`;
    const identifier = `${source.id}:${line}:${idTag}`;
    if (assets.has(identifier)) return;
    assets.set(identifier, {
      kind: 'apex-call',
      name: source.fileName,
      identifier,
      location: `${source.fileName}:${line}`,
      ...fields,
    });
  };

  for (const match of body.matchAll(APEX_CRYPTO_CALL)) {
    const offset = match.index ?? 0;
    const fn = match[1].toLowerCase() as ApexCryptoFn;
    const args = splitCallArgs(body, offset + match[0].length - 1);
    const first = args[0]?.text ?? '';

    const keyPosition = KEY_ARG_POSITION[fn];
    const keyArg = keyPosition ? args[keyPosition - 1] : undefined;
    if (keyArg) {
      const keyOffset = hardcodedKeyOffset(body, keyArg);
      if (keyOffset !== undefined) {
        const what = fn === 'generatemac' || fn === 'verifyhmac' ? 'HMAC' : fn === 'sign' ? 'SIGNING' : 'AES';
        add(keyOffset, { algorithm: `HARDCODED-${what}-KEY`, usage: 'key-material' }, 'HARDCODED');
      }
    }

    if (fn === 'generateaeskey') {
      const size = Number(first);
      if (size === 128 || size === 192 || size === 256) {
        add(offset, { algorithm: 'AES', keySize: size, usage: 'key-generation' });
      } else {
        add(offset, { algorithm: 'UNRESOLVED', usage: 'key-generation' }, `UNRESOLVED-${fn}`);
      }
      continue;
    }

    const usage: CryptoAsset['usage'] =
      fn === 'generatedigest'
        ? 'digest'
        : fn === 'generatemac' || fn === 'verifyhmac'
          ? 'mac'
          : fn.startsWith('encrypt') || fn.startsWith('decrypt')
            ? 'encryption'
            : 'signature';

    const resolved = resolveStringArg(body, first);
    if (resolved === undefined || resolved.trim() === '') {
      add(offset, { algorithm: 'UNRESOLVED', usage }, `UNRESOLVED-${fn}`);
      continue;
    }

    if (usage === 'digest') {
      add(offset, { algorithm: normaliseDigest(resolved), usage });
    } else if (usage === 'mac') {
      add(offset, { algorithm: normaliseMac(resolved), usage });
    } else if (usage === 'encryption') {
      const aes = /^AES\s*-?(128|192|256)$/i.exec(resolved.trim());
      if (aes) add(offset, { algorithm: 'AES', keySize: Number(aes[1]), usage });
      else add(offset, { algorithm: 'UNRESOLVED', usage }, `UNRESOLVED-${fn}`);
    } else {
      add(offset, { algorithm: normaliseSignature(resolved), usage });
    }
  }

  return [...assets.values()];
}

function apexCryptoScanner(): Scanner {
  return {
    category: 'apex-crypto',
    label: 'Apex cryptographic calls',
    async scan(client, emit) {
      const outcomes = new ObjectOutcomes();
      const units: Array<{ object: 'ApexClass' | 'ApexTrigger'; extension: string }> = [
        { object: 'ApexClass', extension: 'cls' },
        { object: 'ApexTrigger', extension: 'trigger' },
      ];

      for (const unit of units) {
        try {
          const res = await queryFirstAvailable<ApexClassRecord>(client, [
            {
              api: 'toolingQuery',
              soql: `SELECT Id, Name, Body, ApiVersion, NamespacePrefix FROM ${unit.object} WHERE NamespacePrefix = null`,
            },
          ]);
          if (!res) {
            outcomes.notAvailable(unit.object);
            continue;
          }
          outcomes.ok();
          for (const record of res.records) {
            if (!record.Body) continue;
            const assets = scanApexSource({
              id: record.Id,
              fileName: `${record.Name}.${unit.extension}`,
              body: record.Body,
            });
            for (const asset of assets) emit(asset);
          }
        } catch (err) {
          outcomes.failed(unit.object, err);
        }
      }

      outcomes.finish();
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
          throw new ScannerSkipError(`Session settings were not checked: ${unavailableNote('SessionSettings')}.`);
        }
        throw err;
      }
      const unreadable: string[] = [];
      for (const r of res.records) {
        const minutes = sessionTimeoutToMinutes(r.SessionTimeout);
        if (minutes === undefined) {
          unreadable.push(String(r.SessionTimeout));
          continue;
        }
        emit({
          kind: 'session-settings',
          name: 'SessionSettings',
          identifier: r.Id,
          location: `Session timeout: ${minutes} minutes`,
        });
      }
      if (unreadable.length > 0) {
        throw new ScannerPartialError(
          `SessionSettings.SessionTimeout has a value this version does not recognise: ${unreadable.join(', ')}`,
        );
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
