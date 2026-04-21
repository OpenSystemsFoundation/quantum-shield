import type { Citation } from '@lib/pdf';
import { GENERATED_CITATIONS } from './regulations.generated.js';

export const CITATIONS = GENERATED_CITATIONS satisfies Record<string, Citation>;

export type CitationKey = keyof typeof CITATIONS;

export function cite(...keys: CitationKey[]): Citation[] {
  return keys.map((k) => CITATIONS[k]);
}
