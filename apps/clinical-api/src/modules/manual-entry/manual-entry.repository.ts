import type { Consultador } from '../auth/auth.repository.js';
import {
  elegirDiagnosticoVigente,
  sqlDiagnosticoCandidato,
} from '../compartido/diagnostico-vigente.js';
import { episodioDelRegistro } from '../compartido/contexto-de-registro.js';
import { bloquearPaciente } from '../compartido/paciente-activo.js';
import { sqlDatoVigente } from '../compartido/estados-de-revision.js';
import { ejecutarEnTransaccion, type FuenteDeConexiones } from '../compartido/transaccion.js';
import type {
  BiomarcadorAGuardar,
  DatosDelDiagnostico,
  DiagnosticoAGuardar,
  DiagnosticoVigente,
  ExamenAGuardar,
  GradacionAGuardar,
  GradacionGuardada,
  RepositorioDeRegistroManual,
  TransaccionDeRegistro,
} from './ports.js';

export type { ConexionLiberable, FuenteDeConexiones } from '../compartido/transaccion.js';

type FilaSql = Record<string, unknown>;

const COLUMNAS_DE_DIAGNOSTICO = `id, cancer_type, icd10_code, mapping_status::text AS mapping_status, histology,
       histology_code, grade, staging_system, stage_value, performance_scale::text AS performance_scale,
       performance_value, to_char(diagnosed_at, 'YYYY-MM-DD') AS diagnosed_at`;

const COLUMNAS_DE_GRADACION = `id, grading_system, specimen_type, grade_scope, gleason_primary_pattern,
       gleason_secondary_pattern, gleason_score, isup_grade_group, nottingham_grade, is_reference,
       entry_method::text AS entry_method, extraction_confidence::text AS extraction_confidence, extraction_score,
       review_status::text AS review_status, source_document_id, reviewed_by, reviewed_at, created_at`;

function gradacionGuardada(f: FilaSql): GradacionGuardada {
  return {
    id: f['id'] as string,
    gradingSystem: f['grading_system'] as GradacionGuardada['gradingSystem'],
    specimenType: f['specimen_type'] as string | null,
    gradeScope: f['grade_scope'] as string | null,
    gleasonPrimaryPattern: f['gleason_primary_pattern'] as number | null,
    gleasonSecondaryPattern: f['gleason_secondary_pattern'] as number | null,
    gleasonScore: f['gleason_score'] as number | null,
    isupGradeGroup: f['isup_grade_group'] as number | null,
    nottinghamGrade: f['nottingham_grade'] as number | null,
    isReference: f['is_reference'] as boolean,
    entryMethod: f['entry_method'] as GradacionGuardada['entryMethod'],
    extractionConfidence: f['extraction_confidence'] as GradacionGuardada['extractionConfidence'],
    extractionScore: f['extraction_score'] as number | null,
    reviewStatus: f['review_status'] as GradacionGuardada['reviewStatus'],
    sourceDocumentId: f['source_document_id'] as string | null,
    reviewedBy: f['reviewed_by'] as string | null,
    reviewedAt: f['reviewed_at'] as Date | null,
    createdAt: f['created_at'] as Date,
  };
}

function datosDelDiagnostico(f: FilaSql): DatosDelDiagnostico {
  return {
    cancerType: f['cancer_type'] as string,
    icd10Code: f['icd10_code'] as string | null,
    mappingStatus: f['mapping_status'] as 'mapeado' | 'no_mapeado',
    histology: f['histology'] as string | null,
    histologyCode: f['histology_code'] as string | null,
    grade: f['grade'] as string | null,
    stagingSystem: f['staging_system'] as string | null,
    stageValue: f['stage_value'] as string | null,
    performanceScale: f['performance_scale'] as string | null,
    performanceValue: f['performance_value'] as number | null,
    diagnosedAt: f['diagnosed_at'] as string,
  };
}

async function gradacionesDe(db: Consultador, diagnosisId: string): Promise<GradacionGuardada[]> {
  const { rows } = await db.query(
    `SELECT ${COLUMNAS_DE_GRADACION} FROM clinical.diagnosis_grading
      WHERE diagnosis_id = $1 AND ${sqlDatoVigente('review_status')} ORDER BY created_at, id`,
    [diagnosisId],
  );
  return rows.map(gradacionGuardada);
}

/** El diagnóstico vigente (misma regla de vigencia que la ficha y el checklist) con sus gradaciones. */
async function diagnosticoVigente(
  db: Consultador,
  patientId: string,
): Promise<DiagnosticoVigente | null> {
  const { rows } = await db.query(
    `SELECT ${COLUMNAS_DE_DIAGNOSTICO} FROM clinical.diagnosis
      WHERE patient_id = $1 AND ${sqlDiagnosticoCandidato()}`,
    [patientId],
  );
  const elegida = elegirDiagnosticoVigente(rows, (f) => ({
    id: f['id'] as string,
    fecha: f['diagnosed_at'] as string,
  }));
  if (elegida === undefined) return null;
  const id = elegida['id'] as string;
  return { id, datos: datosDelDiagnostico(elegida), gradaciones: await gradacionesDe(db, id) };
}

async function guardarBiomarcador(
  db: Consultador,
  examen: ExamenAGuardar,
  b: BiomarcadorAGuardar,
): Promise<void> {
  await db.query(
    `INSERT INTO clinical.exam (id, patient_id, episode_id, source_document_id, exam_type, source_lab,
                                entry_method, performed_at, created_at)
     VALUES ($1, $2, $3, NULL, $4, NULL, $5, $6, $7)`,
    [
      ...[examen.id, examen.patientId, examen.episodeId, examen.examType, examen.entryMethod],
      ...[examen.performedAt, examen.createdAt],
    ],
  );
  await db.query(
    `INSERT INTO clinical.biomarker (id, exam_id, name, original_name, loinc_code, mapping_status, value, unit,
                                     reference_range, result_type, clinical_significance, significance_source,
                                     extraction_confidence, review_status, source_span, reviewed_by, reviewed_at,
                                     created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
    [
      ...[b.id, b.examId, b.name, b.originalName, b.loincCode, b.mappingStatus],
      ...[b.value, b.unit, b.referenceRange, b.resultType, b.clinicalSignificance],
      ...[b.significanceSource, b.extractionConfidence, b.reviewStatus, b.sourceSpan],
      ...[b.reviewedBy, b.reviewedAt, b.createdAt],
    ],
  );
}

/** La fila anterior conserva sus valores: solo cambian su estado y su vigencia (RN-08, nunca un UPDATE de datos). */
async function reemplazarDiagnostico(db: Consultador, id: string): Promise<void> {
  await db.query(
    "UPDATE clinical.diagnosis SET review_status = 'reemplazado', is_active = false WHERE id = $1",
    [id],
  );
}

async function insertarDiagnostico(db: Consultador, d: DiagnosticoAGuardar): Promise<void> {
  await db.query(
    `INSERT INTO clinical.diagnosis (id, patient_id, episode_id, source_document_id, entry_method, cancer_type,
                                     icd10_code, mapping_status, histology, histology_code, grade, staging_system,
                                     stage_value, performance_scale, performance_value, diagnosed_at, is_active,
                                     extraction_confidence, review_status, reviewed_by, reviewed_at, created_at)
     VALUES ($1, $2, $3, NULL, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
             $21)`,
    [
      ...[d.id, d.patientId, d.episodeId, d.entryMethod, d.cancerType, d.icd10Code],
      ...[d.mappingStatus, d.histology, d.histologyCode, d.grade, d.stagingSystem, d.stageValue],
      ...[
        d.performanceScale,
        d.performanceValue,
        d.diagnosedAt,
        d.isActive,
        d.extractionConfidence,
      ],
      ...[d.reviewStatus, d.reviewedBy, d.reviewedAt, d.createdAt],
    ],
  );
}

async function insertarGradacion(db: Consultador, g: GradacionAGuardar): Promise<void> {
  await db.query(
    `INSERT INTO clinical.diagnosis_grading (id, diagnosis_id, grading_system, specimen_type, grade_scope,
                                             gleason_primary_pattern, gleason_secondary_pattern, gleason_score,
                                             isup_grade_group, nottingham_grade, is_reference, source_document_id,
                                             entry_method, extraction_score, extraction_confidence, review_status,
                                             reviewed_by, reviewed_at, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
    [
      ...[g.id, g.diagnosisId, g.gradingSystem, g.specimenType, g.gradeScope],
      ...[g.gleasonPrimaryPattern, g.gleasonSecondaryPattern, g.gleasonScore, g.isupGradeGroup],
      ...[g.nottinghamGrade, g.isReference, g.sourceDocumentId, g.entryMethod, g.extractionScore],
      ...[g.extractionConfidence, g.reviewStatus, g.reviewedBy, g.reviewedAt, g.createdAt],
    ],
  );
}

async function guardarDiagnostico(
  db: Consultador,
  nuevo: DiagnosticoAGuardar,
  gradaciones: readonly GradacionAGuardar[],
  reemplazaA: string | null,
): Promise<void> {
  if (reemplazaA !== null) await reemplazarDiagnostico(db, reemplazaA);
  await insertarDiagnostico(db, nuevo);
  for (const gradacion of gradaciones) await insertarGradacion(db, gradacion);
}

function transaccionSobre(db: Consultador): TransaccionDeRegistro {
  return {
    bloquearPaciente: (patientId) => bloquearPaciente(db, patientId),
    episodioDelRegistro: (patientId) => episodioDelRegistro(db, patientId),
    diagnosticoVigente: (patientId) => diagnosticoVigente(db, patientId),
    guardarBiomarcador: (examen, biomarcador) => guardarBiomarcador(db, examen, biomarcador),
    guardarDiagnostico: (nuevo, gradaciones, reemplazaA) =>
      guardarDiagnostico(db, nuevo, gradaciones, reemplazaA),
  };
}

/** Repository del registro manual: cada `enTransaccion` toma UNA conexión, abre `BEGIN` y confirma o revierte todo (D8). */
export function createManualEntryRepository(
  fuente: FuenteDeConexiones,
): RepositorioDeRegistroManual {
  return {
    tipoDeCancerVigente: () => Promise.reject(new Error('no implementado')),
    enTransaccion: (trabajo) =>
      ejecutarEnTransaccion(fuente, (conexion) => trabajo(transaccionSobre(conexion))),
  };
}
