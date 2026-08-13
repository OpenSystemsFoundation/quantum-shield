import tls from 'node:tls';
import type { EndpointProbe, TlsProbeResult } from '../../src/lib/scan/probe.js';

const HYBRID_GROUP_PATTERNS = [/MLKEM/i, /KYBER/i, /X25519KYBER/i, /SECP256R1MLKEM/i];

function isHybridGroup(group: string | undefined): boolean {
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

export class NodeTlsProbe implements EndpointProbe {
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

    return new Promise<TlsProbeResult>((resolve) => {
      const socket = tls.connect(
        {
          host,
          port,
          servername: host,
          ALPNProtocols: ['h2', 'http/1.1'],
          minVersion: 'TLSv1',
        },
        () => {
          const protocol = socket.getProtocol() ?? undefined;
          const cipher = socket.getCipher();
          const peer = socket.getPeerCertificate(true);
          let keyExchangeGroup: string | undefined;
          const anySocket = socket as unknown as { getEphemeralKeyInfo?: () => { name?: string; type?: string } | null };
          const eph = typeof anySocket.getEphemeralKeyInfo === 'function' ? anySocket.getEphemeralKeyInfo() : null;
          if (eph && typeof eph === 'object') {
            keyExchangeGroup = eph.name ?? eph.type;
          }

          const sawHybrid = isHybridGroup(keyExchangeGroup ?? cipher?.name);
          const result: TlsProbeResult = {
            endpoint,
            ok: true,
            tlsVersion: protocol,
            cipher: cipher?.name,
            peerCertSigAlg: peer?.asn1Curve ?? peer?.sigalg ?? undefined,
            peerCertKeyType: peer?.pubkey ? 'RSA-or-EC' : undefined,
            peerCertKeyBits: peer?.bits,
            keyExchangeGroup,
            // Only assert "no hybrid" when this client could have negotiated
            // one; otherwise leave the capability unknown (undefined).
            hybridKemNegotiated: sawHybrid
              ? true
              : localStackSupportsMlKem()
                ? false
                : undefined,
          };
          socket.end();
          resolve(result);
        },
      );

      socket.setTimeout(timeoutMs, () => {
        socket.destroy();
        resolve({ endpoint, ok: false, error: 'timeout' });
      });

      socket.on('error', (err) => {
        resolve({ endpoint, ok: false, error: err.message });
      });
    });
  }
}
