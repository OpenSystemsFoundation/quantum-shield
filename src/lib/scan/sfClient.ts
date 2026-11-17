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

/**
 * Transport-level failure (DNS, connection refused, offline, proxy) in an
 * environment where CORS cannot be the cause — i.e. the CLI. Aborts the
 * scan rather than failing category-by-category.
 */
export class NetworkError extends Error {
  constructor(
    message: string,
    public readonly target: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'NetworkError';
  }
}

/**
 * Non-2xx Salesforce API response. `status` and the raw `body` excerpt let
 * scanners distinguish "sObject not available in this org" (skip the
 * category) from genuine failures.
 */
export class SalesforceApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: string,
    public readonly url: string,
  ) {
    super(message);
    this.name = 'SalesforceApiError';
  }

  /** True when the queried sObject does not exist in this org/edition. */
  get sobjectUnavailable(): boolean {
    return /sObject type '[^']+' is not supported|INVALID_TYPE/i.test(this.body);
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
    // nextRecordsUrl comes back as an instance-relative /services/data/... path.
    const url = path.startsWith('http')
      ? path
      : path.startsWith('/services/')
        ? `${this.session.instanceUrl.replace(/\/$/, '')}${path}`
        : `${this.apiBase()}${path}`;
    let resp: Response;
    try {
      resp = await fetch(url, {
        ...init,
        headers: this.headers(init?.headers),
      });
    } catch (err) {
      // In a browser a rejected cross-origin fetch is most commonly a CORS
      // block (the allowlist step in Setup → CORS). In Node there is no CORS
      // — a rejected fetch is a transport problem, and telling a CLI user to
      // reconfigure CORS would be misleading.
      if (typeof document !== 'undefined') {
        throw new CorsBlockedError(
          `The browser blocked or could not complete the request to ${url}. ` +
            `This usually means the org has not added this site's origin in Setup → CORS — ` +
            `but it can also be a dropped network connection.`,
          url,
        );
      }
      const cause = err instanceof Error ? err.cause ?? err : err;
      const causeMessage = cause instanceof Error ? cause.message : String(cause);
      throw new NetworkError(`Network error reaching ${url}: ${causeMessage}`, url, err);
    }
    if (resp.status === 401) {
      throw new AuthError('Session expired or invalid. Sign in again.');
    }
    if (!resp.ok) {
      const text = await resp.text();
      throw new SalesforceApiError(
        `Salesforce API ${resp.status} on ${url}: ${text.slice(0, 400)}`,
        resp.status,
        text.slice(0, 1000),
        url,
      );
    }
    if (resp.status === 204) return undefined as unknown as T;
    return (await resp.json()) as T;
  }

  async query<T>(soql: string): Promise<QueryResult<T>> {
    const encoded = encodeURIComponent(soql);
    return this.runPaginated<T>(`/query?q=${encoded}`);
  }

  async toolingQuery<T>(soql: string): Promise<QueryResult<T>> {
    const encoded = encodeURIComponent(soql);
    return this.runPaginated<T>(`/tooling/query?q=${encoded}`);
  }

  /**
   * Follows `nextRecordsUrl` until done. Applies to both REST and Tooling
   * queries — Tooling also pages at 2000 records, and a large org's
   * ApexClass list will not fit one page.
   */
  private async runPaginated<T>(firstPath: string): Promise<QueryResult<T>> {
    let next: string | undefined = firstPath;
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

  async sobject<T>(name: string, id: string): Promise<T> {
    return this.run(`/sobjects/${name}/${id}`);
  }
}
