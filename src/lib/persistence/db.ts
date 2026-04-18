import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Report } from '@lib/pdf';

const DB_NAME = 'quantum-shield';
const DB_VERSION = 1;

interface ScanSummary {
  scanId: string;
  orgId: string;
  orgName: string;
  instanceUrl: string;
  startedAt: string;
  finishedAt?: string;
  totalFindings?: number;
  severityCounts?: Record<string, number>;
  status: 'running' | 'completed' | 'failed';
  error?: string;
}

interface StoredReport {
  scanId: string;
  orgId: string;
  savedAt: string;
  report: Report;
}

interface QuantumShieldDb extends DBSchema {
  scans: {
    key: string;
    value: ScanSummary;
    indexes: { 'by-org': string; 'by-startedAt': string };
  };
  reports: {
    key: string;
    value: StoredReport;
    indexes: { 'by-org': string };
  };
}

let dbPromise: Promise<IDBPDatabase<QuantumShieldDb>> | null = null;

export function getDb(): Promise<IDBPDatabase<QuantumShieldDb>> {
  if (!dbPromise) {
    dbPromise = openDB<QuantumShieldDb>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const scans = db.createObjectStore('scans', { keyPath: 'scanId' });
        scans.createIndex('by-org', 'orgId');
        scans.createIndex('by-startedAt', 'startedAt');
        const reports = db.createObjectStore('reports', { keyPath: 'scanId' });
        reports.createIndex('by-org', 'orgId');
      },
    });
  }
  return dbPromise;
}

export async function saveScanSummary(s: ScanSummary): Promise<void> {
  const db = await getDb();
  await db.put('scans', s);
}

export async function getScansForOrg(orgId: string): Promise<ScanSummary[]> {
  const db = await getDb();
  const scans = await db.getAllFromIndex('scans', 'by-org', orgId);
  return scans.sort((a, b) => (b.startedAt > a.startedAt ? 1 : -1));
}

export async function getScan(scanId: string): Promise<ScanSummary | undefined> {
  const db = await getDb();
  return db.get('scans', scanId);
}

export async function saveReport(r: StoredReport): Promise<void> {
  const db = await getDb();
  await db.put('reports', r);
}

export async function getReport(scanId: string): Promise<StoredReport | undefined> {
  const db = await getDb();
  return db.get('reports', scanId);
}

export async function clearAll(): Promise<void> {
  const db = await getDb();
  await db.clear('scans');
  await db.clear('reports');
}

export type { ScanSummary, StoredReport };
