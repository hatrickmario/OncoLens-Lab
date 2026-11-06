import type { Consultador } from '../auth/auth.repository.js';
import { tipoDeCancerVigente } from '../compartido/contexto-de-registro.js';
import { guardarAtributo } from '../clinical-attributes/clinical-attributes.repository.js';
import { bloquearPaciente } from '../compartido/paciente-activo.js';
import { guardarTratamiento } from '../prior-treatments/prior-treatments.repository.js';
import { sqlDatoVigente } from '../compartido/estados-de-revision.js';
import { ejecutarEnTransaccion, type FuenteDeConexiones } from '../compartido/transaccion.js';
import type {
  AtributoActual,
  BiomarcadorActual,
  NotaActual,
  NotaVigente,
  PlanDeCorreccionDeAtributo,
  PlanDeCorreccionDeBiomarcador,
  PlanDeCorreccionDeNota,
  PlanDeCorreccionDeTratamiento,
  RepositorioDeCorrecciones,
  TransaccionDeCorreccion,
  TratamientoActual,
  VersionReemplazada,
} from './ports.js';

type FilaSql = Record<string, unknown>;

async function biomarcador(
  db: Consultador,
  patientId: string,
  biomarkerId: string,
): Promise<BiomarcadorActual | null> {
  const { rows } = await db.query(
    `SELECT b.id, b.exam_id, e.episode_id, e.exam_type, to_char(e.performed_at, 'YYYY-MM-DD') AS performed_at,
            b.name, b.original_name, b.value, b.unit, b.reference_range, b.result_type::text AS result_type,
            b.review_status::text AS review_status
       FROM clinical.biomarker b JOIN clinical.exam e ON e.id = b.exam_id
      WHERE b.id = $1 AND e.patient_id = $2`,
    [biomarkerId, patientId],
  );
  const f = rows[0];
  if (f === undefined) return null;
  return {
    id: f['id'] as string,
    examId: f['exam_id'] as string,
    episodeId: f['episode_id'] as string,
    examType: f['exam_type'] as string,
    performedAt: f['performed_at'] as string,
    name: f['name'] as string,
    originalName: f['original_name'] as string,
    value: f['value'] as string,
    unit: f['unit'] as string | null,
    referenceRange: f['reference_range'] as string,
    resultType: f['result_type'] as BiomarcadorActual['resultType'],
    reviewStatus: f['review_status'] as BiomarcadorActual['reviewStatus'],
  };
}

async function nota(
  db: Consultador,
  patientId: string,
  noteId: string,
): Promise<NotaActual | null> {
  const { rows } = await db.query(
    `SELECT id, episode_id, note_type::text AS note_type, content,
            to_char(recorded_at, 'YYYY-MM-DD') AS recorded_at, review_status::text AS review_status
       FROM clinical.clinical_note WHERE id = $1 AND patient_id = $2`,
    [noteId, patientId],
  );
  const f = rows[0];
  if (f === undefined) return null;
  return {
    id: f['id'] as string,
    episodeId: f['episode_id'] as string,
    noteType: f['note_type'] as NotaActual['noteType'],
    content: f['content'] as string,
    recordedAt: f['recorded_at'] as string,
    reviewStatus: f['review_status'] as NotaActual['reviewStatus'],
  };
}

async function tratamiento(
  db: Consultador,
  patientId: string,
  treatmentId: string,
): Promise<TratamientoActual | null> {
  const { rows } = await db.query(
    `SELECT id, episode_id, line_number, setting, regimen_name, to_char(started_at, 'YYYY-MM-DD') AS started_at,
            to_char(ended_at, 'YYYY-MM-DD') AS ended_at, ongoing, end_reason::text AS end_reason,
            review_status::text AS review_status
       FROM clinical.prior_treatment WHERE id = $1 AND patient_id = $2`,
    [treatmentId, patientId],
  );
  const f = rows[0];
  if (f === undefined) return null;
  return {
    id: f['id'] as string,
    episodeId: f['episode_id'] as string,
    lineNumber: f['line_number'] as number | null,
    setting: f['setting'] as string,
    regimenName: f['regimen_name'] as string,
    startedAt: f['started_at'] as string | null,
    endedAt: f['ended_at'] as string | null,
    ongoing: f['ongoing'] as boolean,
    endReason: f['end_reason'] as TratamientoActual['endReason'],
    reviewStatus: f['review_status'] as TratamientoActual['reviewStatus'],
  };
}

async function atributo(
  db: Consultador,
  patientId: string,
  attributeId: string,
): Promise<AtributoActual | null> {
  const { rows } = await db.query(
    `SELECT id, episode_id, attribute_key, value, to_char(observed_at, 'YYYY-MM-DD') AS observed_at,
            date_precision::text AS date_precision, review_status::text AS review_status
       FROM clinical.clinical_attribute WHERE id = $1 AND patient_id = $2`,
    [attributeId, patientId],
  );
  const f = rows[0];
  if (f === undefined) return null;
  return {
    id: f['id'] as string,
    episodeId: f['episode_id'] as string,
    attributeKey: f['attribute_key'] as string,
    value: f['value'] as string,
    observedAt: f['observed_at'] as string | null,
    datePrecision: f['date_precision'] as AtributoActual['datePrecision'],
    reviewStatus: f['review_status'] as AtributoActual['reviewStatus'],
  };
}

async function contarOtrosBiomarcadoresVigentes(
  db: Consultador,
  examId: string,
  exceptoId: string,
): Promise<number> {
  const { rows } = await db.query(
    `SELECT count(*)::int AS n FROM clinical.biomarker
      WHERE exam_id = $1 AND id <> $2 AND ${sqlDatoVigente('review_status')}`,
    [examId, exceptoId],
  );
  return (rows[0]?.['n'] as number | undefined) ?? 0;
}

/**
 * La fila anterior conserva su valor: solo cambia su estado y, en la nota, su vigencia (RN-08). El `WHERE` exige que
 * siga vigente: si otra petición la reemplazó antes, no afecta ninguna fila y la corrección se revierte (D2).
 */
async function reemplazarBiomarcador(db: Consultador, id: string): Promise<boolean> {
  const resultado = await db.query(
    `UPDATE clinical.biomarker SET review_status = 'reemplazado'
      WHERE id = $1 AND ${sqlDatoVigente('review_status')} RETURNING id`,
    [id],
  );
  return resultado.rows.length === 1;
}

async function reemplazarNota(db: Consultador, id: string): Promise<boolean> {
  const resultado = await db.query(
    `UPDATE clinical.clinical_note SET review_status = 'reemplazado', is_active = false
      WHERE id = $1 AND ${sqlDatoVigente('review_status')} RETURNING id`,
    [id],
  );
  return resultado.rows.length === 1;
}

async function reemplazarTratamiento(db: Consultador, id: string): Promise<boolean> {
  const resultado = await db.query(
    `UPDATE clinical.prior_treatment SET review_status = 'reemplazado'
      WHERE id = $1 AND ${sqlDatoVigente('review_status')} RETURNING id`,
    [id],
  );
  return resultado.rows.length === 1;
}

async function reemplazarAtributo(db: Consultador, id: string): Promise<boolean> {
  const resultado = await db.query(
    `UPDATE clinical.clinical_attribute SET review_status = 'reemplazado'
      WHERE id = $1 AND ${sqlDatoVigente('review_status')} RETURNING id`,
    [id],
  );
  return resultado.rows.length === 1;
}

async function guardarCorreccionDeTratamiento(
  db: Consultador,
  { tratamiento: nuevo, tratamientoAReemplazar }: PlanDeCorreccionDeTratamiento,
): Promise<boolean> {
  if (!(await reemplazarTratamiento(db, tratamientoAReemplazar))) return false;
  await guardarTratamiento(db, nuevo);
  return true;
}

async function guardarCorreccionDeAtributo(
  db: Consultador,
  { atributo: nuevo, atributoAReemplazar }: PlanDeCorreccionDeAtributo,
): Promise<boolean> {
  if (!(await reemplazarAtributo(db, atributoAReemplazar))) return false;
  await guardarAtributo(db, nuevo);
  return true;
}

async function guardarCorreccionDeBiomarcador(
  db: Consultador,
  { examen, biomarcador: b, biomarcadorAReemplazar }: PlanDeCorreccionDeBiomarcador,
): Promise<boolean> {
  if (!(await reemplazarBiomarcador(db, biomarcadorAReemplazar))) return false;
  await db.query(
    `INSERT INTO clinical.exam (id, patient_id, episode_id, source_document_id, exam_type, source_lab,
                                entry_method, performed_at, supersedes_id, created_at)
     VALUES ($1, $2, $3, NULL, $4, NULL, $5, $6, $7, $8)`,
    [
      ...[examen.id, examen.patientId, examen.episodeId, examen.examType, examen.entryMethod],
      ...[examen.performedAt, examen.supersedesId, examen.createdAt],
    ],
  );
  await db.query(
    `INSERT INTO clinical.biomarker (id, exam_id, name, original_name, loinc_code, mapping_status, value, unit,
                                     reference_range, result_type, clinical_significance, significance_source,
                                     extraction_confidence, review_status, source_span, supersedes_id, reviewed_by,
                                     reviewed_at, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
    [
      ...[b.id, b.examId, b.name, b.originalName, b.loincCode, b.mappingStatus],
      ...[b.value, b.unit, b.referenceRange, b.resultType, b.clinicalSignificance],
      ...[b.significanceSource, b.extractionConfidence, b.reviewStatus, b.sourceSpan],
      ...[b.supersedesId, b.reviewedBy, b.reviewedAt, b.createdAt],
    ],
  );
  return true;
}

async function guardarCorreccionDeNota(
  db: Consultador,
  { nota: n, notaAReemplazar }: PlanDeCorreccionDeNota,
): Promise<boolean> {
  if (!(await reemplazarNota(db, notaAReemplazar))) return false;
  await db.query(
    `INSERT INTO clinical.clinical_note (id, patient_id, episode_id, source_document_id, created_by, note_type,
                                         entry_method, content, recorded_at, is_active, extraction_confidence,
                                         review_status, supersedes_id, created_at)
     VALUES ($1, $2, $3, NULL, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [
      ...[n.id, n.patientId, n.episodeId, n.createdBy, n.noteType, n.entryMethod, n.content],
      ...[n.recordedAt, n.isActive, n.extractionConfidence, n.reviewStatus, n.supersedesId],
      n.createdAt,
    ],
  );
  return true;
}

function transaccionSobre(db: Consultador): TransaccionDeCorreccion {
  return {
    bloquearPaciente: (patientId) => bloquearPaciente(db, patientId),
    biomarcador: (patientId, biomarkerId) => biomarcador(db, patientId, biomarkerId),
    tratamiento: (patientId, treatmentId) => tratamiento(db, patientId, treatmentId),
    atributo: (patientId, attributeId) => atributo(db, patientId, attributeId),
    nota: (patientId, noteId) => nota(db, patientId, noteId),
    contarOtrosBiomarcadoresVigentes: (examId, exceptoId) =>
      contarOtrosBiomarcadoresVigentes(db, examId, exceptoId),
    tipoDeCancerVigente: (patientId) => tipoDeCancerVigente(db, patientId),
    guardarCorreccionDeBiomarcador: (plan) => guardarCorreccionDeBiomarcador(db, plan),
    guardarCorreccionDeTratamiento: (plan) => guardarCorreccionDeTratamiento(db, plan),
    guardarCorreccionDeAtributo: (plan) => guardarCorreccionDeAtributo(db, plan),
    guardarCorreccionDeNota: (plan) => guardarCorreccionDeNota(db, plan),
  };
}

async function pacienteExiste(db: Consultador, patientId: string): Promise<boolean> {
  const { rows } = await db.query('SELECT 1 FROM clinical.patient WHERE id = $1', [patientId]);
  return rows.length > 0;
}

async function notasVigentes(
  db: Consultador,
  patientId: string,
): Promise<readonly NotaVigente[] | null> {
  if (!(await pacienteExiste(db, patientId))) return null;
  const { rows } = await db.query(
    `SELECT id, note_type::text AS note_type, content, to_char(recorded_at, 'YYYY-MM-DD') AS recorded_at,
            entry_method::text AS entry_method, extraction_confidence::text AS extraction_confidence,
            review_status::text AS review_status, source_document_id, supersedes_id
       FROM clinical.clinical_note
      WHERE patient_id = $1 AND is_active AND ${sqlDatoVigente('review_status')}
      ORDER BY clinical_note.recorded_at DESC, created_at DESC, id`,
    [patientId],
  );
  return rows.map((f: FilaSql): NotaVigente => ({
    id: f['id'] as string,
    noteType: f['note_type'] as NotaVigente['noteType'],
    content: f['content'] as string,
    recordedAt: f['recorded_at'] as string,
    entryMethod: f['entry_method'] as NotaVigente['entryMethod'],
    extractionConfidence: f['extraction_confidence'] as NotaVigente['extractionConfidence'],
    reviewStatus: f['review_status'] as NotaVigente['reviewStatus'],
    sourceDocumentId: f['source_document_id'] as string | null,
    supersedesId: f['supersedes_id'] as string | null,
  }));
}

/**
 * Cadena de versiones reemplazadas: recorre `supersedes_id` hacia atrás desde `id` (CTE recursiva acotada por `limite`,
 * RN-22) y devuelve de la más reciente a la más antigua, sin la fila de partida. Los `$` de la consulta son los mismos
 * en biomarcadores y notas; solo cambian las tablas y las columnas.
 */
const CADENA_DE_BIOMARCADORES = `
  WITH RECURSIVE cadena AS (
    SELECT b.id, b.supersedes_id, 1 AS nivel
      FROM clinical.biomarker b JOIN clinical.exam e ON e.id = b.exam_id
     WHERE b.id = $1 AND e.patient_id = $2
    UNION ALL
    SELECT p.id, p.supersedes_id, c.nivel + 1
      FROM clinical.biomarker p JOIN cadena c ON p.id = c.supersedes_id
     WHERE c.nivel <= $3
  )
  SELECT b.id, e.entry_method::text AS entry_method, to_char(e.performed_at, 'YYYY-MM-DD') AS recorded_at,
         b.created_at, b.value, b.unit
    FROM cadena c JOIN clinical.biomarker b ON b.id = c.id JOIN clinical.exam e ON e.id = b.exam_id
   WHERE c.nivel > 1 ORDER BY c.nivel LIMIT $3`;

const CADENA_DE_NOTAS = `
  WITH RECURSIVE cadena AS (
    SELECT n.id, n.supersedes_id, 1 AS nivel FROM clinical.clinical_note n WHERE n.id = $1 AND n.patient_id = $2
    UNION ALL
    SELECT p.id, p.supersedes_id, c.nivel + 1
      FROM clinical.clinical_note p JOIN cadena c ON p.id = c.supersedes_id
     WHERE c.nivel <= $3
  )
  SELECT n.id, n.entry_method::text AS entry_method, to_char(n.recorded_at, 'YYYY-MM-DD') AS recorded_at,
         n.created_at, n.content, n.note_type::text AS note_type
    FROM cadena c JOIN clinical.clinical_note n ON n.id = c.id
   WHERE c.nivel > 1 ORDER BY c.nivel LIMIT $3`;

const CADENA_DE_TRATAMIENTOS = `
  WITH RECURSIVE cadena AS (
    SELECT t.id, t.supersedes_id, 1 AS nivel FROM clinical.prior_treatment t WHERE t.id = $1 AND t.patient_id = $2
    UNION ALL
    SELECT p.id, p.supersedes_id, c.nivel + 1
      FROM clinical.prior_treatment p JOIN cadena c ON p.id = c.supersedes_id
     WHERE c.nivel <= $3
  )
  SELECT t.id, t.entry_method::text AS entry_method,
         to_char(COALESCE(t.started_at, (t.created_at AT TIME ZONE 'UTC')::date), 'YYYY-MM-DD') AS recorded_at,
         t.created_at, t.regimen_name
    FROM cadena c JOIN clinical.prior_treatment t ON t.id = c.id
   WHERE c.nivel > 1 ORDER BY c.nivel LIMIT $3`;

const CADENA_DE_ATRIBUTOS = `
  WITH RECURSIVE cadena AS (
    SELECT a.id, a.supersedes_id, 1 AS nivel FROM clinical.clinical_attribute a WHERE a.id = $1 AND a.patient_id = $2
    UNION ALL
    SELECT p.id, p.supersedes_id, c.nivel + 1
      FROM clinical.clinical_attribute p JOIN cadena c ON p.id = c.supersedes_id
     WHERE c.nivel <= $3
  )
  SELECT a.id, a.entry_method::text AS entry_method,
         to_char(COALESCE(a.observed_at, (a.created_at AT TIME ZONE 'UTC')::date), 'YYYY-MM-DD') AS recorded_at,
         a.created_at, a.value
    FROM cadena c JOIN clinical.clinical_attribute a ON a.id = c.id
   WHERE c.nivel > 1 ORDER BY c.nivel LIMIT $3`;

/** Un historial de una tabla: su consulta de cadena, cómo saber si el dato existe y cómo leer cada versión. */
interface FuenteDeHistorial {
  readonly cadena: string;
  readonly existe: (db: Consultador, patientId: string, datoId: string) => Promise<boolean>;
  readonly versionDe: (fila: FilaSql) => VersionReemplazada;
}

async function historial(
  db: Consultador,
  fuente: FuenteDeHistorial,
  patientId: string,
  datoId: string,
  limite: number,
): Promise<readonly VersionReemplazada[] | null> {
  // El dato de partida de otro paciente o inexistente es 404; uno sin correcciones es un histórico vacío.
  if (!(await fuente.existe(db, patientId, datoId))) return null;
  const { rows } = await db.query(fuente.cadena, [datoId, patientId, limite]);
  return rows.map(fuente.versionDe);
}

async function existeElBiomarcador(
  db: Consultador,
  patientId: string,
  datoId: string,
): Promise<boolean> {
  const { rows } = await db.query(
    `SELECT 1 FROM clinical.biomarker b JOIN clinical.exam e ON e.id = b.exam_id
      WHERE b.id = $1 AND e.patient_id = $2`,
    [datoId, patientId],
  );
  return rows.length > 0;
}

/** ¿Existe el dato de ese paciente? `tabla` es siempre un literal del código, nunca texto del cliente. */
async function existeEnLaTabla(
  db: Consultador,
  tabla: 'clinical_note' | 'prior_treatment' | 'clinical_attribute',
  patientId: string,
  datoId: string,
): Promise<boolean> {
  const { rows } = await db.query(
    `SELECT 1 FROM clinical.${tabla} WHERE id = $1 AND patient_id = $2`,
    [datoId, patientId],
  );
  return rows.length > 0;
}

const existeLaNota = (db: Consultador, patientId: string, datoId: string) =>
  existeEnLaTabla(db, 'clinical_note', patientId, datoId);

const versionDeBiomarcador = (f: FilaSql): VersionReemplazada => ({
  id: f['id'] as string,
  entryMethod: f['entry_method'] as VersionReemplazada['entryMethod'],
  recordedAt: f['recorded_at'] as string,
  createdAt: f['created_at'] as Date,
  value: f['value'] as string,
  unit: f['unit'] as string | null,
});

const existeElTratamiento = (db: Consultador, patientId: string, datoId: string) =>
  existeEnLaTabla(db, 'prior_treatment', patientId, datoId);

const existeElAtributo = (db: Consultador, patientId: string, datoId: string) =>
  existeEnLaTabla(db, 'clinical_attribute', patientId, datoId);

const versionDeTratamiento = (f: FilaSql): VersionReemplazada => ({
  id: f['id'] as string,
  entryMethod: f['entry_method'] as VersionReemplazada['entryMethod'],
  recordedAt: f['recorded_at'] as string,
  createdAt: f['created_at'] as Date,
  regimenName: f['regimen_name'] as string,
});

const versionDeAtributo = (f: FilaSql): VersionReemplazada => ({
  id: f['id'] as string,
  entryMethod: f['entry_method'] as VersionReemplazada['entryMethod'],
  recordedAt: f['recorded_at'] as string,
  createdAt: f['created_at'] as Date,
  value: f['value'] as string,
});

const versionDeNota = (f: FilaSql): VersionReemplazada => ({
  id: f['id'] as string,
  entryMethod: f['entry_method'] as VersionReemplazada['entryMethod'],
  recordedAt: f['recorded_at'] as string,
  createdAt: f['created_at'] as Date,
  content: f['content'] as string,
  noteType: f['note_type'] as VersionReemplazada['noteType'],
});

const HISTORIAL_DE_BIOMARCADORES: FuenteDeHistorial = {
  cadena: CADENA_DE_BIOMARCADORES,
  existe: existeElBiomarcador,
  versionDe: versionDeBiomarcador,
};

const HISTORIAL_DE_TRATAMIENTOS: FuenteDeHistorial = {
  cadena: CADENA_DE_TRATAMIENTOS,
  existe: existeElTratamiento,
  versionDe: versionDeTratamiento,
};

const HISTORIAL_DE_ATRIBUTOS: FuenteDeHistorial = {
  cadena: CADENA_DE_ATRIBUTOS,
  existe: existeElAtributo,
  versionDe: versionDeAtributo,
};

const HISTORIAL_DE_NOTAS: FuenteDeHistorial = {
  cadena: CADENA_DE_NOTAS,
  existe: existeLaNota,
  versionDe: versionDeNota,
};

/** Repository de la corrección: cada `enTransaccion` toma UNA conexión y confirma o revierte todo (D1). */
export function createCorrectionsRepository(fuente: FuenteDeConexiones): RepositorioDeCorrecciones {
  const lectura = async <T>(trabajo: (db: Consultador) => Promise<T>): Promise<T> => {
    const conexion = await fuente.connect();
    try {
      return await trabajo(conexion);
    } finally {
      conexion.release();
    }
  };
  return {
    enTransaccion: (trabajo) =>
      ejecutarEnTransaccion(fuente, (conexion) => trabajo(transaccionSobre(conexion))),
    notasVigentes: (patientId) => lectura((db) => notasVigentes(db, patientId)),
    historialDeBiomarcador: (patientId, biomarkerId, limite) =>
      lectura((db) => historial(db, HISTORIAL_DE_BIOMARCADORES, patientId, biomarkerId, limite)),
    historialDeNota: (patientId, noteId, limite) =>
      lectura((db) => historial(db, HISTORIAL_DE_NOTAS, patientId, noteId, limite)),
    historialDeTratamiento: (patientId, treatmentId, limite) =>
      lectura((db) => historial(db, HISTORIAL_DE_TRATAMIENTOS, patientId, treatmentId, limite)),
    historialDeAtributo: (patientId, attributeId, limite) =>
      lectura((db) => historial(db, HISTORIAL_DE_ATRIBUTOS, patientId, attributeId, limite)),
  };
}
