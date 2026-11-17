import { describe, expect, it } from 'vitest';
import { NodeTlsProbe, type Handshake, type HandshakeOptions, type HandshakeOutcome } from './tls.js';

const TLS13: HandshakeOutcome = {
  ok: true,
  protocol: 'TLSv1.3',
  cipher: 'TLS_AES_256_GCM_SHA384',
  hasPeerKey: true,
  authorized: true,
};

function scripted(script: (options: HandshakeOptions, call: number) => HandshakeOutcome) {
  const calls: HandshakeOptions[] = [];
  const handshake: Handshake = async (options) => {
    calls.push(options);
    return script(options, calls.length);
  };
  return { handshake, calls };
}

const REFUSED: HandshakeOutcome = { ok: false, error: 'alert handshake failure', tlsRefused: true };

describe('NodeTlsProbe hybrid-KEM detection', () => {
  it('does not report "no hybrid" when OpenSSL 3.5 returns an empty ephemeral key info', async () => {
    // First handshake negotiated X25519MLKEM768 but the runtime reports {}
    // for it (group undefined). The hybrid-only handshake settles it.
    const { handshake, calls } = scripted((options) => (options.groups ? { ...TLS13 } : { ...TLS13, group: undefined }));
    const result = await new NodeTlsProbe(handshake, () => true).probe('https://pq.example');
    expect(result.hybridKemNegotiated).toBe(true);
    expect(result.keyExchangeGroup).toBe('X25519MLKEM768');
    expect(calls.map((c) => c.groups)).toEqual([undefined, 'X25519MLKEM768']);
  });

  it('reports false only after every hybrid-only handshake is refused', async () => {
    const { handshake, calls } = scripted((options) => (options.groups ? REFUSED : { ...TLS13, group: 'X25519' }));
    const result = await new NodeTlsProbe(handshake, () => true).probe('https://classical.example');
    expect(result.hybridKemNegotiated).toBe(false);
    expect(result.keyExchangeGroup).toBe('X25519');
    expect(calls.map((c) => c.groups)).toEqual([undefined, 'X25519MLKEM768', 'SecP256r1MLKEM768']);
  });

  it('finds a server that prefers a classical group but accepts a hybrid one', async () => {
    const { handshake } = scripted((options) =>
      options.groups === 'SecP256r1MLKEM768' ? { ...TLS13 } : options.groups ? REFUSED : { ...TLS13, group: 'X25519' },
    );
    const result = await new NodeTlsProbe(handshake, () => true).probe('https://prefers-classical.example');
    expect(result.hybridKemNegotiated).toBe(true);
    expect(result.keyExchangeGroup).toBe('SecP256r1MLKEM768');
  });

  it('leaves it unknown when the hybrid-only handshake fails for a network reason', async () => {
    const { handshake } = scripted((options) =>
      options.groups ? { ok: false, error: 'timeout', tlsRefused: false } : { ...TLS13 },
    );
    const result = await new NodeTlsProbe(handshake, () => true).probe('https://flaky.example');
    expect(result.ok).toBe(true);
    expect(result.hybridKemNegotiated).toBeUndefined();
  });

  it('leaves it unknown, with one handshake, when the local stack cannot offer ML-KEM', async () => {
    const { handshake, calls } = scripted(() => ({ ...TLS13, group: 'X25519' }));
    const result = await new NodeTlsProbe(handshake, () => false).probe('https://any.example');
    expect(result.hybridKemNegotiated).toBeUndefined();
    expect(calls).toHaveLength(1);
  });

  it('does not attempt hybrid handshakes below TLS 1.3', async () => {
    const { handshake, calls } = scripted(() => ({ ...TLS13, protocol: 'TLSv1.2', cipher: 'ECDHE-RSA-AES256-GCM-SHA384' }));
    const result = await new NodeTlsProbe(handshake, () => true).probe('https://old.example');
    expect(result.tlsVersion).toBe('TLSv1.2');
    expect(result.hybridKemNegotiated).toBe(false);
    expect(calls).toHaveLength(1);
  });
});

describe('NodeTlsProbe certificate trust', () => {
  it('still reports the handshake for a private-CA endpoint and records the verification error', async () => {
    const { handshake } = scripted((options) =>
      options.groups
        ? REFUSED
        : { ...TLS13, group: 'X25519', authorized: false, authorizationError: 'SELF_SIGNED_CERT_IN_CHAIN' },
    );
    const result = await new NodeTlsProbe(handshake, () => true).probe('https://internal.example');
    expect(result.ok).toBe(true);
    expect(result.tlsVersion).toBe('TLSv1.3');
    expect(result.certificateTrusted).toBe(false);
    expect(result.authorizationError).toBe('SELF_SIGNED_CERT_IN_CHAIN');
  });

  it('reports a genuine connection failure as not ok', async () => {
    const { handshake } = scripted(() => ({ ok: false, error: 'connect ECONNREFUSED', tlsRefused: false }));
    const result = await new NodeTlsProbe(handshake).probe('https://down.example');
    expect(result).toEqual({ endpoint: 'https://down.example', ok: false, error: 'connect ECONNREFUSED' });
  });

  it('rejects non-HTTPS and malformed endpoints without connecting', async () => {
    const { handshake, calls } = scripted(() => TLS13);
    const probe = new NodeTlsProbe(handshake);
    expect((await probe.probe('http://plain.example')).ok).toBe(false);
    expect((await probe.probe('not a url')).error).toBe('invalid-url');
    expect(calls).toHaveLength(0);
  });
});
