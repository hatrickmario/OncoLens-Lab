import { createHash } from 'node:crypto';

/** JSON canónico: claves ordenadas en todos los niveles y sin espacios (L1D-93 D4). */
export function jsonCanonico(valor) {
  if (Array.isArray(valor)) return `[${valor.map(jsonCanonico).join(',')}]`;
  if (valor !== null && typeof valor === 'object') {
    const pares = Object.keys(valor)
      .sort()
      .map((clave) => `${JSON.stringify(clave)}:${jsonCanonico(valor[clave])}`);
    return `{${pares.join(',')}}`;
  }
  return JSON.stringify(valor);
}

/** Parte de los ítems que cubre cada valor de `validation.scope`. */
const COBERTURA_POR_ALCANCE = {
  datos_criticos: (items) => items,
  aplicabilidad: (items) => items,
  matriz_item_campo: (items) => items.map(({ key, destination }) => ({ key, destination })),
};

/** Alcances que sabe cubrir el hash: el esquema (`validation.scope`) y esta tabla deben coincidir. */
export const ALCANCES_CUBIERTOS = Object.keys(COBERTURA_POR_ALCANCE);

/**
 * SHA-256 hexadecimal del JSON canónico de lo que cubre `alcances` en `items`, sin el bloque `validation` (que no es
 * un ítem). Un alcance desconocido se ignora aquí: el esquema ya lo rechaza.
 */
export function catalogHashDe(alcances, items) {
  const cubierto = {};
  for (const alcance of [...alcances].sort()) {
    const cobertura = COBERTURA_POR_ALCANCE[alcance];
    if (cobertura !== undefined) cubierto[alcance] = cobertura(items);
  }
  return createHash('sha256').update(jsonCanonico(cubierto)).digest('hex');
}

/**
 * `catalogHash` de un `<tipo>/poblacion-reglas.json` (D4-03): SHA-256 del JSON canónico del archivo sin `version`.
 * El manifiesto lo declara en `poblacionReglas.<tipo>.catalogHash`; el validador lo recalcula.
 */
export function catalogHashDeReglasDePoblacion(archivo) {
  const contenido = Object.fromEntries(
    Object.entries(archivo).filter(([clave]) => clave !== 'version'),
  );
  return createHash('sha256').update(jsonCanonico(contenido)).digest('hex');
}
