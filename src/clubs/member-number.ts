export const DEFAULT_MEMBER_NUMBER_PREFIX = 'SOC-';
export const MEMBER_NUMBER_DIGIT_COUNT = 4;
export const MEMBER_NUMBER_PREFIX_MAX = 16;

export function normalizeMemberNumberPrefix(value: string | null | undefined): string {
  return (value ?? '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim()
    .slice(0, MEMBER_NUMBER_PREFIX_MAX);
}

export function formatMemberNumber(prefix: string | null | undefined, rawNumber: string): string {
  const digits = rawNumber.replace(/\D/g, '').slice(0, MEMBER_NUMBER_DIGIT_COUNT);
  if (!digits) {
    return '';
  }
  return `${normalizeMemberNumberPrefix(prefix)}${digits.padStart(MEMBER_NUMBER_DIGIT_COUNT, '0')}`;
}

/** Número de socio para mostrar, con el prefijo del club si el valor guardado es solo dígitos. */
export function displayMemberNumber(
  stored: string | null | undefined,
  prefix: string | null | undefined,
): string {
  const trimmed = (stored ?? '').trim();
  if (!trimmed) {
    return '';
  }
  const normalizedPrefix = normalizeMemberNumberPrefix(prefix);
  if (normalizedPrefix && trimmed.toLowerCase().startsWith(normalizedPrefix.toLowerCase())) {
    return trimmed;
  }
  if (/^\d+$/.test(trimmed.replace(/\s/g, ''))) {
    return formatMemberNumber(normalizedPrefix, trimmed) || trimmed;
  }
  return trimmed;
}
