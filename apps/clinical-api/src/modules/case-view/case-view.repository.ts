import type { Consultador } from '../auth/auth.repository.js';
import { sqlDatoVigente, type EstadoDeRevisionVisible } from '../compartido/estados-de-revision.js';
import type {
  AtributoLeido,
  BiomarcadorDelCaso,
  ConfianzaDeExtraccion,
  DatosDelCaso,
  DiagnosticoDelCaso,
  EventoClinicoLeido,
  MetodoDeEntrada,
  PrecisionDeFecha,
  ProcedenciaDeFila,
  RegistroDeIaLeido,
  RepositorioDeLaVistaDeCaso,
  TipoDeRegistroDeIa,
  TratamientoPrevioLeido,
} from './ports.js';

/**
 * Lectura de la vista de caso (US-088, design D9 y D12): una consulta por entidad, siempre por `patient_id` (UUID) y con
 * `sqlDatoVigente()` en cada una (RN-07: nada `rechazado` ni `reemplazado`). Solo proyecta las columnas que la vista
 * muestra. Nunca lee `identity`, `ClinicalNote` ni el contenido de un `AIAnalysisRecord`; sin lógica de derivación.
 */

type Fila = Record<string, unknown>;

const FECHA = (columna: string): string => `to_char(${columna}, 'YYYY-MM-DD')`;
const INSTANTE = (columna: string): string =>
  `to_char(${columna} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

const SQL_EXISTE_PACIENTE = 'SELECT 1 FROM clinical.patient WHERE id = $1 LIMIT 1';

const SQL_DIAGNOSTICOS = `SELECT t.id, t.histology, t.icd10_code, ${FECHA('t.diagnosed_at')} AS diagnosed_at,
         ${INSTANTE('t.created_at')} AS created_at, t.entry_method::text AS entry_method,
         t.extraction_confidence::text AS extraction_confidence, t.review_status::text AS review_status,
         (t.conflicts_with_id IS NOT NULL) AS conflict, t.source_document_id
    FROM clinical.diagnosis t
   WHERE t.patient_id = $1 AND ${sqlDatoVigente('t.review_status')}
   ORDER BY t.diagnosed_at, t.id`;

const SQL_BIOMARCADORES = `SELECT e.id AS exam_id, e.exam_type, ${FECHA('e.performed_at')} AS performed_at,
         ${INSTANTE('e.created_at')} AS exam_created_at, e.entry_method::text AS exam_entry_method,
         e.source_document_id AS exam_source_document_id, b.id AS biomarker_id, b.name, b.loinc_code, b.value, b.unit,
         b.extraction_confidence::text AS extraction_confidence, b.review_status::text AS review_status,
         (b.conflicts_with_id IS NOT NULL) AS conflict
    FROM clinical.biomarker b JOIN clinical.exam e ON e.id = b.exam_id
   WHERE e.patient_id = $1 AND ${sqlDatoVigente('b.review_status')}
   ORDER BY e.performed_at, e.id, b.id`;

const SQL_TRATAMIENTOS = `SELECT t.id, t.line_number, t.setting, t.regimen_name, t.atc_codes, t.cups_code,
         ${FECHA('t.started_at')} AS started_at, ${FECHA('t.ended_at')} AS ended_at, t.ongoing,
         t.end_reason::text AS end_reason, ${INSTANTE('t.created_at')} AS created_at,
         t.entry_method::text AS entry_method, t.extraction_confidence::text AS extraction_confidence,
         t.review_status::text AS review_status, false AS conflict, t.source_document_id
    FROM clinical.prior_treatment t
   WHERE t.patient_id = $1 AND ${sqlDatoVigente('t.review_status')}
   ORDER BY t.line_number NULLS LAST, t.started_at NULLS LAST, t.id`;

const SQL_EVENTOS = `SELECT t.id, t.event_type::text AS event_type, ${FECHA('t.event_date')} AS event_date,
         t.date_precision::text AS date_precision, t.description, t.icd10_code, t.cups_code,
         ${INSTANTE('t.created_at')} AS created_at, t.entry_method::text AS entry_method,
         t.extraction_confidence::text AS extraction_confidence, t.review_status::text AS review_status,
         false AS conflict, t.source_document_id
    FROM clinical.clinical_event t
   WHERE t.patient_id = $1 AND ${sqlDatoVigente('t.review_status')}
   ORDER BY t.event_date NULLS LAST, t.id`;

const SQL_ATRIBUTOS = `SELECT t.id, t.attribute_key, t.value, ${FECHA('t.observed_at')} AS observed_at,
         t.entry_method::text AS entry_method, t.extraction_confidence::text AS extraction_confidence,
         t.review_status::text AS review_status, false AS conflict, t.source_document_id
    FROM clinical.clinical_attribute t
   WHERE t.patient_id = $1 AND ${sqlDatoVigente('t.review_status')}
   ORDER BY t.attribute_key, t.observed_at NULLS LAST, t.id`;

/** Solo identificador, tipo y fecha: del registro de IA nunca sale el análisis ni el contexto (RN-10). */
const SQL_REGISTROS_DE_IA = `SELECT t.id, t.analysis_type::text AS analysis_type,
         ${FECHA("t.created_at AT TIME ZONE 'UTC'")} AS fecha, ${INSTANTE('t.created_at')} AS created_at
    FROM clinical.ai_analysis_record t
   WHERE t.patient_id = $1
   ORDER BY t.created_at, t.id`;

const texto = (valor: unknown): string => String(valor);
const textoONulo = (valor: unknown): string | null => (valor === null ? null : String(valor));

function procedenciaDeLaFila(fila: Fila): ProcedenciaDeFila {
  return {
    entryMethod: texto(fila['entry_method']) as MetodoDeEntrada,
    extractionConfidence: texto(fila['extraction_confidence']) as ConfianzaDeExtraccion,
    reviewStatus: texto(fila['review_status']) as EstadoDeRevisionVisible,
    conflict: fila['conflict'] === true,
    sourceDocumentId: textoONulo(fila['source_document_id']),
  };
}

const comoDiagnostico = (fila: Fila): DiagnosticoDelCaso => ({
  id: texto(fila['id']),
  histology: texto(fila['histology']),
  icd10Code: textoONulo(fila['icd10_code']),
  diagnosedAt: texto(fila['diagnosed_at']),
  createdAt: texto(fila['created_at']),
  procedencia: procedenciaDeLaFila(fila),
});

const comoBiomarcador = (fila: Fila): BiomarcadorDelCaso => ({
  examId: texto(fila['exam_id']),
  examType: texto(fila['exam_type']),
  performedAt: texto(fila['performed_at']),
  examCreatedAt: texto(fila['exam_created_at']),
  examEntryMethod: texto(fila['exam_entry_method']) as MetodoDeEntrada,
  examSourceDocumentId: textoONulo(fila['exam_source_document_id']),
  biomarkerId: texto(fila['biomarker_id']),
  name: texto(fila['name']),
  loincCode: textoONulo(fila['loinc_code']),
  value: texto(fila['value']),
  unit: textoONulo(fila['unit']),
  extractionConfidence: texto(fila['extraction_confidence']) as ConfianzaDeExtraccion,
  reviewStatus: texto(fila['review_status']) as EstadoDeRevisionVisible,
  conflict: fila['conflict'] === true,
});

const comoTratamiento = (fila: Fila): TratamientoPrevioLeido => ({
  id: texto(fila['id']),
  lineNumber: fila['line_number'] === null ? null : Number(fila['line_number']),
  setting: texto(fila['setting']),
  regimenName: texto(fila['regimen_name']),
  atcCodes: (fila['atc_codes'] as string[]).map(texto),
  cupsCode: textoONulo(fila['cups_code']),
  startedAt: textoONulo(fila['started_at']),
  endedAt: textoONulo(fila['ended_at']),
  ongoing: fila['ongoing'] === true,
  endReason: texto(fila['end_reason']),
  createdAt: texto(fila['created_at']),
  procedencia: procedenciaDeLaFila(fila),
});

const comoEventoClinico = (fila: Fila): EventoClinicoLeido => ({
  id: texto(fila['id']),
  eventType: texto(fila['event_type']),
  eventDate: textoONulo(fila['event_date']),
  datePrecision: texto(fila['date_precision']) as PrecisionDeFecha,
  description: texto(fila['description']),
  icd10Code: textoONulo(fila['icd10_code']),
  cupsCode: textoONulo(fila['cups_code']),
  createdAt: texto(fila['created_at']),
  procedencia: procedenciaDeLaFila(fila),
});

const comoAtributo = (fila: Fila): AtributoLeido => ({
  id: texto(fila['id']),
  key: texto(fila['attribute_key']),
  value: texto(fila['value']),
  observedAt: textoONulo(fila['observed_at']),
  procedencia: procedenciaDeLaFila(fila),
});

const comoRegistroDeIa = (fila: Fila): RegistroDeIaLeido => ({
  id: texto(fila['id']),
  analysisType: texto(fila['analysis_type']) as TipoDeRegistroDeIa,
  fecha: texto(fila['fecha']),
  createdAt: texto(fila['created_at']),
});

export function createCaseViewRepository(db: Consultador): RepositorioDeLaVistaDeCaso {
  const leer = async <T>(
    sql: string,
    patientId: string,
    mapear: (fila: Fila) => T,
  ): Promise<T[]> => {
    const { rows } = await db.query(sql, [patientId]);
    return rows.map(mapear);
  };
  return {
    async existePaciente(patientId): Promise<boolean> {
      const { rows } = await db.query(SQL_EXISTE_PACIENTE, [patientId]);
      return rows.length > 0;
    },
    async leerDatosDelCaso(patientId): Promise<DatosDelCaso> {
      const [diagnosticos, biomarcadores, tratamientos, eventos, atributos, registrosDeIa] =
        await Promise.all([
          leer(SQL_DIAGNOSTICOS, patientId, comoDiagnostico),
          leer(SQL_BIOMARCADORES, patientId, comoBiomarcador),
          leer(SQL_TRATAMIENTOS, patientId, comoTratamiento),
          leer(SQL_EVENTOS, patientId, comoEventoClinico),
          leer(SQL_ATRIBUTOS, patientId, comoAtributo),
          leer(SQL_REGISTROS_DE_IA, patientId, comoRegistroDeIa),
        ]);
      return { diagnosticos, biomarcadores, tratamientos, eventos, atributos, registrosDeIa };
    },
  };
}
