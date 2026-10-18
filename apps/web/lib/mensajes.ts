import es from '../messages/es.json';

/**
 * Textos de la interfaz (design D10): un objeto por espacio de nombres, solo texto plano.
 * Sin librería de i18n mientras haya un único idioma. Los textos obligatorios (RN-19) salen de aquí.
 */
export type Mensajes = typeof es;

export function mensajes(): Mensajes {
  return es;
}

/** Resuelve una clave con puntos (`evidence.error.generico`); una clave inexistente es un error de programación. */
export function textoDe(clave: string): string {
  let actual: unknown = es;
  for (const parte of clave.split('.')) {
    actual = (actual as Record<string, unknown> | undefined)?.[parte];
  }
  if (typeof actual !== 'string') throw new Error(`Clave de mensaje inexistente: ${clave}`);
  return actual;
}

/** Sustituye `{nombre}` por su valor en un texto de mensajes. */
export function rellenar(texto: string, valores: Record<string, string | number>): string {
  return texto.replace(/\{(\w+)\}/g, (_, nombre: string) => String(valores[nombre] ?? ''));
}
