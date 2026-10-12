/** AC-17 [RN-03, RN-11, RN-24, RN-28]: las descripciones normativas del contrato llevan sus frases (relevancia, orden, origen en el catálogo, memoria rotulada, texto enmascarado). */
import { reporter } from '../lib/findings.mjs';
import { followRefs } from '../lib/pointer.mjs';
import { missingFragments } from '../lib/text.mjs';
import { CLINICAL_API, EVIDENCE, RAG_ORCHESTRATOR, fileOf, schemaOf, schemaPointer } from '../lib/specs.mjs';

const report = reporter('assertNormativeDescriptions', 'AC-17 · RN-03');

const RELEVANCE = ['metadato secundario', 'puntaje del reranker normalizado a [0,1]', 'no ordena', 'solidez clínica', 'probabilidad'];
const ORDER = ['orden determinista por aplicabilidad (RN-28)'];
const ORIGIN = ['catálogo del corpus', 'nunca del texto generado'];
const EXPLANATION = ['descripción de la diferencia entre fuentes', 'sin afirmación nueva', 'valoración clínica'];
const LABELED_MEMORY = ['dato rotulado, no es soporte ni cita (RN-24)'];
const MASKED = 'enmascarado (RN-11)';

/** Cada descripción normativa: el spec, el schema, la ruta hasta la propiedad y las frases que debe contener. */
const DESCRIPTIONS = [
  [EVIDENCE, 'EvidenceOption', ['properties', 'relevanceScore'], RELEVANCE],
  [CLINICAL_API, 'EvidenceAnalysis', ['properties', 'topRelevanceScore'], RELEVANCE],
  [RAG_ORCHESTRATOR, 'RagQueryInternalResponse', ['properties', 'topRelevanceScore'], RELEVANCE],
  [RAG_ORCHESTRATOR, 'RagFollowUpResponse', ['properties', 'topRelevanceScore'], RELEVANCE],
  [CLINICAL_API, 'EvidenceAnalysis', ['properties', 'evidenceOptions'], ORDER],
  [RAG_ORCHESTRATOR, 'RagQueryInternalResponse', ['properties', 'evidenceOptions'], ORDER],
  [EVIDENCE, 'CitedSource', [], ORIGIN],
  [EVIDENCE, 'Synthesis', ['properties', 'discrepancies', 'items', 'properties', 'explanation'], EXPLANATION],
  [RAG_ORCHESTRATOR, 'PriorAnalysisMemory', ['properties', 'linkedDecision'], LABELED_MEMORY],
  [RAG_ORCHESTRATOR, 'PriorAnalysisMemory', ['properties', 'outcomesSince'], LABELED_MEMORY],
];

/** Schemas de Backend 2 cuyo texto libre llega enmascarado (RN-11). */
const MASKED_ROOTS = ['ClinicalContext', 'PriorAnalysisMemory'];

const isFreeText = (node) => {
  const isString = node.type === 'string' || (Array.isArray(node.type) && node.type.includes('string'));
  return isString && node.enum === undefined && node.const === undefined && node.format === undefined && node.pattern === undefined;
};

function checkDescriptions(specs) {
  return DESCRIPTIONS.flatMap(([specName, schemaName, path, phrases]) => {
    const spec = specs[specName];
    const root = specName === EVIDENCE ? spec.raw?.components?.schemas?.[schemaName] : schemaOf(specs, specName, schemaName);
    if (!root) return [];
    const node = path.reduce((current, segment) => current?.[segment], root);
    const pointer = [schemaPointer(schemaName), ...path].join('/');
    const missing = missingFragments(node?.description, phrases);
    return missing.length === 0 ? [] : [report(fileOf(specs, specName, schemaPointer(schemaName)), pointer, `la descripción debe decir: ${missing.join('; ')}`)];
  });
}

/** Las hojas de texto libre bajo `schema`, con la ruta lógica por la que se llega a ellas. */
function* freeTextLeaves(spec, schema, pointer) {
  const { node } = followRefs(spec, schema, pointer);
  if (!node || typeof node !== 'object') return;
  for (const [name, child] of Object.entries(node.properties ?? {})) yield* freeTextLeaves(spec, child, `${pointer}/properties/${name}`);
  if (node.items) yield* freeTextLeaves(spec, node.items, `${pointer}/items`);
  if (isFreeText(node)) yield { node, pointer };
}

function checkMaskedText(specs) {
  const { file, bundled } = specs[RAG_ORCHESTRATOR];
  if (!bundled) return [];
  return MASKED_ROOTS.flatMap((name) =>
    [...freeTextLeaves(bundled, schemaOf(specs, RAG_ORCHESTRATOR, name), schemaPointer(name))]
      .filter(({ node }) => missingFragments(node.description, [MASKED]).length > 0)
      .map(({ pointer }) => report(file, pointer, `el texto libre debe describirse como ${MASKED}`)),
  );
}

export function assertNormativeDescriptions(specs) {
  if (!specs[CLINICAL_API].bundled || !specs[RAG_ORCHESTRATOR].bundled) return [];
  return [...checkDescriptions(specs), ...checkMaskedText(specs)];
}
