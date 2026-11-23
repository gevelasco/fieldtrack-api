export const DOCUMENT_VALIDITY_CODES = ['na', '3m', '6m', '1y', '2y'] as const;
export type DocumentValidityCode = (typeof DOCUMENT_VALIDITY_CODES)[number];

export function normalizeValidityCode(value: unknown): DocumentValidityCode {
  if (typeof value === 'string' && (DOCUMENT_VALIDITY_CODES as readonly string[]).includes(value)) {
    return value as DocumentValidityCode;
  }
  return 'na';
}