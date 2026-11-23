/** Marcador de identidad de la pregunta del caso → texto de identidad sintética de `P-CHAT`, antes de enmascarar (RN-10). */
export function resolverMarcadorDeIdentidad(_pregunta: string): string {
  throw new Error('no implementado');
}

/** Claves del seed de `hechos_esperados` → `factRef` de la petición (solo claves semánticas y `factRef`, nunca UUID). */
export function traducirHechosEsperados(
  _hechosEsperados: readonly string[],
  _enlaces: readonly { factRef: string; resourceId: string }[],
  _recursoDelSeed: (clave: string) => string | null,
): Record<string, string> {
  throw new Error('no implementado');
}
