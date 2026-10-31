import type {
  Biomarker,
  Diagnosis,
  DiagnosisGrading,
  Provenance,
} from '../../../../../packages/api-contracts/src/client/clinical-api/index.js';
import { elegirDiagnosticoVigente } from '../compartido/diagnostico-vigente.js';
import type {
  ColumnasDeProcedencia,
  FilaDeBiomarcador,
  FilaDeDiagnostico,
  FilaDeGradacion,
} from './ficha.repository.js';

/** Orden por unidades de código, igual en toda máquina (fechas ISO, ids y nombres): sin depender del `locale`. */
function compararTexto(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/**
 * Diagnóstico vigente (D3): entre los activos, el que fija la regla única de `compartido/diagnostico-vigente`. Sin
 * ninguno, `null` y la ficha muestra «No registrado».
 */
export function seleccionarDiagnosticoVigente(
  diagnosticos: readonly FilaDeDiagnostico[],
): FilaDeDiagnostico | null {
  const activos = diagnosticos.filter((diagnostico) => diagnostico.isActive);
  return elegirDiagnosticoVigente(activos, (d) => ({ id: d.id, fecha: d.diagnosedAt })) ?? null;
}

/**
 * Último valor por biomarcador (D4): una fila por nombre, la de `performedAt` más reciente (desempate por alta y por
 * `id`), ordenadas por nombre. `rechazado` y `reemplazado` ya no llegan aquí (RN-07, lo filtra el repository).
 */
export function ultimoValorPorBiomarcador(
  biomarcadores: readonly FilaDeBiomarcador[],
): FilaDeBiomarcador[] {
  const masReciente = new Map<string, FilaDeBiomarcador>();
  for (const candidato of biomarcadores) {
    const actual = masReciente.get(candidato.name);
    if (actual === undefined || esMasReciente(candidato, actual)) {
      masReciente.set(candidato.name, candidato);
    }
  }
  return [...masReciente.values()].sort((a, b) => compararTexto(a.name, b.name));
}

function esMasReciente(candidato: FilaDeBiomarcador, actual: FilaDeBiomarcador): boolean {
  const porFecha = compararTexto(candidato.performedAt, actual.performedAt);
  if (porFecha !== 0) return porFecha > 0;
  const porAlta = candidato.createdAt.getTime() - actual.createdAt.getTime();
  return porAlta !== 0 ? porAlta > 0 : compararTexto(candidato.id, actual.id) > 0;
}

/** `Provenance` del contrato: el documento principal y los duplicados fusionados, sin repetir el principal. */
export function comoProvenance(
  fila: ColumnasDeProcedencia,
  documentosDeLaFuente: readonly string[],
): Provenance {
  return {
    entryMethod: fila.entryMethod,
    extractionConfidence: fila.extractionConfidence,
    reviewStatus: fila.reviewStatus,
    conflict: fila.conflictsWithId !== null,
    sourceDocumentId: fila.sourceDocumentId,
    additionalSourceDocumentIds: documentosDeLaFuente.filter(
      (documento) => documento !== fila.sourceDocumentId,
    ),
  };
}

export function comoGradacion(fila: FilaDeGradacion): DiagnosisGrading {
  return {
    id: fila.id,
    gradingSystem: fila.gradingSystem,
    specimenType: fila.specimenType as DiagnosisGrading['specimenType'],
    gradeScope: fila.gradeScope as DiagnosisGrading['gradeScope'],
    gleasonPrimaryPattern: fila.gleasonPrimaryPattern,
    gleasonSecondaryPattern: fila.gleasonSecondaryPattern,
    gleasonScore: fila.gleasonScore,
    isupGradeGroup: fila.isupGradeGroup,
    nottinghamGrade: fila.nottinghamGrade,
    isReference: fila.isReference,
    provenance: comoProvenance(fila, []),
  };
}

export function comoDiagnostico(
  fila: FilaDeDiagnostico,
  gradaciones: readonly FilaDeGradacion[],
  documentosAdicionales: readonly string[],
): Diagnosis {
  return {
    id: fila.id,
    cancerType: fila.cancerType,
    icd10Code: fila.icd10Code,
    histology: fila.histology,
    histologyCode: fila.histologyCode,
    grade: fila.grade,
    gradings: gradaciones.map(comoGradacion),
    stagingSystem: fila.stagingSystem,
    stageValue: fila.stageValue,
    performanceScale: fila.performanceScale,
    performanceValue: fila.performanceValue,
    diagnosedAt: fila.diagnosedAt,
    isActive: fila.isActive,
    provenance: comoProvenance(fila, documentosAdicionales),
  };
}

/** `trend` queda en `null` hasta US-091; un rango de referencia vacío es «no registrado» (`null`). */
export function comoBiomarcador(
  fila: FilaDeBiomarcador,
  documentosAdicionales: readonly string[],
): Biomarker {
  return {
    id: fila.id,
    name: fila.name,
    loincCode: fila.loincCode,
    mappingStatus: fila.mappingStatus,
    trend: null,
    value: fila.value,
    unit: fila.unit,
    referenceRange: fila.referenceRange === '' ? null : fila.referenceRange,
    resultType: fila.resultType,
    clinicalSignificance: fila.clinicalSignificance,
    significanceSource: fila.significanceSource,
    examType: fila.examType,
    performedAt: fila.performedAt,
    provenance: comoProvenance(fila, documentosAdicionales),
  };
}
