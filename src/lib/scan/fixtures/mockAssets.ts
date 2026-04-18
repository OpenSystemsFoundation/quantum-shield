import type { Category, CryptoAsset } from '@lib/pdf';

const BY_CATEGORY: Record<Category, CryptoAsset[]> = {
  certificates: [
    {
      kind: 'certificate',
      name: 'legacy_partner_signing',
      identifier: '03S1x00000ABcDeEAB',
      algorithm: 'RSA',
      keySize: 1024,
      signatureHash: 'SHA-1',
      issuer: 'Self-signed',
      expiresAt: '2026-11-14',
    },
    {
      kind: 'certificate',
      name: 'sso_saml_signing',
      identifier: '03S1x00000XyZtWEAB',
      algorithm: 'RSA',
      keySize: 2048,
      signatureHash: 'SHA-256',
      issuer: 'Internal CA',
      expiresAt: '2027-06-01',
    },
    {
      kind: 'certificate',
      name: 'inbound_partner_mtls_2026',
      identifier: '03S1x00000FfGhIEAB',
      algorithm: 'RSA',
      keySize: 3072,
      signatureHash: 'SHA-256',
      issuer: 'DigiCert',
      expiresAt: '2026-07-11',
    },
  ],
  'connected-apps': [
    {
      kind: 'connected-app',
      name: 'Partner Data Integration',
      identifier: 'ConnectedApplication/0C03x000000Xyz1',
      algorithm: 'RSA',
      keySize: 2048,
    },
  ],
  'named-credentials': [
    {
      kind: 'named-credential',
      name: 'legacy_billing_api',
      identifier: 'NamedCredential/0XA3x000000abCD',
      endpointUrl: 'http://billing-legacy.internal.example/api',
    },
    {
      kind: 'external-credential',
      name: 'partner_api_mtls',
      identifier: 'ExternalCredential/0XB3x000000bcDE',
      algorithm: 'ECDSA',
      keySize: 256,
    },
  ],
  'remote-sites': [
    {
      kind: 'remote-site',
      name: 'internal_reporting_http',
      identifier: 'RemoteSiteSetting/0rp3x000000aa',
      endpointUrl: 'http://reporting.internal.example',
    },
  ],
  sso: [
    {
      kind: 'saml-sso',
      name: 'Corporate IdP',
      identifier: 'SamlSsoConfig/00F3x000001aBcD',
      algorithm: 'RSA',
      keySize: 2048,
      signatureHash: 'SHA-1',
    },
    {
      kind: 'oidc-provider',
      name: 'Treasury Portal OIDC',
      identifier: 'AuthProvider/0SO3x000000jkL',
      algorithm: 'RSA',
      keySize: 2048,
    },
  ],
  'shield-encryption': [
    {
      kind: 'shield-key',
      name: 'Tenant secret (platform-managed)',
      identifier: 'TenantSecret/active',
      algorithm: 'AES',
      keySize: 128,
    },
  ],
  'apex-crypto': [
    {
      kind: 'apex-call',
      name: 'LegacyHashUtil.cls',
      identifier: 'ApexClass/01p3x000000abc:42',
      location: 'LegacyHashUtil.cls:42',
      algorithm: 'MD5',
    },
    {
      kind: 'apex-call',
      name: 'PartnerWebhookSigner.cls',
      identifier: 'ApexClass/01p3x000000def:118',
      location: 'PartnerWebhookSigner.cls:118',
      algorithm: 'RSA-SHA256',
    },
    {
      kind: 'apex-call',
      name: 'LegacyCipher.cls',
      identifier: 'ApexClass/01p3x000000ghi:27',
      location: 'LegacyCipher.cls:27',
      algorithm: 'HARDCODED-AES-KEY',
    },
  ],
  'session-login': [
    {
      kind: 'connected-app',
      name: 'SessionSettings',
      identifier: 'SessionSettings/global',
      location: '12h session timeout',
    },
  ],
  packages: [
    {
      kind: 'installed-package',
      name: 'Acme Signing Utilities',
      identifier: 'InstalledPackage/033xx0000000abc',
    },
  ],
};

export function buildMockAssets(category: Category): CryptoAsset[] {
  return BY_CATEGORY[category] ?? [];
}
