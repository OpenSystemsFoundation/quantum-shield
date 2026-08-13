import { SalesforceApiError, type QueryResult, type ScanClient } from '../sfClient.js';
import type { ScanSnapshot, SnapshotQueryKind, SnapshotResponse } from './types.js';

function cloneResult<T>(result: QueryResult<unknown>): QueryResult<T> {
  return JSON.parse(JSON.stringify(result)) as QueryResult<T>;
}

export class SnapshotSfClient implements ScanClient {
  constructor(private readonly snapshot: ScanSnapshot) {}

  private lookup(kind: SnapshotQueryKind, soql: string): SnapshotResponse {
    const response = this.snapshot.responses.find(
      (entry) => entry.kind === kind && entry.soql === soql,
    );
    if (!response) {
      throw new Error(`Missing ${kind} fixture for query: ${soql}`);
    }
    return response;
  }

  private resolve<T>(kind: SnapshotQueryKind, soql: string): QueryResult<T> {
    const response = this.lookup(kind, soql);
    if (response.outcome === 'error') {
      // Replay recorded API errors with the same type the live client throws
      // so scanners' skip/partial handling behaves identically in mock mode.
      const statusMatch = /Salesforce API (\d{3})/.exec(response.error);
      throw new SalesforceApiError(
        response.error,
        statusMatch ? Number(statusMatch[1]) : 400,
        response.error,
        `snapshot:${kind}`,
      );
    }
    return cloneResult<T>(response.result);
  }

  async query<T>(soql: string): Promise<QueryResult<T>> {
    return this.resolve<T>('query', soql);
  }

  async toolingQuery<T>(soql: string): Promise<QueryResult<T>> {
    return this.resolve<T>('toolingQuery', soql);
  }

  async sobject<T>(_name: string, _id: string): Promise<T> {
    throw new Error('Snapshot client does not implement sobject() fixtures yet.');
  }
}