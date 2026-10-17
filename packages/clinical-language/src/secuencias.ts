/** Posiciones de inicio en las que `secuencia` aparece completa y consecutiva dentro de `haystack`. */
export function posicionesDe(haystack: string[], secuencia: string[]): number[] {
  const posiciones: number[] = [];
  if (secuencia.length === 0) return posiciones;
  for (let inicio = 0; inicio + secuencia.length <= haystack.length; inicio++) {
    if (secuencia.every((palabra, i) => haystack[inicio + i] === palabra)) posiciones.push(inicio);
  }
  return posiciones;
}
