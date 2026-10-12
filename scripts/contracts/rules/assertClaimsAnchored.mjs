/**
 * AC-17 [RN-01, ADR-34, Pre-S1 resp. 29]: toda opción y afirmación está anclada a una cita del corpus o a un dato del
 * paciente por una referencia opaca rN (nunca un UUID); las citas casan por chunkId dentro de la misma respuesta.
 */
import { citationsIn, selectExamples } from '../lib/examples.mjs';
import { reporter } from '../lib/findings.mjs';
import { followRefs } from '../lib/pointer.mjs';
import { walkJson } from '../lib/walk.mjs';
import { CLINICAL_API, EVIDENCE, RAG_ORCHESTRATOR, fileOf, schemaOf, schemaPointer } from '../lib/specs.mjs';

const report = reporter('assertClaimsAnchored', 'AC-17 · RN-01');

const DATA_REF_PATTERN = '^r[0-9]+$';
const DATA_REF = new RegExp(DATA_REF_PATTERN);
/** Ítems de ClinicalContext que llevan dataRef obligatorio: la ruta desde el schema hasta el objeto del ítem. */
const CONTEXT_ITEMS = [
  ['diagnosis'],
  ['biomarkers', 'items'],
  ['clinicalNotes', 'items'],
  ['attributes', 'items'],
  ['priorTreatments', 'items'],
  ['events', 'items'],
  ['biomarkerTrends', 'items'],
];

const patternOf = (spec, schema) => followRefs(spec, schema, null).node?.pattern;
/** El schema hijo de `node` por nombre de propiedad o por `items`, ya resuelto. */
const childSchema = (spec, node, segment) => followRefs(spec, segment === 'items' ? node?.items : node?.properties?.[segment], null).node;

function checkClaimSchema(specs) {
  const claim = schemaOf(specs, CLINICAL_API, 'SupportedClaim');
  const file = fileOf(specs, CLINICAL_API, schemaPointer('SupportedClaim'));
  const pointer = schemaPointer('SupportedClaim');
  const found = [];
  const anchored = ['citedSources', 'patientDataRefs'].every((name) => (claim?.anyOf ?? []).some((branch) => branch.properties?.[name]?.minItems >= 1));
  if (!anchored) found.push(report(file, `${pointer}/anyOf`, 'SupportedClaim debe exigir, con anyOf, al menos una cita o una referencia a un dato del paciente'));
  if (claim?.properties?.patientDataRefs?.items?.pattern !== DATA_REF_PATTERN) {
    found.push(report(file, `${pointer}/properties/patientDataRefs/items`, `las referencias a datos del paciente deben tener pattern ${DATA_REF_PATTERN} (opacas, nunca un UUID)`));
  }
  const option = schemaOf(specs, CLINICAL_API, 'EvidenceOption');
  if (!(option?.properties?.citedSources?.minItems >= 1)) {
    found.push(report(fileOf(specs, CLINICAL_API, schemaPointer('EvidenceOption')), `${schemaPointer('EvidenceOption')}/properties/citedSources`, 'toda opción debe tener al menos una cita (minItems: 1)'));
  }
  return found;
}

function checkContextRefs(specs) {
  const { file, bundled } = specs[RAG_ORCHESTRATOR];
  const context = schemaOf(specs, RAG_ORCHESTRATOR, 'ClinicalContext');
  if (!bundled || !context) return [];
  const found = [];
  for (const path of CONTEXT_ITEMS) {
    const item = path.reduce((node, segment) => childSchema(bundled, node, segment), context);
    const pointer = `${schemaPointer('ClinicalContext')}/properties/${path.join('/')}`;
    const dataRef = item?.properties?.dataRef;
    if (!(item?.required ?? []).includes('dataRef') || patternOf(bundled, dataRef) !== DATA_REF_PATTERN) {
      found.push(report(file, pointer, 'cada ítem de ClinicalContext debe exigir dataRef con pattern ^r[0-9]+$'));
    }
  }
  const supporting = schemaOf(specs, RAG_ORCHESTRATOR, 'CaseSummaryInternalResponse')?.properties?.claims?.items?.properties?.supportingDataRefs?.items;
  if (patternOf(bundled, supporting) !== DATA_REF_PATTERN) {
    found.push(report(file, `${schemaPointer('CaseSummaryInternalResponse')}/properties/claims/items/properties/supportingDataRefs`, 'supportingDataRefs debe tener pattern ^r[0-9]+$'));
  }
  return found;
}

function* claimsIn(data) {
  for (const { value, pointer } of walkJson(data)) {
    const isClaim = value && typeof value === 'object' && typeof value.text === 'string' && Array.isArray(value.citedSources) && Array.isArray(value.patientDataRefs);
    if (isClaim) yield { claim: value, pointer };
  }
}

/** ChunkId de las citas de soporte de la respuesta: las de las opciones y las del turno. */
function supportChunkIds(data) {
  const holders = [data.evidenceOptions, data.citedSources].filter(Array.isArray);
  return new Set(holders.flatMap((holder) => [...citationsIn(holder)].map(({ citation }) => citation.chunkId)));
}

/** Referencias que la respuesta puede resolver: patientDataLinks (Backend 1) o los dataRef del contexto de la petición (Backend 2). */
function resolvableRefs(example, examples) {
  if (Array.isArray(example.data.patientDataLinks)) return new Set(example.data.patientDataLinks.map((link) => link.dataRef));
  const request = examples.files?.[example.entry.request];
  return new Set([...walkJson(request ?? {})].filter(({ key, value }) => key === 'dataRef' && typeof value === 'string').map(({ value }) => value));
}

function checkExample(example, examples) {
  const support = supportChunkIds(example.data);
  const refs = resolvableRefs(example, examples);
  return [...claimsIn(example.data)].flatMap(({ claim, pointer }) => {
    const found = [];
    const file = example.file;
    if (claim.citedSources.length + claim.patientDataRefs.length === 0) found.push(report(file, pointer, 'la afirmación no tiene ninguna cita ni referencia a un dato del paciente (RN-01)'));
    for (const [index, citation] of claim.citedSources.entries()) {
      if (!support.has(citation.chunkId)) found.push(report(file, `${pointer}/citedSources/${index}`, `la cita ${citation.chunkId} no casa por chunkId con ninguna cita de la respuesta`));
    }
    for (const [index, ref] of claim.patientDataRefs.entries()) {
      if (!DATA_REF.test(ref)) found.push(report(file, `${pointer}/patientDataRefs/${index}`, `${ref} no es una referencia opaca rN (nunca un UUID)`));
      else if (!refs.has(ref)) found.push(report(file, `${pointer}/patientDataRefs/${index}`, `${ref} no existe entre los datos que la respuesta puede resolver`));
    }
    return found;
  });
}

export function assertClaimsAnchored(specs, examples) {
  if (!specs[CLINICAL_API].bundled || !specs[RAG_ORCHESTRATOR].bundled) return [];
  const withClaims = selectExamples(examples, (entry) => entry.spec !== EVIDENCE);
  return [...checkClaimSchema(specs), ...checkContextRefs(specs), ...withClaims.flatMap((example) => checkExample(example, examples))];
}
