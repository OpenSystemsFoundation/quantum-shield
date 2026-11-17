import type { Category, CryptoAsset, Finding, Jurisdiction, Report, RiskAssumptions } from '@lib/pdf';
import type { Session } from '@lib/auth';

export interface ScanOptions {
  scanId: string;
  session: Session;
  overlays: string[];
  /**
   * Regulatory jurisdictions the reader cares about. Regions never decide
   * which rules fire — every detection runs for every scan. They scope each
   * finding's citations: sources from the listed jurisdictions (and
   * international ones) are shown first and unrelated ones are dropped when
   * an in-region source exists. Empty array = citations left as authored.
   */
  regions?: Jurisdiction[] | string[];
  /**
   * If true, run live TLS probes against NamedCredential / RemoteSite
   * endpoints. Only supported when `node:tls` is available (CLI). Ignored in
   * the browser scan engine.
   */
  probeTls?: boolean;
  mock?: boolean;
  /**
   * Which front-end is running this scan; stamped into Report.generator so
   * artifact methodology text matches how the report was actually produced.
   * Defaults to 'browser'.
   */
  generatorMode?: 'cli' | 'browser';
  /**
   * Assumptions the stored finding priorities are computed with. Defaults to
   * DEFAULT_ASSUMPTIONS; viewers can recompute with their own at any time.
   */
  riskAssumptions?: RiskAssumptions;
  /** Skip the data-sensitivity pass (priorities then assume personal data). */
  skipDataProfile?: boolean;
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
