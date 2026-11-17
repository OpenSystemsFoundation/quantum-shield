import { describe, expect, it } from 'vitest';
import type { CryptoAsset } from '@lib/pdf';
import { SalesforceApiError, type QueryResult, type ScanClient } from './sfClient.js';
import {
  allScanners,
  scanApexSource,
  ScannerPartialError,
  ScannerSkipError,
  sessionTimeoutToMinutes,
  stripApexComments,
  tenantSecretOrigin,
} from './scanners.js';

const INVALID_TYPE = (object: string) =>
  new SalesforceApiError(
    `Salesforce API 400: sObject type '${object}' is not supported.`,
    400,
    `[{"message":"sObject type '${object}' is not supported.","errorCode":"INVALID_TYPE"}]`,
    'test',
  );

type Handler = (api: 'query' | 'toolingQuery', soql: string) => unknown[] | Error;

function fakeClient(handler: Handler): ScanClient {
  const run = async <T>(api: 'query' | 'toolingQuery', soql: string): Promise<QueryResult<T>> => {
    const outcome = handler(api, soql);
    if (outcome instanceof Error) throw outcome;
    return { totalSize: outcome.length, done: true, records: outcome as T[] };
  };
  return {
    query: (soql) => run('query', soql),
    toolingQuery: (soql) => run('toolingQuery', soql),
    sobject: async () => {
      throw new Error('not used');
    },
  };
}

async function runCategory(category: string, handler: Handler) {
  const scanner = allScanners().find((s) => s.category === category)!;
  const assets: CryptoAsset[] = [];
  let error: unknown;
  try {
    await scanner.scan(fakeClient(handler), (a) => assets.push(a));
  } catch (err) {
    error = err;
  }
  return { assets, error };
}

const objectOf = (soql: string) => /FROM (\w+)/.exec(soql)![1];

describe('INVALID_TYPE is never read as "the org has none"', () => {
  it('finds External Client Apps through REST when Tooling does not expose them (API v66)', async () => {
    const { assets, error } = await runCategory('connected-apps', (api, soql) => {
      const object = objectOf(soql);
      if (object === 'ConnectedApplication') return [];
      if (api === 'toolingQuery') return INVALID_TYPE(object);
      return [{ Id: '0xI1', DeveloperName: 'Scanner', MasterLabel: 'QuantumShield Scanner' }];
    });
    expect(error).toBeUndefined();
    expect(assets.map((a) => a.name)).toEqual(['QuantumShield Scanner']);
  });

  it('reports partial coverage when one app object is unavailable on both APIs', async () => {
    const { assets, error } = await runCategory('connected-apps', (_api, soql) => {
      const object = objectOf(soql);
      return object === 'ConnectedApplication' ? [{ Id: '0H41', Name: 'Legacy app' }] : INVALID_TYPE(object);
    });
    expect(assets).toHaveLength(1);
    expect(error).toBeInstanceOf(ScannerPartialError);
    expect((error as Error).message).toMatch(/ExternalClientApplication is not available at this API version or not permitted/);
  });

  it('skips the category, rather than reporting it scanned, when nothing was readable', async () => {
    for (const category of ['connected-apps', 'sso']) {
      const { assets, error } = await runCategory(category, (_api, soql) => INVALID_TYPE(objectOf(soql)));
      expect(assets, category).toHaveLength(0);
      expect(error, category).toBeInstanceOf(ScannerSkipError);
      expect((error as Error).message).toMatch(/not available at this API version or not permitted/);
    }
  });

  it('queries ExternalCredential through the Tooling API', async () => {
    const calls: string[] = [];
    const { assets, error } = await runCategory('named-credentials', (api, soql) => {
      const object = objectOf(soql);
      calls.push(`${api}:${object}`);
      if (object === 'NamedCredential') return [];
      if (api === 'query') return INVALID_TYPE(object);
      return [{ Id: '0pt1', DeveloperName: 'Partner', MasterLabel: 'Partner', AuthenticationProtocol: 'Oauth' }];
    });
    expect(error).toBeUndefined();
    expect(calls).toEqual(['query:NamedCredential', 'toolingQuery:ExternalCredential']);
    expect(assets.map((a) => a.kind)).toEqual(['external-credential']);
  });

  it('does not claim Shield is disabled when TenantSecret is unavailable', async () => {
    const { error } = await runCategory('shield-encryption', (_api, soql) => INVALID_TYPE(objectOf(soql)));
    expect(error).toBeInstanceOf(ScannerSkipError);
    const message = (error as Error).message;
    expect(message).not.toMatch(/is not enabled/i);
    expect(message).toMatch(/not provisioned in this org, or the user lacks/);
  });

  it('still fails the category on a real API error', async () => {
    const { error } = await runCategory('sso', () => new SalesforceApiError('boom', 500, 'boom', 'test'));
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(ScannerSkipError);
    expect(error).not.toBeInstanceOf(ScannerPartialError);
  });
});

describe('Shield tenant secret origin', () => {
  it('maps the documented TenantSecret.Source values', () => {
    expect(tenantSecretOrigin({ Source: 'HSM' })).toBe('salesforce');
    expect(tenantSecretOrigin({ Source: 'UPLOADED' })).toBe('byok');
    expect(tenantSecretOrigin({ Source: 'REMOTE', RemoteKeyIdentifier: 'kid-1' })).toBe('external');
    expect(tenantSecretOrigin({})).toBe('salesforce');
  });

  it('labels the active secret by its source', async () => {
    const { assets } = await runCategory('shield-encryption', () => [
      { Id: '02G1', Type: 'Data', Status: 'ACTIVE', Source: 'UPLOADED', CreatedDate: '2026-01-02T00:00:00.000+0000' },
      { Id: '02G2', Type: 'SearchIndex', Status: 'ACTIVE', Source: 'HSM' },
    ]);
    expect(assets[0].name).toBe('Tenant secret (Data) · BYOK');
    expect(assets[0].location).toMatch(/Customer-supplied key material \(BYOK\)/);
    expect(assets[1].name).toBe('Tenant secret (SearchIndex)');
    expect(assets[1].location).toMatch(/Salesforce-generated/);
  });
});

describe('SAML signing', () => {
  it('emits RSA with no key size so the unknown-key-size rule can report it', async () => {
    const { assets } = await runCategory('sso', (_api, soql) =>
      objectOf(soql) === 'SamlSsoConfig'
        ? [{ Id: '0LE1', DeveloperName: 'okta', MasterLabel: 'Okta', RequestSignatureMethod: 'RSA-SHA256' }]
        : [],
    );
    expect(assets[0]).toMatchObject({ kind: 'saml-sso', algorithm: 'RSA', signatureHash: 'SHA-256', usage: 'signature' });
    expect(assets[0].keySize).toBeUndefined();
  });
});

describe('session timeout', () => {
  it('maps every SessionSettings.SessionTimeout enum value to minutes', () => {
    expect(sessionTimeoutToMinutes('FifteenMinutes')).toBe(15);
    expect(sessionTimeoutToMinutes('ThirtyMinutes')).toBe(30);
    expect(sessionTimeoutToMinutes('SixtyMinutes')).toBe(60);
    expect(sessionTimeoutToMinutes('TwoHours')).toBe(120);
    expect(sessionTimeoutToMinutes('FourHours')).toBe(240);
    expect(sessionTimeoutToMinutes('EightHours')).toBe(480);
    expect(sessionTimeoutToMinutes('TwelveHours')).toBe(720);
    expect(sessionTimeoutToMinutes('TwentyFourHours')).toBe(1440);
    // Not real enum values — must not be guessed.
    expect(sessionTimeoutToMinutes('OneHour')).toBeUndefined();
    expect(sessionTimeoutToMinutes('TwoDays')).toBeUndefined();
  });

  it('records the timeout in minutes (15 minutes is not "0h")', async () => {
    const { assets } = await runCategory('session-login', () => [{ Id: '000', SessionTimeout: 'FifteenMinutes' }]);
    expect(assets[0].location).toBe('Session timeout: 15 minutes');
  });

  it('reports an unrecognised value as partial instead of dropping it', async () => {
    const { assets, error } = await runCategory('session-login', () => [{ Id: '000', SessionTimeout: 'Forever' }]);
    expect(assets).toHaveLength(0);
    expect(error).toBeInstanceOf(ScannerPartialError);
  });
});

describe('stripApexComments', () => {
  it('does not treat "/*/" as a complete comment', () => {
    const src = "/*/ Crypto.generateDigest('MD5', a); /*/ Blob b = Crypto.generateDigest('SHA-256', a);";
    const stripped = stripApexComments(src);
    expect(stripped).not.toContain('MD5');
    expect(stripped).toContain("'SHA-256'");
  });
});

describe('scanApexSource', () => {
  const scan = (body: string, fileName = 'T.cls') => scanApexSource({ id: '01p', fileName, body });
  const summary = (assets: CryptoAsset[]) =>
    assets.map((a) => `${a.location}|${a.algorithm}${a.keySize ? `-${a.keySize}` : ''}|${a.usage}`);

  it('matches sign, signXML, verify and verifyWithCertificate, case-insensitively', () => {
    const assets = scan(
      [
        "Crypto.sign('RSA-SHA256', d, k);",
        "Crypto.signXML('RSA-SHA1', node, null, 'cert');",
        "Boolean ok = Crypto.verify('ECDSA-SHA384', d, s, pub);",
        "Boolean ok2 = crypto.VERIFYWITHCERTIFICATE('RSA', d, s, 'cert');",
        "System.Crypto.signWithCertificate('rsa-sha512', d, 'cert');",
      ].join('\n'),
    );
    expect(summary(assets)).toEqual([
      'T.cls:1|RSA-SHA256|signature',
      'T.cls:2|RSA-SHA1|signature',
      'T.cls:3|ECDSA-SHA384|signature',
      'T.cls:4|RSA-SHA1|signature', // 'RSA' is an alias for RSA-SHA1
      'T.cls:5|RSA-SHA512|signature',
    ]);
  });

  it('matches generateMac, verifyHMac and generateAesKey', () => {
    const assets = scan(
      [
        "Crypto.generateMac('hmacSHA1', d, k);",
        "Crypto.verifyHMac('HmacSHA256', d, k, mac);",
        'Blob k1 = Crypto.generateAesKey(128);',
        'Blob k2 = Crypto.generateAesKey(256);',
      ].join('\n'),
    );
    expect(summary(assets)).toEqual([
      'T.cls:1|HMAC-SHA1|mac',
      'T.cls:2|HMAC-SHA256|mac',
      'T.cls:3|AES-128|key-generation',
      'T.cls:4|AES-256|key-generation',
    ]);
  });

  it('inventories strong algorithms so the CBOM is complete', () => {
    const assets = scan(
      [
        "Crypto.generateDigest('SHA-256', d);",
        "Crypto.generateDigest('SHA3-256', d);",
        "Crypto.encryptWithManagedIV('AES256', key, d);",
      ].join('\n'),
    );
    expect(summary(assets)).toEqual([
      'T.cls:1|SHA-256|digest',
      'T.cls:2|SHA3-256|digest',
      'T.cls:3|AES-256|encryption',
    ]);
  });

  it('resolves a constant, and reports a variable algorithm as unresolved', () => {
    const assets = scan(
      [
        "private static final String ALGO = 'RSA-SHA256';",
        'public static Blob a(Blob d, Blob k) { return Crypto.sign(ALGO, d, k); }',
        'public static Blob b(String algorithmName, Blob d) { return Crypto.generateDigest(algorithmName, d); }',
        "public static Blob c(Blob d, Blob k) { return Crypto.encryptWithManagedIV('AES' + bits, k, d); }",
      ].join('\n'),
    );
    expect(summary(assets)).toEqual([
      'T.cls:2|RSA-SHA256|signature',
      'T.cls:3|UNRESOLVED|digest',
      'T.cls:4|UNRESOLVED|encryption',
    ]);
  });

  it('ignores commented-out calls and look-alike classes', () => {
    const assets = scan(
      [
        "// Crypto.generateDigest('MD5', d);",
        "/* Crypto.sign('RSA', d, k); */",
        "MyCrypto.sign('RSA', d, k);",
        'ModernCrypto.encryptAes256(k, d);',
      ].join('\n'),
    );
    expect(assets).toEqual([]);
  });

  it('detects hardcoded keys in every literal form, at the declaration or the call', () => {
    const assets = scan(
      [
        "private static final Blob SECRET = EncodingUtil.base64Decode('c2VjcmV0LWtleS1tYXRlcmlhbA==');",
        "Blob hexKey = EncodingUtil.convertFromHex('000102030405060708090a0b0c0d0e0f');",
        'public static Blob a(Blob d) { return Crypto.generateMac(\'hmacSHA256\', d, SECRET); }',
        "public static Blob b(Blob d) { return Crypto.encryptWithManagedIV('AES128', hexKey, d); }",
        "public static Blob c(Blob d) { return Crypto.decryptWithManagedIV('AES256', Blob.valueOf('0123456789abcdef0123456789abcdef'), d); }",
        "public static Blob e(Blob d) { return Crypto.sign('RSA-SHA256', d, EncodingUtil.base64Decode('MIIEvQIBADANBg')); }",
      ].join('\n'),
    );
    const hardcoded = assets.filter((a) => a.algorithm?.startsWith('HARDCODED'));
    expect(hardcoded.map((a) => `${a.location}|${a.algorithm}`)).toEqual([
      'T.cls:1|HARDCODED-HMAC-KEY',
      'T.cls:2|HARDCODED-AES-KEY',
      'T.cls:5|HARDCODED-AES-KEY',
      'T.cls:6|HARDCODED-SIGNING-KEY',
    ]);
  });

  it('does not flag keys that are parameters, generated, or plain data blobs', () => {
    const modernCrypto = [
      'public with sharing class ModernCrypto {',
      '    public static String sha256(String input) {',
      "        return EncodingUtil.convertToHex(Crypto.generateDigest('SHA-256', Blob.valueOf(input)));",
      '    }',
      '    public static Blob encryptAes256(Blob key, Blob data) {',
      "        return Crypto.encryptWithManagedIV('AES256', key, data);",
      '    }',
      '    public static Blob roundTrip() {',
      '        Blob key = Crypto.generateAesKey(256);',
      "        Blob data = Blob.valueOf('hello world, not a key');",
      "        return Crypto.encryptWithManagedIV('AES256', key, data);",
      '    }',
      '}',
    ].join('\n');
    const assets = scan(modernCrypto, 'ModernCrypto.cls');
    expect(assets.filter((a) => a.algorithm?.startsWith('HARDCODED'))).toEqual([]);
    expect(assets.filter((a) => a.algorithm === 'UNRESOLVED')).toEqual([]);
  });

  it('names triggers with a .trigger extension', async () => {
    const { assets, error } = await runCategory('apex-crypto', (_api, soql) =>
      objectOf(soql) === 'ApexTrigger'
        ? [{ Id: '01q1', Name: 'OrderSync', Body: "trigger OrderSync on Order (before insert) { Crypto.generateDigest('MD5', b); }" }]
        : [],
    );
    expect(error).toBeUndefined();
    expect(assets.map((a) => a.location)).toEqual(['OrderSync.trigger:1']);
  });
});
