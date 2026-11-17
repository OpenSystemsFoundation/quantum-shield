import tls from 'node:tls';
import type { EndpointProbe, TlsProbeResult } from '../../src/lib/scan/probe.js';

const HYBRID_GROUP_PATTERNS = [/MLKEM/i, /KYBER/i];

/** Hybrid ML-KEM groups offered, one at a time, by the hybrid-only handshake. */
export const HYBRID_GROUPS = ['X25519MLKEM768', 'SecP256r1MLKEM768'] as const;

export function isHybridGroup(group: string | undefined): boolean {
  if (!group) return false;
  return HYBRID_GROUP_PATTERNS.some((p) => p.test(group));
}

/**
 * Whether the local TLS stack can offer ML-KEM hybrid groups at all.
 * OpenSSL gained ML-KEM (X25519MLKEM768 etc.) in 3.5; on older builds a
 * classical negotiation tells us nothing about the server's hybrid support,
 * so `hybridKemNegotiated` must stay undefined instead of a false negative.
 */
export function localStackSupportsMlKem(): boolean {
  const raw = process.versions.openssl ?? '';
  const match = /^(\d+)\.(\d+)/.exec(raw);
  if (!match) return false;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  return major > 3 || (major === 3 && minor >= 5);
}

export interface HandshakeOptions {
  host: string;
  port: number;
  timeoutMs: number;
  /** Restrict the key-exchange groups offered (OpenSSL group list). */
  groups?: string;
}

export type HandshakeOutcome =
  | {
      ok: true;
      protocol?: string;
      cipher?: string;
      /** Ephemeral group name, when the runtime reports one. */
      group?: string;
      peerBits?: number;
      peerSigAlg?: string;
      hasPeerKey: boolean;
      /** False when the chain did not verify against the local CA store. */
      authorized: boolean;
      authorizationError?: string;
    }
  | {
      ok: false;
      error: string;
      /**
       * True when the TLS layer itself refused (alert / no shared parameters),
       * as opposed to a network problem (timeout, DNS, connection refused).
       */
      tlsRefused: boolean;
    };

export type Handshake = (options: HandshakeOptions) => Promise<HandshakeOutcome>;

function isTlsRefusal(err: Error & { code?: string }): boolean {
  if (typeof err.code === 'string' && err.code.startsWith('ERR_SSL')) return true;
  return /alert|handshake failure|no shared|illegal parameter|unsupported/i.test(err.message);
}

/**
 * One TLS handshake. Nothing is sent after the handshake: the socket is
 * closed as soon as the negotiated parameters have been read.
 *
 * - `rejectUnauthorized: false`: the probe inspects the handshake, it does
 *   not trust the peer with data. Failing on an untrusted chain would report
 *   every endpoint behind a private CA as "unreachable" and hide its TLS
 *   posture; the verification result is recorded separately instead.
 * - `minVersion: 'TLSv1'` with `@SECLEVEL=0`: OpenSSL's default security
 *   level refuses TLS 1.0/1.1 outright, so without it an endpoint that only
 *   speaks those versions looks unreachable rather than obsolete. Offering
 *   old versions does not downgrade anything — the server still picks the
 *   highest version both sides support.
 */
export const nodeHandshake: Handshake = ({ host, port, timeoutMs, groups }) =>
  new Promise<HandshakeOutcome>((resolve) => {
    let settled = false;
    const finish = (outcome: HandshakeOutcome) => {
      if (settled) return;
      settled = true;
      resolve(outcome);
    };

    let socket: tls.TLSSocket;
    try {
      socket = tls.connect(
        {
          host,
          port,
          servername: host,
          ALPNProtocols: ['h2', 'http/1.1'],
          minVersion: 'TLSv1',
          ciphers: 'DEFAULT:@SECLEVEL=0',
          rejectUnauthorized: false,
          ...(groups ? { ecdhCurve: groups } : {}),
        },
        () => {
          const cipher = socket.getCipher();
          const peer = socket.getPeerCertificate(true);
          const anySocket = socket as unknown as {
            getEphemeralKeyInfo?: () => { name?: string; type?: string } | null;
          };
          const eph =
            typeof anySocket.getEphemeralKeyInfo === 'function' ? anySocket.getEphemeralKeyInfo() : null;
          const authorizationError = socket.authorizationError
            ? String(
                (socket.authorizationError as unknown as { code?: string }).code ??
                  (socket.authorizationError as unknown as Error).message ??
                  socket.authorizationError,
              )
            : undefined;
          const outcome: HandshakeOutcome = {
            ok: true,
            protocol: socket.getProtocol() ?? undefined,
            cipher: cipher?.name,
            // OpenSSL ≥ 3.5 returns an empty object for ML-KEM hybrid groups
            // (they are not ECDH/DH keys), so a missing name is "unknown",
            // never "classical".
            group: eph && typeof eph === 'object' ? eph.name ?? undefined : undefined,
            peerBits: peer?.bits,
            // @types/node's DetailedPeerCertificate omits sigalg, but Node
            // populates it at runtime for most certs.
            peerSigAlg: peer?.asn1Curve ?? (peer as { sigalg?: string } | null)?.sigalg ?? undefined,
            hasPeerKey: Boolean(peer?.pubkey),
            authorized: socket.authorized,
            ...(authorizationError ? { authorizationError } : {}),
          };
          socket.end();
          finish(outcome);
        },
      );
    } catch (err) {
      // Thrown synchronously when the local stack does not know a requested
      // group — that says nothing about the server.
      finish({ ok: false, error: (err as Error).message, tlsRefused: false });
      return;
    }

    socket.setTimeout(timeoutMs, () => {
      socket.destroy();
      finish({ ok: false, error: 'timeout', tlsRefused: false });
    });

    socket.on('error', (err: Error & { code?: string }) => {
      finish({ ok: false, error: err.message, tlsRefused: isTlsRefusal(err) });
    });
  });

export class NodeTlsProbe implements EndpointProbe {
  constructor(
    private readonly handshake: Handshake = nodeHandshake,
    private readonly stackSupportsMlKem: () => boolean = localStackSupportsMlKem,
  ) {}

  async probe(endpoint: string, timeoutMs = 8000): Promise<TlsProbeResult> {
    let url: URL;
    try {
      url = new URL(endpoint);
    } catch {
      return { endpoint, ok: false, error: 'invalid-url' };
    }
    if (url.protocol !== 'https:') {
      return { endpoint, ok: false, error: `non-https-protocol:${url.protocol}` };
    }
    const host = url.hostname;
    const port = url.port ? Number(url.port) : 443;

    const first = await this.handshake({ host, port, timeoutMs });
    if (!first.ok) return { endpoint, ok: false, error: first.error };

    const result: TlsProbeResult = {
      endpoint,
      ok: true,
      tlsVersion: first.protocol,
      cipher: first.cipher,
      peerCertSigAlg: first.peerSigAlg,
      peerCertKeyType: first.hasPeerKey ? 'RSA-or-EC' : undefined,
      peerCertKeyBits: first.peerBits,
      keyExchangeGroup: first.group,
      certificateTrusted: first.authorized,
      ...(first.authorizationError ? { authorizationError: first.authorizationError } : {}),
    };

    if (first.protocol !== 'TLSv1.3') {
      // Hybrid KEMs exist only in TLS 1.3; the TLS-version rule covers this.
      result.hybridKemNegotiated = false;
      return result;
    }

    if (isHybridGroup(first.group)) {
      result.hybridKemNegotiated = true;
      return result;
    }

    if (!this.stackSupportsMlKem()) {
      // This client cannot offer ML-KEM, so the endpoint's capability is
      // unknown — not "no".
      result.hybridKemNegotiated = undefined;
      return result;
    }

    // The first handshake does not settle it: the runtime may not name a
    // hybrid group (see nodeHandshake), and a server that supports hybrids
    // may still prefer a classical group. Ask directly — offer ONLY a hybrid
    // group. Success proves support; a TLS-level refusal proves the opposite.
    let refusals = 0;
    for (const group of HYBRID_GROUPS) {
      const attempt = await this.handshake({ host, port, timeoutMs, groups: group });
      if (attempt.ok) {
        result.hybridKemNegotiated = true;
        result.keyExchangeGroup = group;
        return result;
      }
      if (attempt.tlsRefused) refusals += 1;
    }
    // Only a refusal of every hybrid group is evidence of "no"; a timeout or
    // reset on the second connection leaves it unknown.
    result.hybridKemNegotiated = refusals === HYBRID_GROUPS.length ? false : undefined;
    return result;
  }
}
