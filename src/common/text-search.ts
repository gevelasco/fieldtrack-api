/** Misma normalización que `members.search_text` y búsquedas LIKE en la API. */
export function normalizeSearchTerm(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}
