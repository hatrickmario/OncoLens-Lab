/** AC-12 [RN-04, RN-25, ADR-36, Pre-S1 resp. 11, 21]: CitedSource declara licencia, autoría y enlace copiados del catálogo; solo los campos listados admiten null. */
import { reporter } from '../lib/findings.mjs';
import { citationsIn, selectExamples } from '../lib/examples.mjs';
import { missingFragments } from '../lib/text.mjs';
import { EVIDENCE, schemaPointer } from '../lib/specs.mjs';

const report = reporter('assertCitedSourceAttribution', 'AC-12');

const LICENSE_CLASSES = ['dominio_publico', 'cc_by', 'cc_by_sa', 'cc_by_nc'];
const NULLABLE_FIELDS = [
  'studyDesign',
  'trialPhase',
  'primaryEndpoint',
  'sampleSize',
  'publishedAt',
  'lastUpdatedAt',
  'guidelineVersion',
  'authors',
  'sourceUrl',
];
const ORIGIN_PHRASES = ['catalogo del corpus', 'nunca del texto generado'];

const SAME = (left, right) => JSON.stringify([...(left ?? [])].sort()) === JSON.stringify([...right].sort());
const admitsNull = (property) => Array.isArray(property?.type) && property.type.includes('null');

function checkFields(file, fields) {
  const pointer = schemaPointer('CitedSourceFields');
  const properties = fields.properties ?? {};
  const found = [];
  if (!SAME(properties.licenseClass?.enum, LICENSE_CLASSES)) {
    found.push(report(file, `${pointer}/properties/licenseClass/enum`, `licenseClass debe tener exactamente ${LICENSE_CLASSES.join(' | ')}`));
  }
  const nullable = Object.keys(properties).filter((name) => admitsNull(properties[name]));
  for (const name of NULLABLE_FIELDS.filter((field) => !nullable.includes(field))) {
    found.push(report(file, `${pointer}/properties/${name}`, `${name} debe admitir null (catálogo sin el dato: la UI muestra "No disponible")`));
  }
  for (const name of nullable.filter((field) => !NULLABLE_FIELDS.includes(field))) {
    found.push(report(file, `${pointer}/properties/${name}`, `${name} no debe admitir null: solo ${NULLABLE_FIELDS.join(', ')}`));
  }
  const notRequired = Object.keys(properties).filter((name) => !(fields.required ?? []).includes(name));
  for (const name of notRequired) found.push(report(file, `${pointer}/required`, `${name} debe ser requerido (todos los campos de CitedSource lo son)`));
  const url = properties.sourceUrl;
  if (url?.format !== 'uri' || url?.pattern !== '^https://') {
    found.push(report(file, `${pointer}/properties/sourceUrl`, 'sourceUrl debe ser format uri con pattern ^https://'));
  }
  return found;
}

function checkOriginDescription(file, specs) {
  const description = specs[EVIDENCE].raw.components?.schemas?.CitedSource?.description;
  return missingFragments(description, ORIGIN_PHRASES).length === 0
    ? []
    : [report(file, `${schemaPointer('CitedSource')}/description`, 'CitedSource debe decir que se copia del catálogo del corpus, nunca del texto generado')];
}

function checkExamples(examples) {
  const citations = selectExamples(examples).flatMap((example) => [...citationsIn(example.data)]);
  const found = [];
  if (!citations.some(({ citation }) => citation.authors === null)) found.push(report(`${examples.dir}/index.json`, '#', 'ningún ejemplo tiene una cita con authors = null (RN-25)'));
  if (!citations.some(({ citation }) => citation.sourceUrl === null)) found.push(report(`${examples.dir}/index.json`, '#', 'ningún ejemplo tiene una cita con sourceUrl = null (RN-25)'));
  return found;
}

export function assertCitedSourceAttribution(specs, examples) {
  const { file, raw } = specs[EVIDENCE];
  const fields = raw?.components?.schemas?.CitedSourceFields;
  if (!fields) return [report(file, schemaPointer('CitedSourceFields'), 'falta CitedSourceFields en contracts/schemas/evidence.yaml')];
  return [...checkFields(file, fields), ...checkOriginDescription(file, specs), ...checkExamples(examples)];
}
