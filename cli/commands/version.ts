import { stdout } from 'node:process';
import { QSHIELD_HOMEPAGE, QSHIELD_VERSION } from '../../src/lib/version.js';
import { writeJson } from '../output/json.js';

export async function versionCommand(json: boolean): Promise<number> {
  if (json) {
    writeJson({ schema: 'qshield.version/v1', name: 'qshield', version: QSHIELD_VERSION, homepage: QSHIELD_HOMEPAGE });
  } else {
    stdout.write(`qshield ${QSHIELD_VERSION}\n`);
  }
  return 0;
}
