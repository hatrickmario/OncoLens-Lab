/**
 * AC-17 [RN-23]: ningún texto, clave ni enum de los specs y los ejemplos usa lenguaje prescriptivo. La lista es el
 * catálogo `packages/clinical-catalogs/lenguaje/terminos-prohibidos.json` (US-068) y la comparación es la de
 * `@oncolens/clinical-language` (mayúsculas, tildes, plural, género, formas verbales y excepciones): esta regla no
 * normaliza por su cuenta.
 */
import { CAMPOS_GENERADOS, checkProhibitedTerms, parseProhibitedTerms } from '@oncolens/clinical-language';
import { reporter } from '../lib/findings.mjs';
import { PATHS } from '../lib/paths.mjs';
import { walkJson } from '../lib/walk.mjs';
import { EVIDENCE, PROVIDERS } from '../lib/specs.mjs';

const report = reporter('assertNoPrescriptiveLanguage', 'AC-17 · RN-23');

const NIVELES = ['A', 'B'];
/** Textos propios (descripciones, claves, enums): admiten las frases negativas normativas de la lista. */
const EN_TEXTO_PROPIO = { niveles: NIVELES, permitirFrases: true };
/** Campos generados de los ejemplos: sin frases permitidas, como la salida generada en ejecución. */
const EN_CAMPO_GENERADO = { niveles: NIVELES, permitirFrases: false };
const LARGO_MAXIMO_DEL_FRAGMENTO = 120;

/** Punteros de los valores generados por el LLM: `limitations[].text` → `…/limitations/<n>/text`; `rationale` → `…/rationale[/<n>]`. */
const PUNTEROS_DE_CAMPOS_GENERADOS = CAMPOS_GENERADOS.map((campo) => {
  const [coleccion, propiedad] = campo.split('[].');
  return propiedad ? new RegExp(`(^|/)${coleccion}/\\d+/${propiedad}$`) : new RegExp(`(^|/)${campo}(/\\d+)*$`);
});

const esCampoGenerado = (pointer) => PUNTEROS_DE_CAMPOS_GENERADOS.some((patron) => patron.test(pointer));

const recortar = (texto) => (texto.length > LARGO_MAXIMO_DEL_FRAGMENTO ? `${texto.slice(0, LARGO_MAXIMO_DEL_FRAGMENTO - 1)}…` : texto);

/** Cada texto del documento: valores de cadena y claves de propiedad, con su puntero. */
function* textsOf(document) {
  for (const { value, pointer, key } of walkJson(document)) {
    if (typeof value === 'string' && key !== '$ref') yield { text: value, pointer };
    if (key !== null && !/^\d+$/.test(key) && key !== '$ref') yield { text: key, pointer: `${pointer} (clave)` };
  }
}

/**
 * Las frases permitidas solo valen en textos propios: el valor de un campo generado de un ejemplo se verifica sin
 * ellas, igual que la salida generada en ejecución.
 */
function checkDocument(file, document, lista, { camposGeneradosSinFrases }) {
  return [...textsOf(document)].flatMap(({ text, pointer }) => {
    const opciones = camposGeneradosSinFrases && esCampoGenerado(pointer) ? EN_CAMPO_GENERADO : EN_TEXTO_PROPIO;
    return checkProhibitedTerms(text, lista, opciones).map((coincidencia) =>
      report(file, pointer, `contiene "${coincidencia.termino}" en "${recortar(text)}" (${coincidencia.id}, nivel ${coincidencia.nivel}), lenguaje prescriptivo prohibido por RN-23`),
    );
  });
}

/** La lista del catálogo, validada; su ausencia o un esquema roto es hallazgo (falla cerrado). */
function listaDelCatalogo(catalog) {
  if (!catalog) return { hallazgo: report(PATHS.prohibitedTerms, '#', `falta la lista de términos prohibidos de RN-23 (${PATHS.prohibitedTerms})`) };
  try {
    return { lista: parseProhibitedTerms(catalog, PATHS.prohibitedTerms) };
  } catch (error) {
    return { hallazgo: report(PATHS.prohibitedTerms, '#', error.message) };
  }
}

export function assertNoPrescriptiveLanguage(specs, examples, docs) {
  const { lista, hallazgo } = listaDelCatalogo(docs.terminosProhibidos);
  if (hallazgo) return [hallazgo];
  const fromSpecs = [...PROVIDERS, EVIDENCE]
    .filter((name) => specs[name].raw)
    .flatMap((name) => checkDocument(specs[name].file, specs[name].raw, lista, { camposGeneradosSinFrases: false }));
  const fromExamples = Object.entries(examples.files ?? {}).flatMap(([name, data]) =>
    checkDocument(`${examples.dir}/${name}`, data, lista, { camposGeneradosSinFrases: true }),
  );
  return [...fromSpecs, ...fromExamples];
}
