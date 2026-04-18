import * as Comlink from 'comlink';
import type { ScanEvent, ScanOptions, ScanWorkerApi } from './types.js';
import type { Report } from '@lib/pdf';

let workerRef: Worker | null = null;
let apiRef: Comlink.Remote<ScanWorkerApi> | null = null;

function ensureWorker(): Comlink.Remote<ScanWorkerApi> {
  if (!apiRef) {
    workerRef = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    apiRef = Comlink.wrap<ScanWorkerApi>(workerRef);
  }
  return apiRef;
}

export async function startScan(
  options: ScanOptions,
  onEvent: (event: ScanEvent) => void,
): Promise<Report> {
  const api = ensureWorker();
  return api.runScan(options, Comlink.proxy(onEvent));
}

export function disposeWorker(): void {
  if (workerRef) {
    workerRef.terminate();
    workerRef = null;
    apiRef = null;
  }
}
