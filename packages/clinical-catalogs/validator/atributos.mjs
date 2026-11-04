/**
 * Reglas de `atributos.json` (L1D-80, RN-29): los valores permitidos de una clave no se repiten. Que `values` exista,
 * tenga la forma de un valor lo exige el esquema; aquí se nombra la clave cuyos valores están vacíos o repetidos. La violación nombra la clave del catálogo (no es dato
 * clínico): `{ codigo, archivo: 'atributos', elemento }`.
 */

const lista = (valor) =>
  Array.isArray(valor) ? valor.filter((e) => e && typeof e === 'object') : [];

/** @returns {{ codigo: string, archivo: string, elemento: string }[]} */
export function violacionesDeAtributos(atributos) {
  return lista(atributos?.keys).flatMap((clave) => {
    const violacion = (codigo) => ({ codigo, archivo: 'atributos', elemento: String(clave.key) });
    const valores = lista(clave.values).map((v) => v.value);
    if (Array.isArray(clave.values) && valores.length === 0) return [violacion('valores_vacios')];
    return new Set(valores).size === valores.length ? [] : [violacion('valor_repetido')];
  });
}
