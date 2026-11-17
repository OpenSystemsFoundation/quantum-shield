/**
 * TLS endpoint probe contract. Shared between the CLI (which implements it on
 * top of `node:tls`) and the browser scan worker (which returns `null` — the
 * browser can't introspect the handshake, the customer has to trust the
 * advisory finding instead).
 */

export interface TlsProbeResult {
  endpoint: string;
  ok: boolean;
  tlsVersion?: string;
  cipher?: string;
  peerCertSigAlg?: string;
  peerCertKeyType?: string;
  peerCertKeyBits?: number;
  /**
   * Whether the endpoint completes a handshake with a hybrid post-quantum
   * group (X25519MLKEM768 / SecP256r1MLKEM768).
   *   true      — it did, in the first handshake or when offered only hybrids
   *   false     — it refused every hybrid-only handshake (or is not TLS 1.3)
   *   undefined — unknown: the probing machine's TLS stack cannot offer
   *               ML-KEM, or the hybrid-only handshake failed for a network
   *               reason. Never treat undefined as "no".
   */
  hybridKemNegotiated?: boolean;
  /**
   * Key-exchange group, when known: the name the runtime reported for the
   * first handshake, or the hybrid group that a hybrid-only handshake
   * succeeded with.
   */
  keyExchangeGroup?: string;
  /**
   * False when the endpoint's certificate chain did not verify against the
   * probing machine's CA store (private CA, self-signed, expired, wrong
   * host). The handshake is still inspected; `authorizationError` says why.
   */
  certificateTrusted?: boolean;
  authorizationError?: string;
  error?: string;
}

export interface EndpointProbe {
  probe(endpoint: string, timeoutMs?: number): Promise<TlsProbeResult>;
}

export class NoopProbe implements EndpointProbe {
  async probe(endpoint: string): Promise<TlsProbeResult> {
    return { endpoint, ok: false, error: 'probe-not-supported-in-browser' };
  }
}
