/// <reference lib="webworker" />
import * as Comlink from 'comlink';
import { runScan } from './engine.js';
import type { ScanEvent, ScanOptions, ScanWorkerApi } from './types.js';

const api: ScanWorkerApi = {
  async runScan(options: ScanOptions, listener: (event: ScanEvent) => void) {
    return runScan(options, (event) => {
      void listener(event);
    });
  },
};

Comlink.expose(api);
