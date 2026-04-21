export type SnapshotQueryKind = 'query' | 'toolingQuery';

export interface SnapshotQueryResult {
  totalSize: number;
  done: boolean;
  records: unknown[];
  nextRecordsUrl?: string;
  [key: string]: unknown;
}

export interface SnapshotSource {
  targetOrg: string;
  orgId: string;
  orgName: string;
  instanceUrl: string;
  apiVersion: string;
}

export interface SnapshotSuccess {
  kind: SnapshotQueryKind;
  soql: string;
  outcome: 'success';
  result: SnapshotQueryResult;
}

export interface SnapshotError {
  kind: SnapshotQueryKind;
  soql: string;
  outcome: 'error';
  error: string;
}

export type SnapshotResponse = SnapshotSuccess | SnapshotError;

export interface ScanSnapshot {
  capturedAt: string;
  source: SnapshotSource;
  responses: SnapshotResponse[];
}