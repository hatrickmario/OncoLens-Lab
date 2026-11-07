/**
 * Reglas de `lenguaje/marcos-de-pregunta.json` (L1D-329, ADR-52, RN-29): cada idioma (`es`, `en`) presente, con sus
 * listas `marcos` y `vacias` no vacías, sin entradas vacías, repetidas ni sin normalizar. Las reglas con nombre explican
 * mejor un fallo que el esquema genérico, que solo entra si ellas callan. La violación nombra el campo del catálogo (no
 * es dato clínico): `{ codigo, archivo: 'marcos-de-pregunta', campo }`.
 */

const IDIOMAS = ['es', 'en'];
const LISTAS = ['marcos', 'vacias'];
const NORMALIZADA = /^[a-z0-9]+(?: [a-z0-9]+)*$/;

const esObjeto = (valor) => valor !== null && typeof valor === 'object' && !Array.isArray(valor);

function violacionesDeLaLista(entradas, campo) {
  const violacion = (codigo) => ({ codigo, archivo: 'marcos-de-pregunta', campo });
  if (!Array.isArray(entradas) || entradas.length === 0) return [violacion('lista_vacia')];
  const textos = entradas.filter((entrada) => typeof entrada === 'string');
  return [
    ...(textos.some((entrada) => entrada.trim() === '') ? [violacion('entrada_vacia')] : []),
    ...(new Set(textos).size === textos.length ? [] : [violacion('entrada_duplicada')]),
    ...(textos.some((entrada) => entrada.trim() !== '' && !NORMALIZADA.test(entrada))
      ? [violacion('entrada_no_normalizada')]
      : []),
  ];
}

/** `expansion.biomarcadoresNoAnclables` (L1D-331): cada tipo con su lista bien formada; el campo es `expansion_<tipo>`. */
function violacionesDeLaExpansion(expansion) {
  const porTipo = expansion?.biomarcadoresNoAnclables;
  if (!esObjeto(porTipo)) return [];
  return Object.entries(porTipo).flatMap(([tipo, entradas]) =>
    violacionesDeLaLista(entradas, `expansion_${/^[a-z]+$/.test(tipo) ? tipo : '?'}`),
  );
}

/** @returns {{ codigo: string, archivo: string, campo: string }[]} */
export function violacionesDeMarcos(marcos) {
  return [...violacionesDeLosIdiomas(marcos), ...violacionesDeLaExpansion(marcos?.expansion)];
}

function violacionesDeLosIdiomas(marcos) {
  return IDIOMAS.flatMap((idioma) => {
    const delIdioma = marcos?.[idioma];
    if (!esObjeto(delIdioma)) {
      return [{ codigo: 'idioma_ausente', archivo: 'marcos-de-pregunta', campo: idioma }];
    }
    return LISTAS.flatMap((lista) => violacionesDeLaLista(delIdioma[lista], `${idioma}_${lista}`));
  });
}
