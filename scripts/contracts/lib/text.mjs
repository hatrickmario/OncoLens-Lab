/** Utilidades de texto: la comparación de frases normativas y de RN-23 no distingue mayúsculas ni acentos. */

/** Minúsculas, sin acentos y con los espacios colapsados (NFD). */
export function normalizeText(text) {
  return String(text)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Nombre de propiedad comparable: sin `_` ni `-` y en minúsculas, así cubre camelCase y snake_case. */
export function normalizeName(name) {
  return String(name).replace(/[_-]/g, '').toLowerCase();
}

/** Los fragmentos que `text` no contiene, comparando sin mayúsculas ni acentos. */
export function missingFragments(text, fragments) {
  const normalized = normalizeText(text ?? '');
  return fragments.filter((fragment) => !normalized.includes(normalizeText(fragment)));
}
