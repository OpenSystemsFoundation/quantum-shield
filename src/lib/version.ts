/**
 * Single source of truth for the tool version stamped into generated
 * artifacts (PDF, CBOM, OpenVEX, report JSON). Keep in sync with
 * package.json's "version" field — CI checks the two match.
 */
export const QSHIELD_VERSION = '0.1.0';

export const QSHIELD_NAME = 'QuantumShield';

/** Public project home, used in artifact metadata and document IDs. */
export const QSHIELD_HOMEPAGE = 'https://github.com/OpenSystemsFoundation/quantum-shield';
