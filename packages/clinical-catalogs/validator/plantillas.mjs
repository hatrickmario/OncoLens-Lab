/**
 * Reglas de `<tipo>/plantillas.json` (L1D-324, ADR-52, RN-29, RN-23): las plantillas de las preguntas guiadas del panel
 * conversacional. Cada ítem tiene `variantes` (la UI ofrece la primera cuyas ranuras se resuelven). Reglas con nombre;
 * la forma la comprueba `plantillas.schema.json`, que solo entra si ellas callan:
 *
 * - `ranura_desconocida`: una ranura (`{x}` en el texto o en `ranuras`) fuera de las permitidas;
 * - `ranuras_inconsistentes`: las ranuras que declara una variante no son las que usa su texto;
 * - `termino_prohibido`: el texto contiene un término de `lenguaje/terminos-prohibidos.json` (RN-23);
 * - `plantillas_de_tipo_insuficientes`: menos de 3 ítems cuyas variantes solo usan `{tipo}`.
 *
 * Cada violación nombra el `id` del ítem, nunca su texto: `{ codigo, archivo: 'plantillas', elemento }`.
 */

export const RANURAS_PERMITIDAS = ['tipo', 'estadio', 'biomarcador', 'grado'];
export const MINIMO_DE_PLANTILLAS_DE_TIPO = 3;

const esObjeto = (valor) => valor !== null && typeof valor === 'object' && !Array.isArray(valor);
const lista = (valor) => (Array.isArray(valor) ? valor : []);
const textos = (valor) => lista(valor).filter((v) => typeof v === 'string');

const normalizar = (texto) =>
  texto
    .normalize('NFKD')
    .replace(/\p{Mn}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/** Ranuras `{x}` que usa un texto, en orden y sin repetir. */
const ranurasDelTexto = (texto) => [
  ...new Set([...texto.matchAll(/\{([^{}]*)\}/g)].map((m) => m[1])),
];

/**
 * Cobertura simplificada de RN-23 sobre el texto ya normalizado: frases de Nivel A (con sus formas) y de Nivel B por
 * palabra completa y los prefijos de Nivel B. El detector completo vive en `packages/clinical-language`; esta regla
 * impide que el catálogo publique una plantilla evidentemente prescriptiva.
 */
export function contieneTerminoProhibido(texto, terminosProhibidos) {
  const normalizado = ` ${normalizar(texto)} `;
  const frases = [
    ...lista(terminosProhibidos?.nivelA?.terminos).flatMap((t) => [t.texto, ...textos(t.formas)]),
    ...lista(terminosProhibidos?.nivelB?.terminos).map((t) => t.texto),
  ].filter((frase) => typeof frase === 'string');
  const palabras = normalizado.trim().split(' ');
  const prefijos = lista(terminosProhibidos?.nivelB?.prefijos).map((p) => p.prefijo);
  return (
    frases.some((frase) => normalizado.includes(` ${normalizar(frase)} `)) ||
    palabras.some((palabra) => prefijos.some((p) => typeof p === 'string' && palabra.startsWith(p)))
  );
}

function violacionesDelItem(item, terminosProhibidos) {
  const violacion = (codigo) => ({ codigo, archivo: 'plantillas', elemento: String(item.id) });
  const variantes = lista(item.variantes).filter(esObjeto);
  const codigos = new Set();
  for (const variante of variantes) {
    const texto = typeof variante.texto === 'string' ? variante.texto : '';
    const declaradas = textos(variante.ranuras);
    const usadas = ranurasDelTexto(texto);
    if ([...declaradas, ...usadas].some((r) => !RANURAS_PERMITIDAS.includes(r))) {
      codigos.add('ranura_desconocida');
    } else if ([...declaradas].sort().join() !== [...usadas].sort().join()) {
      codigos.add('ranuras_inconsistentes');
    }
    if (contieneTerminoProhibido(texto, terminosProhibidos)) codigos.add('termino_prohibido');
  }
  return [...codigos].map(violacion);
}

/** Un ítem es «solo de tipo» si todas sus variantes usan únicamente la ranura `{tipo}`. */
const soloUsaElTipo = (item) => {
  const variantes = lista(item.variantes).filter(esObjeto);
  return variantes.length > 0 && variantes.every((v) => textos(v.ranuras).join() === 'tipo');
};

/** @returns {{ codigo: string, archivo: string, elemento?: string }[]} */
export function violacionesDePlantillas(archivo, terminosProhibidos) {
  const items = lista(archivo?.items).filter(esObjeto);
  const delasPlantillas = items.flatMap((item) => violacionesDelItem(item, terminosProhibidos));
  const deTipo = items.filter(soloUsaElTipo).length;
  return deTipo >= MINIMO_DE_PLANTILLAS_DE_TIPO
    ? delasPlantillas
    : [...delasPlantillas, { codigo: 'plantillas_de_tipo_insuficientes', archivo: 'plantillas' }];
}
