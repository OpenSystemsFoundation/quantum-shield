import type { Citation } from '@lib/pdf';

export const CITATIONS = {
  BSI_TR_02102_1: {
    sourceId: 'BSI-TR-02102-1',
    title: 'Cryptographic Mechanisms: Recommendations and Key Lengths',
    jurisdiction: 'DE',
    section: '§3.6, §5',
    documentVersion: '2025-01',
    retrievalUrl:
      'https://www.bsi.bund.de/EN/Themen/Unternehmen-und-Organisationen/Standards-und-Zertifizierung/Technische-Richtlinien/TR-nach-Thema-sortiert/tr02102/tr02102_node.html',
  } satisfies Citation,
  ENISA_PQC_2024: {
    sourceId: 'ENISA-PQC-2024',
    title: 'Post-Quantum Cryptography: Integration study',
    jurisdiction: 'EU',
    section: '§4 Migration priorities',
    documentVersion: '2024',
    retrievalUrl:
      'https://www.enisa.europa.eu/publications/post-quantum-cryptography-integration-study',
  } satisfies Citation,
  NCSC_NL_PQC: {
    sourceId: 'NCSC-NL-PQC-factsheet',
    title: 'Factsheet Post-Quantum Cryptography',
    jurisdiction: 'NL',
    documentVersion: '2024',
    retrievalUrl: 'https://www.ncsc.nl/documenten/factsheets/2023/januari/17/factsheet-pqc',
  } satisfies Citation,
  ANSSI_PQC: {
    sourceId: 'ANSSI-PQC-notes',
    title: 'Post-Quantum Cryptography Transition Notes',
    jurisdiction: 'FR',
    documentVersion: '2024',
    retrievalUrl:
      'https://cyber.gouv.fr/publications/follow-position-paper-post-quantum-cryptography',
  } satisfies Citation,
  NCSC_UK_PQC: {
    sourceId: 'NCSC-UK-PQC',
    title: 'Preparing for Quantum-Safe Cryptography',
    jurisdiction: 'UK',
    documentVersion: '2023',
    retrievalUrl: 'https://www.ncsc.gov.uk/whitepaper/preparing-for-quantum-safe-cryptography',
  } satisfies Citation,
  NIST_FIPS_203: {
    sourceId: 'NIST-FIPS-203',
    title: 'Module-Lattice-Based Key-Encapsulation Mechanism (ML-KEM)',
    jurisdiction: 'INTL',
    documentVersion: '2024-08',
    retrievalUrl: 'https://csrc.nist.gov/pubs/fips/203/final',
  } satisfies Citation,
  NIST_FIPS_204: {
    sourceId: 'NIST-FIPS-204',
    title: 'Module-Lattice-Based Digital Signature Standard (ML-DSA)',
    jurisdiction: 'INTL',
    documentVersion: '2024-08',
    retrievalUrl: 'https://csrc.nist.gov/pubs/fips/204/final',
  } satisfies Citation,
  NIST_FIPS_205: {
    sourceId: 'NIST-FIPS-205',
    title: 'Stateless Hash-Based Digital Signature Standard (SLH-DSA)',
    jurisdiction: 'INTL',
    documentVersion: '2024-08',
    retrievalUrl: 'https://csrc.nist.gov/pubs/fips/205/final',
  } satisfies Citation,
  NIST_SP_800_131A: {
    sourceId: 'NIST-SP-800-131A-r3',
    title: 'Transitioning the Use of Cryptographic Algorithms and Key Lengths',
    jurisdiction: 'INTL',
    section: '§5.6.1, §6.2.1',
    documentVersion: 'Rev 3',
    retrievalUrl: 'https://csrc.nist.gov/pubs/sp/800/131/a/r3/final',
  } satisfies Citation,
  GDPR_ART_32: {
    sourceId: 'gdpr-art32',
    title: 'GDPR — security of processing',
    jurisdiction: 'EU',
    section: 'Art. 32(1)(a)',
    documentVersion: '2016/679',
    retrievalUrl: 'https://eur-lex.europa.eu/eli/reg/2016/679/oj',
  } satisfies Citation,
  NIS2: {
    sourceId: 'nis2-directive',
    title: 'NIS 2 Directive — cybersecurity risk-management measures',
    jurisdiction: 'EU',
    section: 'Art. 21(2)(h)',
    documentVersion: '2022/2555',
    retrievalUrl: 'https://eur-lex.europa.eu/eli/dir/2022/2555/oj',
  } satisfies Citation,
  DORA: {
    sourceId: 'dora-regulation',
    title: 'DORA — Digital Operational Resilience Act, ICT risk management',
    jurisdiction: 'EU',
    section: 'Art. 9(2)',
    documentVersion: '2022/2554',
    retrievalUrl: 'https://eur-lex.europa.eu/eli/reg/2022/2554/oj',
  } satisfies Citation,
} as const;

export type CitationKey = keyof typeof CITATIONS;

export function cite(...keys: CitationKey[]): Citation[] {
  return keys.map((k) => CITATIONS[k]);
}
