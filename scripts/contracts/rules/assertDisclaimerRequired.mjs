/** AC-17 [RN-19, S1 resp. 32]: disclaimer es obligatorio y, en todo ejemplo, igual al literal validado (PRD E-11) en EvidenceAnalysis y FollowUpTurn. */
import { reporter } from '../lib/findings.mjs';
import { selectExamples, targetsSchema } from '../lib/examples.mjs';
import { missingFragments } from '../lib/text.mjs';
import { CLINICAL_API, schemaOf, schemaPointer } from '../lib/specs.mjs';

const report = reporter('assertDisclaimerRequired', 'AC-17 · RN-19');

const SCHEMAS = ['EvidenceAnalysis', 'FollowUpTurn'];
/** Ejemplo no normativo del contrato: el runtime manda por `AI_DISCLAIMER_TEXT`. La etiqueta "Uso académico/investigación" va fuera. */
export const AVISO_LITERAL = 'Generado por IA; requiere validación clínica independiente por el oncólogo tratante.';

/** RN-19: igualdad exacta con el literal de [S1 resp. 32] (sin tolerancia de mayúsculas, acentos ni espacios). */
export function esAvisoLiteral(valor) {
  return valor === AVISO_LITERAL;
}

function checkSchema(specs, name) {
  const schema = schemaOf(specs, CLINICAL_API, name);
  const pointer = `${schemaPointer(name)}/properties/disclaimer`;
  const file = specs[CLINICAL_API].file;
  const disclaimer = schema?.properties?.disclaimer;
  const found = [];
  if (!(schema?.required ?? []).includes('disclaimer')) found.push(report(file, `${schemaPointer(name)}/required`, `${name} debe exigir disclaimer`));
  if (disclaimer?.type !== 'string' || !(disclaimer?.minLength >= 1)) found.push(report(file, pointer, 'disclaimer debe ser string con minLength 1'));
  if (missingFragments(disclaimer?.description, ['AI_DISCLAIMER_TEXT', AVISO_LITERAL]).length > 0) {
    found.push(report(file, pointer, `la descripción de disclaimer debe remitir a AI_DISCLAIMER_TEXT y citar el literal "${AVISO_LITERAL}"`));
  }
  return found;
}

function checkExample({ data, file }) {
  if (esAvisoLiteral(data.disclaimer)) return [];
  return [report(file, '#/disclaimer', `el aviso debe ser exactamente "${AVISO_LITERAL}" (RN-19, S1 resp. 32)`)];
}

export function assertDisclaimerRequired(specs, examples) {
  if (!specs[CLINICAL_API].bundled) return [];
  return SCHEMAS.flatMap((name) => [
    ...checkSchema(specs, name),
    ...selectExamples(examples, targetsSchema(CLINICAL_API, name)).flatMap(checkExample),
  ]);
}
