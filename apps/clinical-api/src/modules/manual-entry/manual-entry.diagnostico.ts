import type { Diagnosis } from '../../../../../packages/api-contracts/src/client/clinical-api/index.js';
import type { GeneradorDeIds } from '../../infrastructure/ids.js';
import { comoDiagnostico } from '../patients/ficha.reglas.js';
import { CuerpoIncompletoError, GradacionIncoherenteError } from './manual-entry.errores.js';
import {
  derivarGleason,
  elegirGradacionDeReferencia,
  textoDeGrado,
  validarCoherenciaGleason,
} from './manual-entry.reglas.js';
import type { CuerpoDeDiagnostico } from './manual-entry.schema.js';
import type {
  DatosDelDiagnostico,
  DiagnosticoAGuardar,
  GradacionAGuardar,
  GradacionGuardada,
} from './ports.js';

export type GradacionDelCuerpo = NonNullable<CuerpoDeDiagnostico['grading']>;

/** Campos que el primer diagnóstico manual exige (sin uno vigente no hay de dónde copiarlos). */
const CAMPOS_MINIMOS_DEL_PRIMER_DIAGNOSTICO = [
  'cancerType',
  'stagingSystem',
  'stageValue',
  'diagnosedAt',
] as const;

/** Datos del primer diagnóstico manual: exige los campos mínimos y deja el resto en `null` (CIE-10 lo decide quien normaliza). */
export function datosDelPrimerDiagnostico(cuerpo: CuerpoDeDiagnostico): DatosDelDiagnostico {
  for (const campo of CAMPOS_MINIMOS_DEL_PRIMER_DIAGNOSTICO) {
    if (cuerpo[campo] === undefined) throw new CuerpoIncompletoError(campo);
  }
  return {
    cancerType: cuerpo.cancerType ?? '',
    icd10Code: null,
    mappingStatus: 'no_mapeado',
    histology: cuerpo.histology ?? null,
    histologyCode: null,
    grade: null,
    stagingSystem: cuerpo.stagingSystem ?? null,
    stageValue: cuerpo.stageValue ?? null,
    performanceScale: cuerpo.performanceScale ?? null,
    performanceValue: cuerpo.performanceValue ?? null,
    diagnosedAt: cuerpo.diagnosedAt ?? '',
  };
}

/** Rechaza el score o grupo ISUP que no cuadran con los patrones (422 `GRADACION_INCOHERENTE`, DEC-05). */
export function exigirGradacionCoherente(grading: GradacionDelCuerpo | undefined): void {
  if (grading?.gradingSystem !== 'gleason_isup') return;
  const incoherente = validarCoherenciaGleason({
    patronPrimario: grading.gleasonPrimaryPattern,
    patronSecundario: grading.gleasonSecondaryPattern,
    puntaje: grading.gleasonScore,
    grupoIsup: grading.isupGradeGroup,
  });
  if (incoherente !== null) throw new GradacionIncoherenteError(incoherente);
}

export interface ContextoDeGradacion {
  readonly generarId: GeneradorDeIds;
  readonly diagnosisId: string;
  readonly userId: string;
  readonly ahora: Date;
}

/** Gradación manual verificada de un diagnóstico nuevo; score e ISUP se derivan de los patrones. */
export function gradacionDelCuerpo(
  grading: GradacionDelCuerpo,
  contexto: ContextoDeGradacion,
): GradacionAGuardar {
  const comun = {
    id: contexto.generarId(),
    diagnosisId: contexto.diagnosisId,
    isReference: false,
    entryMethod: 'manual',
    extractionConfidence: 'n_a',
    extractionScore: null,
    reviewStatus: 'verificado',
    sourceDocumentId: null,
    reviewedBy: contexto.userId,
    reviewedAt: contexto.ahora,
    createdAt: contexto.ahora,
  } as const;
  return grading.gradingSystem === 'nottingham'
    ? {
        ...comun,
        gradingSystem: 'nottingham',
        specimenType: null,
        gradeScope: null,
        gleasonPrimaryPattern: null,
        gleasonSecondaryPattern: null,
        gleasonScore: null,
        isupGradeGroup: null,
        nottinghamGrade: grading.nottinghamGrade,
      }
    : { ...comun, ...camposDeGleason(grading) };
}

function camposDeGleason(grading: Extract<GradacionDelCuerpo, { gradingSystem: 'gleason_isup' }>) {
  const { puntaje, grupoIsup } = derivarGleason(
    grading.gleasonPrimaryPattern,
    grading.gleasonSecondaryPattern,
  );
  return {
    gradingSystem: 'gleason_isup',
    specimenType: grading.specimenType,
    gradeScope: grading.gradeScope,
    gleasonPrimaryPattern: grading.gleasonPrimaryPattern,
    gleasonSecondaryPattern: grading.gleasonSecondaryPattern,
    gleasonScore: puntaje,
    isupGradeGroup: grupoIsup,
    nottinghamGrade: null,
  } as const;
}

/** Las gradaciones previas pasan al diagnóstico nuevo (ids nuevos) y la de referencia se recalcula (DEC-05). */
export function gradacionesDelDiagnosticoNuevo(
  previas: readonly GradacionGuardada[],
  nueva: GradacionAGuardar | undefined,
  contexto: Pick<ContextoDeGradacion, 'generarId' | 'diagnosisId'>,
): GradacionAGuardar[] {
  const copiadas = previas.map((g) => ({
    ...g,
    id: contexto.generarId(),
    diagnosisId: contexto.diagnosisId,
    isReference: false,
  }));
  const todas = nueva === undefined ? copiadas : [...copiadas, nueva];
  const referencia = elegirGradacionDeReferencia(todas);
  return todas.map((g) => ({ ...g, isReference: g === referencia }));
}

export interface EntradaDelDiagnosticoNuevo {
  readonly id: string;
  readonly datos: DatosDelDiagnostico;
  readonly gradaciones: readonly GradacionAGuardar[];
  readonly patientId: string;
  readonly episodeId: string;
  readonly userId: string;
  readonly ahora: Date;
  /** `true` cuando hay un diagnóstico vigente al que este reemplaza (RN-08). */
  readonly esCorreccion: boolean;
}

/** `Diagnosis.grade` es el texto derivado de la gradación de referencia; sin gradaciones se conserva el del vigente. */
export function armarDiagnosticoNuevo(entrada: EntradaDelDiagnosticoNuevo): DiagnosticoAGuardar {
  const referencia = entrada.gradaciones.find((g) => g.isReference);
  return {
    ...entrada.datos,
    grade: referencia === undefined ? entrada.datos.grade : textoDeGrado(referencia),
    id: entrada.id,
    patientId: entrada.patientId,
    episodeId: entrada.episodeId,
    entryMethod: entrada.esCorreccion ? 'manual_correction' : 'manual',
    reviewedBy: entrada.userId,
    reviewedAt: entrada.ahora,
    createdAt: entrada.ahora,
  };
}

/** `Diagnosis` del contrato: activo y verificado, con sus gradaciones. */
export function comoDiagnosticoDelContrato(
  diagnostico: DiagnosticoAGuardar,
  gradaciones: readonly GradacionAGuardar[],
): Diagnosis {
  return comoDiagnostico(
    {
      ...diagnostico,
      // El contrato declara `stagingSystem` y `stageValue` como texto; la ficha los entrega igual (D3).
      stagingSystem: diagnostico.stagingSystem as string,
      stageValue: diagnostico.stageValue as string,
      isActive: true,
      extractionConfidence: 'n_a',
      reviewStatus: 'verificado',
      conflictsWithId: null,
      sourceDocumentId: null,
    },
    gradaciones.map((g) => ({ ...g, conflictsWithId: null })),
    [],
  );
}
