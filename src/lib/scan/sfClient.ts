import type { Session } from '@lib/auth';

/**
 * Thin Salesforce REST/Tooling client, built on fetch so it runs cleanly
 * inside a Web Worker (jsforce's browser bundle assumes main-thread globals
 * that Workers don't expose — XHR-based transports fail in that context).
 *
 * Normalises errors so the scan engine can react consistently to CORS
 * blocks vs auth failures vs other API problems.
 */

export class CorsBlockedError extends Error {
  constructor(
    message: string,
    public readonly target: string,
  ) {
    super(message);
    this.name = 'CorsBlockedError';
  }
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

export interface QueryResult<T> {
  totalSize: number;
  done: boolean;
  records: T[];
  nextRecordsUrl?: string;
}

export interface ScanClient {
  query<T>(soql: string): Promise<QueryResult<T>>;
  toolingQuery<T>(soql: string): Promise<QueryResult<T>>;
  sobject<T>(name: string, id: string): Promise<T>;
}

export class SfClient implements ScanClient {
  constructor(private readonly session: Session) {}

  private apiBase(): string {
    return `${this.session.instanceUrl.replace(/\/$/, '')}/services/data/v${this.session.apiVersion}`;
  }

  private headers(extra: HeadersInit = {}): HeadersInit {
    return {
      Authorization: `Bearer ${this.session.accessToken}`,
      Accept: 'application/json',
      ...extra,
    };
  }

  private async run<T>(path: string, init?: RequestInit): Promise<T> {
    const url = path.startsWith('http') ? path : `${this.apiBase()}${path}`;
    let resp: Response;
    try {
      resp = await fetch(url, {
        ...init,
        headers: this.headers(init?.headers),
      });
    } catch (err) {
      throw new CorsBlockedError(
        `Browser blocked the request to ${url}. This usually means the customer's Salesforce org has not whitelisted the QuantumShield domain in Setup → CORS.`,
        url,
      );
    }
    if (resp.status === 401) {
      throw new AuthError('Session expired or invalid. Sign in again.');
    }
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Salesforce API ${resp.status} on ${url}: ${text.slice(0, 400)}`);
    }
    if (resp.status === 204) return undefined as unknown as T;
    return (await resp.json()) as T;
  }

  async query<T>(soql: string): Promise<QueryResult<T>> {
    const encoded = encodeURIComponent(soql);
    let next: string | undefined = `/query?q=${encoded}`;
    const records: T[] = [];
    let totalSize = 0;
    while (next) {
      const chunk: QueryResult<T> = await this.run<QueryResult<T>>(next);
      totalSize = chunk.totalSize;
      records.push(...chunk.records);
      next = chunk.done ? undefined : chunk.nextRecordsUrl;
    }
    return { totalSize, done: true, records };
  }

  async toolingQuery<T>(soql: string): Promise<QueryResult<T>> {
    const encoded = encodeURIComponent(soql);
    return this.run(`/tooling/query?q=${encoded}`);
  }

  async sobject<T>(name: string, id: string): Promise<T> {
    return this.run(`/sobjects/${name}/${id}`);
  }
}
