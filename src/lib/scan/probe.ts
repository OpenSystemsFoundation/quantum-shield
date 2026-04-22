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
   * True if the peer negotiated a hybrid post-quantum group (e.g.
   * X25519MLKEM768 / SecP256r1MLKEM768). Derived from the negotiated
   * ephemeral group name when the runtime exposes it; otherwise undefined.
   */
  hybridKemNegotiated?: boolean;
  /**
   * Name of the ephemeral key-exchange group if the runtime reports it.
   * OpenSSL 3.5+ surfaces this; older builds do not.
   */
  keyExchangeGroup?: string;
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
