/** AC-17 [RN-23]: ningún texto, clave ni enum de los specs y los ejemplos usa lenguaje prescriptivo (sin mayúsculas ni acentos). */
import { reporter } from '../lib/findings.mjs';
import { normalizeText } from '../lib/text.mjs';
import { walkJson } from '../lib/walk.mjs';
import { EVIDENCE, PROVIDERS } from '../lib/specs.mjs';

const report = reporter('assertNoPrescriptiveLanguage', 'AC-17 · RN-23');

/** Lo que el texto dice mal: los términos de RN-23 y las palabras con los prefijos prohibidos, tras quitar las frases negativas permitidas. */
function prohibitedIn(text, catalog) {
  let normalized = normalizeText(text);
  for (const allowed of catalog.frasesPermitidas ?? []) normalized = normalized.replaceAll(normalizeText(allowed), ' ');
  const terms = (catalog.terminos ?? []).filter((term) => normalized.includes(normalizeText(term)));
  const prefixed = (catalog.prefijos ?? []).flatMap((prefix) => normalized.match(new RegExp(`\\b${normalizeText(prefix)}\\w*`, 'g')) ?? []);
  return [...terms, ...prefixed];
}

/** Cada texto del documento: valores de cadena y claves de propiedad, con su puntero. */
function* textsOf(document) {
  for (const { value, pointer, key } of walkJson(document)) {
    if (typeof value === 'string' && key !== '$ref') yield { text: value, pointer };
    if (key !== null && !/^\d+$/.test(key) && key !== '$ref') yield { text: key, pointer: `${pointer} (clave)` };
  }
}

function checkDocument(file, document, catalog) {
  return [...textsOf(document)].flatMap(({ text, pointer }) =>
    prohibitedIn(text, catalog).map((term) => report(file, pointer, `contiene "${term}", lenguaje prescriptivo prohibido por RN-23`)),
  );
}

export function assertNoPrescriptiveLanguage(specs, examples, docs) {
  const catalog = docs.terminosProhibidos;
  if (!catalog) return [report('scripts/contracts/terminos-prohibidos-rn23.json', '#', 'falta la lista de términos prohibidos de RN-23')];
  const fromSpecs = [...PROVIDERS, EVIDENCE].filter((name) => specs[name].raw).flatMap((name) => checkDocument(specs[name].file, specs[name].raw, catalog));
  const fromExamples = Object.entries(examples.files ?? {}).flatMap(([name, data]) => checkDocument(`${examples.dir}/${name}`, data, catalog));
  return [...fromSpecs, ...fromExamples];
}
