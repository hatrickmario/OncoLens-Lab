/** Comparaciones de listas que usan varias reglas. */

/** ¿Ambas listas tienen los mismos elementos, sin importar el orden? */
export const sameMembers = (left, right) => JSON.stringify([...(left ?? [])].sort()) === JSON.stringify([...(right ?? [])].sort());

/** Los elementos de `expected` que `declared` no contiene. */
export const lacking = (declared, expected) => expected.filter((item) => !(declared ?? []).includes(item));
