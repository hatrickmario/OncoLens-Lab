/** AC-3 [RN-02, Pre-S1 resp. 25]: sin evidencia ⇒ topRelevanceScore null (no 0.0) y bloques vacíos, en el schema y en los ejemplos. */
import { reporter } from '../lib/findings.mjs';
import { selectExamples, targetsSchema } from '../lib/examples.mjs';
import { CLINICAL_API, RAG_ORCHESTRATOR, fileOf, schemaOf, schemaPointer } from '../lib/specs.mjs';

const report = reporter('assertNoEvidenceImpliesNullScore', 'AC-3 · RN-02');

/**
 * Cada contrato con la regla: los `status` sin respuesta, los arreglos que quedan vacíos, si lleva
 * `topRelevanceScore` y el arreglo que exige elementos cuando hay evidencia.
 */
const CONTRACTS = [
  { spec: CLINICAL_API, schema: 'EvidenceAnalysis', empty: ['sin_evidencia', 'tipo_no_habilitado'], emptied: ['evidenceOptions'], score: true },
  { spec: CLINICAL_API, schema: 'FollowUpTurn', empty: ['sin_evidencia', 'fuera_de_contexto'], emptied: ['answer', 'citedSources'], score: false, requiredWhenFull: 'answer' },
  { spec: RAG_ORCHESTRATOR, schema: 'RagQueryInternalResponse', empty: ['sin_evidencia'], emptied: ['evidenceOptions'], score: true },
  { spec: RAG_ORCHESTRATOR, schema: 'RagFollowUpResponse', empty: ['sin_evidencia', 'fuera_de_contexto'], emptied: ['answer', 'citedSources'], score: true, requiredWhenFull: 'answer' },
];

const sameSet = (left, right) => JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
const statusesOf = (condition) => condition?.properties?.status?.enum ?? [condition?.properties?.status?.const].filter(Boolean);

function checkSchema(specs, contract) {
  const schema = schemaOf(specs, contract.spec, contract.schema);
  const pointer = schemaPointer(contract.schema);
  const file = fileOf(specs, contract.spec, pointer);
  if (!schema) return [];
  const here = (suffix) => `${pointer}${suffix}`;
  if (!schema.if || !schema.then) return [report(file, pointer, 'falta el if/then que fuerza topRelevanceScore null y los bloques vacíos sin evidencia')];
  const found = [];
  if (!sameSet(statusesOf(schema.if), contract.empty)) found.push(report(file, here('/if'), `el if debe cubrir exactamente status ${contract.empty.join(' | ')}`));
  for (const field of contract.emptied) {
    if (schema.then.properties?.[field]?.maxItems !== 0) found.push(report(file, here(`/then/properties/${field}`), `${field} debe tener maxItems 0 sin evidencia`));
  }
  if (contract.score) {
    if (schema.then.properties?.topRelevanceScore?.type !== 'null') found.push(report(file, here('/then/properties/topRelevanceScore'), 'topRelevanceScore debe ser de tipo null sin evidencia (RN-02)'));
    if (schema.else?.properties?.topRelevanceScore?.type !== 'number') found.push(report(file, here('/else/properties/topRelevanceScore'), 'topRelevanceScore debe ser number con evidencia'));
  }
  if (contract.requiredWhenFull && !(schema.else?.properties?.[contract.requiredWhenFull]?.minItems >= 1)) {
    found.push(report(file, here(`/else/properties/${contract.requiredWhenFull}`), `${contract.requiredWhenFull} debe exigir al menos un elemento con evidencia`));
  }
  return found;
}

function checkExample(example, contract) {
  const { data, file } = example;
  const isEmpty = contract.empty.includes(data.status);
  const found = [];
  if (contract.score && isEmpty && data.topRelevanceScore !== null) {
    found.push(report(file, '#/topRelevanceScore', `con status ${data.status} topRelevanceScore debe ser null, no ${JSON.stringify(data.topRelevanceScore)} (RN-02)`));
  }
  if (contract.score && !isEmpty && typeof data.topRelevanceScore !== 'number') {
    found.push(report(file, '#/topRelevanceScore', `con status ${data.status} topRelevanceScore debe ser un número`));
  }
  if (isEmpty) {
    for (const field of contract.emptied.filter((name) => (data[name] ?? []).length > 0)) {
      found.push(report(file, `#/${field}`, `con status ${data.status} ${field} debe estar vacío`));
    }
  }
  return found;
}

export function assertNoEvidenceImpliesNullScore(specs, examples) {
  return CONTRACTS.flatMap((contract) => [
    ...checkSchema(specs, contract),
    ...selectExamples(examples, targetsSchema(contract.spec, contract.schema)).flatMap((example) => checkExample(example, contract)),
  ]);
}
