/** AC-11 [DEC-05, Pre-S1 resp. 18, 29]: Diagnosis expone grade y gradings solo de lectura; el registro manual acepta una grading estructurada y nunca grade. */
import { errorCodes } from '../lib/errors.mjs';
import { reporter } from '../lib/findings.mjs';
import { findOperation, findResponse, jsonSchemaOf } from '../lib/operations.mjs';
import { CLINICAL_API, schemaOf, schemaPointer } from '../lib/specs.mjs';

const report = reporter('assertDiagnosisGrading', 'AC-11');

const GLEASON_REQUIRED = ['gradingSystem', 'specimenType', 'gradeScope', 'gleasonPrimaryPattern', 'gleasonSecondaryPattern'];
const RANGES = [
  ['GleasonIsupGradingInput', 'gleasonPrimaryPattern', 3, 5],
  ['GleasonIsupGradingInput', 'gleasonSecondaryPattern', 3, 5],
  ['GleasonIsupGradingInput', 'gleasonScore', 6, 10],
  ['GleasonIsupGradingInput', 'isupGradeGroup', 1, 5],
  ['NottinghamGradingInput', 'nottinghamGrade', 1, 3],
];
const SAME = (left, right) => JSON.stringify([...(left ?? [])].sort()) === JSON.stringify([...right].sort());

function checkReadOnly(specs, file) {
  const diagnosis = schemaOf(specs, CLINICAL_API, 'Diagnosis');
  const pointer = schemaPointer('Diagnosis');
  const found = ['grade', 'gradings']
    .filter((name) => diagnosis?.properties?.[name]?.readOnly !== true)
    .map((name) => report(file, `${pointer}/properties/${name}`, `Diagnosis.${name} debe ser readOnly: la gradación se deriva, no se escribe a mano`));
  const grading = schemaOf(specs, CLINICAL_API, 'DiagnosisGrading');
  if (Object.hasOwn(grading?.properties ?? {}, 'reviewStatus')) {
    found.push(report(file, `${schemaPointer('DiagnosisGrading')}/properties/reviewStatus`, 'DiagnosisGrading no tiene un segundo estado de revisión: es provenance.reviewStatus'));
  }
  return found;
}

function checkInput(specs, file) {
  const create = schemaOf(specs, CLINICAL_API, 'DiagnosisManualCreate');
  const input = schemaOf(specs, CLINICAL_API, 'DiagnosisGradingInput');
  const found = [];
  if (Object.hasOwn(create?.properties ?? {}, 'grade')) {
    found.push(report(file, `${schemaPointer('DiagnosisManualCreate')}/properties/grade`, 'DiagnosisManualCreate no admite grade: es texto derivado'));
  }
  if (create?.properties?.grading?.$ref !== schemaPointer('DiagnosisGradingInput')) {
    found.push(report(file, `${schemaPointer('DiagnosisManualCreate')}/properties/grading`, 'DiagnosisManualCreate debe aceptar una grading opcional (DiagnosisGradingInput)'));
  }
  const branches = (input?.oneOf ?? []).map((branch) => branch.$ref);
  for (const name of ['GleasonIsupGradingInput', 'NottinghamGradingInput']) {
    if (!branches.includes(schemaPointer(name))) found.push(report(file, `${schemaPointer('DiagnosisGradingInput')}/oneOf`, `DiagnosisGradingInput debe admitir la rama ${name}`));
  }
  return found;
}

function checkGleason(specs, file) {
  const gleason = schemaOf(specs, CLINICAL_API, 'GleasonIsupGradingInput');
  const pointer = schemaPointer('GleasonIsupGradingInput');
  if (!gleason) return [];
  const found = [];
  if (!SAME(gleason.required, GLEASON_REQUIRED)) {
    found.push(report(file, `${pointer}/required`, `GleasonIsupGradingInput debe exigir exactamente ${GLEASON_REQUIRED.join(', ')} (gleasonScore e isupGradeGroup son opcionales)`));
  }
  if (!SAME(gleason.properties?.specimenType?.enum, ['biopsia', 'prostatectomia'])) found.push(report(file, `${pointer}/properties/specimenType`, 'specimenType debe ser biopsia | prostatectomia'));
  if (!SAME(gleason.properties?.gradeScope?.enum, ['nucleo_sitio', 'peor', 'global'])) found.push(report(file, `${pointer}/properties/gradeScope`, 'gradeScope debe ser nucleo_sitio | peor | global'));
  return found;
}

function checkRanges(specs, file) {
  return RANGES.flatMap(([schema, property, minimum, maximum]) => {
    const declared = schemaOf(specs, CLINICAL_API, schema)?.properties?.[property];
    const ok = declared?.minimum === minimum && declared?.maximum === maximum;
    return ok ? [] : [report(file, `${schemaPointer(schema)}/properties/${property}`, `${property} debe estar entre ${minimum} y ${maximum}`)];
  });
}

function checkClosedInputs(specs, file) {
  return ['GleasonIsupGradingInput', 'NottinghamGradingInput']
    .filter((name) => schemaOf(specs, CLINICAL_API, name)?.additionalProperties !== false)
    .map((name) => report(file, schemaPointer(name), `${name} no admite propiedades adicionales`));
}

function checkIncoherentGrading(bundled, file) {
  const entry = findOperation(bundled, 'post', '/platform/patients/{patientId}/diagnoses');
  const response = entry && findResponse(bundled, entry, 422);
  const schema = response && jsonSchemaOf(bundled, response);
  const declared = schema ? (errorCodes(bundled, schema.node) ?? []) : [];
  const path = `${entry?.pointer ?? '#/paths'}/responses/422`;
  return declared.includes('GRADACION_INCOHERENTE') ? [] : [report(file, path, 'el 422 del registro de diagnósticos debe declarar GRADACION_INCOHERENTE')];
}

export function assertDiagnosisGrading(specs) {
  const { file, bundled } = specs[CLINICAL_API];
  if (!bundled) return [];
  return [
    ...checkReadOnly(specs, file),
    ...checkInput(specs, file),
    ...checkGleason(specs, file),
    ...checkRanges(specs, file),
    ...checkClosedInputs(specs, file),
    ...checkIncoherentGrading(bundled, file),
  ];
}
