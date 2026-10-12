/** AC-17 [RN-19, Pre-S1 resp. 25]: disclaimer es obligatorio, no vacío y con las dos frases de RN-19 en EvidenceAnalysis y FollowUpTurn. */
import { reporter } from '../lib/findings.mjs';
import { selectExamples, targetsSchema } from '../lib/examples.mjs';
import { missingFragments } from '../lib/text.mjs';
import { CLINICAL_API, schemaOf, schemaPointer } from '../lib/specs.mjs';

const report = reporter('assertDisclaimerRequired', 'AC-17 · RN-19');

const SCHEMAS = ['EvidenceAnalysis', 'FollowUpTurn'];
const PHRASES = ['requiere validación clínica del oncólogo tratante', 'Uso académico/investigación'];

function checkSchema(specs, name) {
  const schema = schemaOf(specs, CLINICAL_API, name);
  const pointer = `${schemaPointer(name)}/properties/disclaimer`;
  const file = specs[CLINICAL_API].file;
  const disclaimer = schema?.properties?.disclaimer;
  const found = [];
  if (!(schema?.required ?? []).includes('disclaimer')) found.push(report(file, `${schemaPointer(name)}/required`, `${name} debe exigir disclaimer`));
  if (disclaimer?.type !== 'string' || !(disclaimer?.minLength >= 1)) found.push(report(file, pointer, 'disclaimer debe ser string con minLength 1'));
  if (missingFragments(disclaimer?.description, ['AI_DISCLAIMER_TEXT']).length > 0) found.push(report(file, pointer, 'la descripción de disclaimer debe remitir a AI_DISCLAIMER_TEXT'));
  return found;
}

function checkExample({ data, file }) {
  return missingFragments(data.disclaimer, PHRASES).map((phrase) => report(file, '#/disclaimer', `el aviso debe contener "${phrase}" (RN-19)`));
}

export function assertDisclaimerRequired(specs, examples) {
  if (!specs[CLINICAL_API].bundled) return [];
  return SCHEMAS.flatMap((name) => [
    ...checkSchema(specs, name),
    ...selectExamples(examples, targetsSchema(CLINICAL_API, name)).flatMap(checkExample),
  ]);
}
