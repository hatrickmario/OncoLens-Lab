/**
 * Reglas de `<tipo>/sinonimos.json` (L1D-335, US-277, revisión clínica S-1): cada sinónimo declara su `relacion` con el
 * término canónico y solo `equivalente` equipara el texto al canónico. La forma la comprueba `sinonimos.schema.json`,
 * que solo entra si estas reglas callan; el conjunto cerrado de relaciones vive en ese esquema y aquí solo se nombra
 * la que equipara (`RELACION_EQUIVALENTE`, un único dueño en el validador; un test fija que el esquema la contiene).
 *
 * - `sinonimo_equivalente_ambiguo`: un texto `equivalente` de dos términos, o canónico de uno y `equivalente` de otro;
 * - `termino_canonico_repetido`: el mismo término canónico dos veces;
 * - `sinonimo_igual_al_canonico`: un sinónimo que repite el texto de su propio término canónico (sin ignorar tildes: la
 *   grafía de otro idioma, como `deruxtecan`, no es una repetición; las tildes y erratas las resuelve la normalización, S-6).
 *
 * Cada violación nombra el código y el archivo, nunca valores del catálogo: `{ codigo, archivo: 'sinonimos' }`.
 * Las siglas de dos letras nuevas (S-3) se fijan con un test de contenido sobre el diff, no aquí: las vigentes
 * (`RE`, `RP`, `ER`, `PR`) son válidas.
 */

export const RELACION_EQUIVALENTE = 'equivalente';

const esObjeto = (valor) => valor !== null && typeof valor === 'object' && !Array.isArray(valor);
const lista = (valor) => (Array.isArray(valor) ? valor.filter(esObjeto) : []);

/** Misma comparación que `normalizar_texto` de `rag-orchestrator`: sin tildes, en minúsculas y con espacios simples. */
const normalizar = (texto) =>
  typeof texto === 'string'
    ? texto
        .normalize('NFD')
        .replace(/\p{Mn}/gu, '')
        .toLowerCase()
        .replace(/\s+/gu, ' ')
        .trim()
    : '';

/** Misma grafía, sin ignorar tildes: «deruxtecan» (en) no repite «deruxtecán» (es); lo único redundante es el texto idéntico. */
const mismaGrafia = (texto) => (typeof texto === 'string' ? texto.toLowerCase().trim() : '');

const canonicoDe = (item) => normalizar(item.terminoCanonico);
const equivalentesDe = (item) =>
  lista(item.sinonimos)
    .filter((s) => s.relacion === RELACION_EQUIVALENTE)
    .map((s) => normalizar(s.texto));

/** Los términos (por posición) que nombran `texto` como su canónico o como uno de sus equivalentes. */
const terminosQueEquiparan = (items, texto) =>
  items.filter((item) => canonicoDe(item) === texto || equivalentesDe(item).includes(texto));

/** ¿Algún texto equivale a dos términos distintos (canónico de uno y equivalente de otro, o equivalente de ambos)? */
export function equivalentesAmbiguos(items) {
  return items.some((item) =>
    equivalentesDe(item).some((texto) =>
      terminosQueEquiparan(items, texto).some((otro) => otro !== item),
    ),
  );
}

export function canonicosRepetidos(items) {
  const canonicos = items.map(canonicoDe);
  return new Set(canonicos).size !== canonicos.length;
}

export function sinonimoIgualAlCanonico(items) {
  return items.some((item) =>
    lista(item.sinonimos).some((s) => mismaGrafia(s.texto) === mismaGrafia(item.terminoCanonico)),
  );
}

const REGLAS = [
  ['sinonimo_equivalente_ambiguo', equivalentesAmbiguos],
  ['termino_canonico_repetido', canonicosRepetidos],
  ['sinonimo_igual_al_canonico', sinonimoIgualAlCanonico],
];

/** @returns {{ codigo: string, archivo: 'sinonimos' }[]} */
export function violacionesDeSinonimos(archivo) {
  const items = lista(archivo?.items);
  return REGLAS.filter(([, hay]) => hay(items)).map(([codigo]) => ({
    codigo,
    archivo: 'sinonimos',
  }));
}
