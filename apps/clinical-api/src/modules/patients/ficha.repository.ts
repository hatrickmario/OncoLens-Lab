import type { Consultador } from '../auth/auth.repository.js';
import type { EstadoDelPaciente, OrigenDelPaciente } from './patients.repository.js';

/** Datos no clínicos del paciente que alimentan la cabecera de la ficha (y la vista del admin). */
export interface FilaDePacienteDeLaFicha {
  readonly id: string;
  readonly dataOrigin: OrigenDelPaciente;
  readonly lifecycleStatus: EstadoDelPaciente;
  readonly birthYear: number;
  readonly requiresRatification: boolean;
  readonly registeredAt: Date;
}

/** Columnas de procedencia que comparten todos los datos clínicos mostrados. */
export interface ColumnasDeProcedencia {
  readonly entryMethod: 'ocr' | 'manual' | 'manual_correction' | 'seed';
  readonly extractionConfidence: 'alta' | 'media' | 'baja' | 'n_a';
  readonly reviewStatus: 'auto_aceptado' | 'requiere_revision' | 'verificado' | 'corregido';
  readonly conflictsWithId: string | null;
  readonly sourceDocumentId: string | null;
}

export interface FilaDeDiagnostico extends ColumnasDeProcedencia {
  readonly id: string;
  readonly cancerType: string;
  readonly icd10Code: string | null;
  readonly histology: string | null;
  readonly histologyCode: string | null;
  readonly grade: string | null;
  readonly stagingSystem: string;
  readonly stageValue: string;
  readonly performanceScale: string | null;
  readonly performanceValue: number | null;
  readonly diagnosedAt: string;
  readonly isActive: boolean;
}

export interface FilaDeGradacion extends ColumnasDeProcedencia {
  readonly id: string;
  readonly diagnosisId: string;
  readonly gradingSystem: 'gleason_isup' | 'nottingham';
  readonly specimenType: string | null;
  readonly gradeScope: string | null;
  readonly gleasonPrimaryPattern: number | null;
  readonly gleasonSecondaryPattern: number | null;
  readonly gleasonScore: number | null;
  readonly isupGradeGroup: number | null;
  readonly nottinghamGrade: number | null;
  readonly isReference: boolean;
}

export interface FilaDeBiomarcador extends ColumnasDeProcedencia {
  readonly id: string;
  readonly name: string;
  readonly loincCode: string | null;
  readonly mappingStatus: 'mapeado' | 'no_mapeado';
  readonly value: string;
  readonly unit: string | null;
  readonly referenceRange: string;
  readonly resultType: 'cuantitativo' | 'cualitativo';
  readonly clinicalSignificance: 'normal' | 'alterado' | 'relevante' | 'crítico';
  readonly significanceSource: 'documento' | 'regla' | 'inferido_ia';
  readonly examType: string;
  readonly performedAt: string;
  readonly createdAt: Date;
}

/** Documentos adicionales (duplicados fusionados) por id de dato. */
export type FuentesAdicionales = Map<string, string[]>;

export interface FichaRepository {
  /** Cabecera del paciente; `null` si no existe. No lee ningún dato clínico. */
  paciente(patientId: string): Promise<FilaDePacienteDeLaFicha | null>;
  /** Diagnósticos del paciente sin los `rechazado`/`reemplazado` (RN-07). */
  diagnosticos(patientId: string): Promise<FilaDeDiagnostico[]>;
  gradaciones(diagnosisId: string): Promise<FilaDeGradacion[]>;
  /** Biomarcadores de todos los exámenes del paciente sin los `rechazado`/`reemplazado` (RN-07). */
  biomarcadores(patientId: string): Promise<FilaDeBiomarcador[]>;
  fuentesAdicionales(
    tipo: 'diagnosis' | 'biomarker',
    dataIds: readonly string[],
  ): Promise<FuentesAdicionales>;
}

/** Estados que nunca se muestran ni cuentan: el dato fue rechazado o sustituido (RN-07). */
const EXCLUIDOS = "review_status NOT IN ('rechazado', 'reemplazado')";

const PROCEDENCIA = `entry_method::text AS entry_method, extraction_confidence::text AS extraction_confidence,
                review_status::text AS review_status`;

type FilaSql = Record<string, unknown>;

const comoFecha = (columna: string): string => `to_char(${columna}, 'YYYY-MM-DD')`;

function filaDeDiagnostico(f: FilaSql): FilaDeDiagnostico {
  return {
    id: f['id'] as string,
    cancerType: f['cancer_type'] as string,
    icd10Code: f['icd10_code'] as string | null,
    histology: f['histology'] as string | null,
    histologyCode: f['histology_code'] as string | null,
    grade: f['grade'] as string | null,
    stagingSystem: f['staging_system'] as string,
    stageValue: f['stage_value'] as string,
    performanceScale: f['performance_scale'] as string | null,
    performanceValue: f['performance_value'] as number | null,
    diagnosedAt: f['diagnosed_at'] as string,
    isActive: f['is_active'] as boolean,
    ...procedenciaDe(f),
  };
}

function procedenciaDe(f: FilaSql): ColumnasDeProcedencia {
  return {
    entryMethod: f['entry_method'] as ColumnasDeProcedencia['entryMethod'],
    extractionConfidence: f[
      'extraction_confidence'
    ] as ColumnasDeProcedencia['extractionConfidence'],
    reviewStatus: f['review_status'] as ColumnasDeProcedencia['reviewStatus'],
    conflictsWithId: (f['conflicts_with_id'] ?? null) as string | null,
    sourceDocumentId: (f['source_document_id'] ?? null) as string | null,
  };
}

function filaDeGradacion(f: FilaSql): FilaDeGradacion {
  return {
    id: f['id'] as string,
    diagnosisId: f['diagnosis_id'] as string,
    gradingSystem: f['grading_system'] as FilaDeGradacion['gradingSystem'],
    specimenType: f['specimen_type'] as string | null,
    gradeScope: f['grade_scope'] as string | null,
    gleasonPrimaryPattern: f['gleason_primary_pattern'] as number | null,
    gleasonSecondaryPattern: f['gleason_secondary_pattern'] as number | null,
    gleasonScore: f['gleason_score'] as number | null,
    isupGradeGroup: f['isup_grade_group'] as number | null,
    nottinghamGrade: f['nottingham_grade'] as number | null,
    isReference: f['is_reference'] as boolean,
    ...procedenciaDe(f),
  };
}

function filaDeBiomarcador(f: FilaSql): FilaDeBiomarcador {
  return {
    id: f['id'] as string,
    name: f['name'] as string,
    loincCode: f['loinc_code'] as string | null,
    mappingStatus: f['mapping_status'] as FilaDeBiomarcador['mappingStatus'],
    value: f['value'] as string,
    unit: f['unit'] as string | null,
    referenceRange: f['reference_range'] as string,
    resultType: f['result_type'] as FilaDeBiomarcador['resultType'],
    clinicalSignificance: f['clinical_significance'] as FilaDeBiomarcador['clinicalSignificance'],
    significanceSource: f['significance_source'] as FilaDeBiomarcador['significanceSource'],
    examType: f['exam_type'] as string,
    performedAt: f['performed_at'] as string,
    createdAt: f['created_at'] as Date,
    ...procedenciaDe(f),
  };
}

const CONSULTA_DE_DIAGNOSTICOS = `SELECT id, cancer_type, icd10_code, histology, histology_code, grade, staging_system,
       stage_value, performance_scale::text AS performance_scale, performance_value,
       ${comoFecha('diagnosed_at')} AS diagnosed_at, is_active, ${PROCEDENCIA}, conflicts_with_id, source_document_id
  FROM clinical.diagnosis WHERE patient_id = $1 AND ${EXCLUIDOS}`;

const CONSULTA_DE_GRADACIONES = `SELECT id, diagnosis_id, grading_system, specimen_type, grade_scope, gleason_primary_pattern,
       gleason_secondary_pattern, gleason_score, isup_grade_group, nottingham_grade, is_reference, ${PROCEDENCIA},
       source_document_id
  FROM clinical.diagnosis_grading WHERE diagnosis_id = $1 AND ${EXCLUIDOS}
 ORDER BY is_reference DESC, created_at, id`;

const CONSULTA_DE_BIOMARCADORES = `SELECT b.id, b.name, b.loinc_code, b.mapping_status::text AS mapping_status, b.value, b.unit,
       b.reference_range, b.result_type::text AS result_type,
       b.clinical_significance::text AS clinical_significance,
       b.significance_source::text AS significance_source, e.exam_type,
       ${comoFecha('e.performed_at')} AS performed_at, e.entry_method::text AS entry_method,
       b.extraction_confidence::text AS extraction_confidence, b.review_status::text AS review_status,
       b.conflicts_with_id, e.source_document_id, b.created_at
  FROM clinical.biomarker b JOIN clinical.exam e ON e.id = b.exam_id
 WHERE e.patient_id = $1 AND b.${EXCLUIDOS}`;

export function createFichaRepository(db: Consultador): FichaRepository {
  return {
    async paciente(patientId) {
      const { rows } = await db.query(
        `SELECT id, data_origin::text AS data_origin, lifecycle_status::text AS lifecycle_status,
                birth_year, requires_ratification, created_at
           FROM clinical.patient WHERE id = $1`,
        [patientId],
      );
      const f = rows[0];
      if (f === undefined) return null;
      return {
        id: f['id'] as string,
        dataOrigin: f['data_origin'] as OrigenDelPaciente,
        lifecycleStatus: f['lifecycle_status'] as EstadoDelPaciente,
        birthYear: f['birth_year'] as number,
        requiresRatification: f['requires_ratification'] as boolean,
        registeredAt: f['created_at'] as Date,
      };
    },
    async diagnosticos(patientId) {
      const { rows } = await db.query(CONSULTA_DE_DIAGNOSTICOS, [patientId]);
      return rows.map(filaDeDiagnostico);
    },
    async gradaciones(diagnosisId) {
      const { rows } = await db.query(CONSULTA_DE_GRADACIONES, [diagnosisId]);
      return rows.map(filaDeGradacion);
    },
    async biomarcadores(patientId) {
      const { rows } = await db.query(CONSULTA_DE_BIOMARCADORES, [patientId]);
      return rows.map(filaDeBiomarcador);
    },
    fuentesAdicionales: (tipo, dataIds) => leerFuentesAdicionales(db, tipo, dataIds),
  };
}

async function leerFuentesAdicionales(
  db: Consultador,
  tipo: 'diagnosis' | 'biomarker',
  dataIds: readonly string[],
): Promise<FuentesAdicionales> {
  const adicionales: FuentesAdicionales = new Map();
  if (dataIds.length === 0) return adicionales;
  const { rows } = await db.query(
    `SELECT data_id, document_id FROM clinical.clinical_data_source
      WHERE data_type = $1 AND data_id = ANY($2::uuid[]) ORDER BY created_at, id`,
    [tipo, dataIds],
  );
  for (const fila of rows) {
    const id = fila['data_id'] as string;
    adicionales.set(id, [...(adicionales.get(id) ?? []), fila['document_id'] as string]);
  }
  return adicionales;
}
