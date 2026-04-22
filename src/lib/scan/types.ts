import type { Category, CryptoAsset, Finding, Jurisdiction, Report } from '@lib/pdf';
import type { Session } from '@lib/auth';

export interface ScanOptions {
  scanId: string;
  session: Session;
  overlays: string[];
  /**
   * Regulatory jurisdictions to include in rule filtering. Rules whose
   * citations do not map to any listed jurisdiction (and are not tagged INTL)
   * are skipped. Empty array = no region filter (all rules fire).
   */
  regions?: Jurisdiction[] | string[];
  /**
   * If true, run live TLS probes against NamedCredential / RemoteSite
   * endpoints. Only supported when `node:tls` is available (CLI). Ignored in
   * the browser scan engine.
   */
  probeTls?: boolean;
  mock?: boolean;
}

export type ScannerStatus = 'pending' | 'running' | 'completed' | 'skipped' | 'failed';

export interface ScannerProgress {
  category: Category;
  label: string;
  status: ScannerStatus;
  assetCount?: number;
  findingsCount?: number;
  error?: string;
  startedAt?: string;
  finishedAt?: string;
}

export type ScanEvent =
  | { type: 'started'; scanId: string; categories: Category[] }
  | { type: 'scanner-progress'; progress: ScannerProgress }
  | { type: 'asset'; category: Category; asset: CryptoAsset }
  | { type: 'finding'; finding: Finding }
  | { type: 'log'; level: 'info' | 'warn' | 'error'; message: string }
  | { type: 'completed'; report: Report }
  | { type: 'failed'; error: string; kind?: 'cors' | 'auth' | 'unknown' };

export type ScanEventListener = (event: ScanEvent) => void;

export interface ScanWorkerApi {
  runScan(options: ScanOptions, listener: ScanEventListener): Promise<Report>;
}

export { type Category, type CryptoAsset, type Finding, type Report };
