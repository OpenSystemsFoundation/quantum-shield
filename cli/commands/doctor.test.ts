import { describe, expect, it } from 'vitest';
import { compareVersions } from './doctor.js';

describe('compareVersions', () => {
  it('compares dotted versions numerically', () => {
    expect(compareVersions('22.23.4', '22.23.4')).toBe(0);
    expect(compareVersions('v22.24.0', '22.23.4')).toBeGreaterThan(0);
    expect(compareVersions('22.9.0', '22.23.4')).toBeLessThan(0);
    expect(compareVersions('24.0.0', '22.23.4')).toBeGreaterThan(0);
  });
});
