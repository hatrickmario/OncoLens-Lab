/** Normalización base: NFKD sin marcas, minúsculas, todo lo que no es letra ni dígito a espacio, espacios colapsados. */
export function normalizarTexto(_texto: string): string {
  throw new Error('no implementado');
}

/** Clave flexiva de una palabra ya normalizada (design D3, reglas a–d). */
export function claveFlexiva(_palabra: string): string {
  throw new Error('no implementado');
}
