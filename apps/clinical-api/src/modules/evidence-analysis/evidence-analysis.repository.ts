import type { Consultador } from '../auth/auth.repository.js';
import type { RegistroDeAnalisis } from './analysis-record.js';
import type { OrigenDeDatos } from './ports.js';

export type EstadoDeRevision = 'auto_aceptado' | 'requiere_revision' | 'verificado' | 'corregido';
export type MetodoDeIngreso = 'ocr' | 'manual' | 'manual_correction' | 'seed';
export type ConfianzaDeExtraccion = 'alta' | 'media' | 'baja' | 'n_a';

/** Campos de procedencia que comparten todas las filas clínicas que viajan en el contexto. */
export interface ProcedenciaDeFila {
  entryMethod: MetodoDeIngreso;
  extractionConfidence: ConfianzaDeExtraccion;
  reviewStatus: EstadoDeRevision;
  /** `conflicts_with_id` solo existe en diagnóstico y biomarcador; en el resto es `null`. */
  conflictsWithId: string | null;
}

/** Las fechas llegan como `AAAA-MM-DD` (texto): `pg` convertiría una `date` en un `Date` con zona local. */
export interface FilaDeDiagnostico extends ProcedenciaDeFila {
  id: string;
  cancerType: string;
  histology: string;
  grade: string | null;
  stagingSystem: string | null;
  stageValue: string | null;
  performanceScale: string | null;
  performanceValue: number | null;
  diagnosedAt: string;
}

export interface FilaDeBiomarcador extends ProcedenciaDeFila {
  id: string;
  name: string;
  value: string;
  resultType: 'cuantitativo' | 'cualitativo';
  clinicalSignificance: 'normal' | 'alterado' | 'relevante' | 'crítico';
  performedAt: string;
  createdAt: string;
}

export interface FilaDeAtributo extends ProcedenciaDeFila {
  id: string;
  attributeKey: string;
  value: string;
  observedAt: string | null;
}

export interface FilaDeTratamientoPrevio extends ProcedenciaDeFila {
  id: string;
  lineNumber: number | null;
  setting: string;
  regimenName: string;
  atcCodes: string[];
  startedAt: string | null;
  endedAt: string | null;
  ongoing: boolean;
  endReason: 'progresion' | 'toxicidad' | 'completado' | 'otro' | 'desconocido';
}

export interface FilaDeEvento extends ProcedenciaDeFila {
  id: string;
  eventType: string;
  eventDate: string | null;
  description: string;
}

/**
 * Todo lo que el gateway lee del caso: filas crudas, sin decidir qué viaja (eso es del builder). Las notas clínicas no
 * se leen: viajan vacías por minimización (readme §2.5) y un texto libre que no se lee no puede filtrarse.
 */
export interface CasoClinico {
  paciente: { id: string; dataOrigin: OrigenDeDatos; population: 'adulto' | 'pediatrico' };
  /** Episodio de atención vigente (o el último): al que se asocia el `AIAnalysisRecord`. `null` si no hay ninguno. */
  episodioId: string | null;
  diagnosticoActivo: FilaDeDiagnostico | null;
  biomarcadores: FilaDeBiomarcador[];
  atributos: FilaDeAtributo[];
  tratamientosPrevios: FilaDeTratamientoPrevio[];
  eventos: FilaDeEvento[];
}

export interface CasoRepository {
  /** `null` si el paciente no existe. */
  leerCaso(patientId: string): Promise<CasoClinico | null>;
}

/** Escritura del `AIAnalysisRecord` (RN-06). */
export interface AnalisisRepository {
  /**
   * Inserta el registro en una sola sentencia (atómica: el `COMMIT` ocurre antes de resolver) y devuelve el registro
   * leído de la fila persistida. Un fallo de la base lanza sin detalles del error de PostgreSQL.
   */
  persistirAnalisis(registro: RegistroDeAnalisis): Promise<RegistroDeAnalisis>;
}

type Fila = Record<string, unknown>;

/** Los datos rechazados o reemplazados no entran al RAG (RN-07); el contrato de procedencia ni siquiera los admite. */
const SIN_RECHAZADOS = `review_status NOT IN ('rechazado', 'reemplazado')`;

function procedenciaDe(fila: Fila): ProcedenciaDeFila {
  return {
    entryMethod: fila['entry_method'] as MetodoDeIngreso,
    extractionConfidence: fila['extraction_confidence'] as ConfianzaDeExtraccion,
    reviewStatus: fila['review_status'] as EstadoDeRevision,
    conflictsWithId: (fila['conflicts_with_id'] as string | null | undefined) ?? null,
  };
}

function diagnosticoDe(fila: Fila): FilaDeDiagnostico {
  return {
    id: fila['id'] as string,
    cancerType: fila['cancer_type'] as string,
    histology: fila['histology'] as string,
    grade: fila['grade'] as string | null,
    stagingSystem: fila['staging_system'] as string | null,
    stageValue: fila['stage_value'] as string | null,
    performanceScale: fila['performance_scale'] as string | null,
    performanceValue: fila['performance_value'] as number | null,
    diagnosedAt: fila['diagnosed_at'] as string,
    ...procedenciaDe(fila),
  };
}

function biomarcadorDe(fila: Fila): FilaDeBiomarcador {
  return {
    id: fila['id'] as string,
    name: fila['name'] as string,
    value: fila['value'] as string,
    resultType: fila['result_type'] as FilaDeBiomarcador['resultType'],
    clinicalSignificance: fila[
      'clinical_significance'
    ] as FilaDeBiomarcador['clinicalSignificance'],
    performedAt: fila['performed_at'] as string,
    createdAt: (fila['created_at'] as Date).toISOString(),
    ...procedenciaDe(fila),
  };
}

function atributoDe(fila: Fila): FilaDeAtributo {
  return {
    id: fila['id'] as string,
    attributeKey: fila['attribute_key'] as string,
    value: fila['value'] as string,
    observedAt: fila['observed_at'] as string | null,
    ...procedenciaDe(fila),
  };
}

function tratamientoPrevioDe(fila: Fila): FilaDeTratamientoPrevio {
  return {
    id: fila['id'] as string,
    lineNumber: fila['line_number'] as number | null,
    setting: fila['setting'] as string,
    regimenName: fila['regimen_name'] as string,
    atcCodes: fila['atc_codes'] as string[],
    startedAt: fila['started_at'] as string | null,
    endedAt: fila['ended_at'] as string | null,
    ongoing: fila['ongoing'] as boolean,
    endReason: fila['end_reason'] as FilaDeTratamientoPrevio['endReason'],
    ...procedenciaDe(fila),
  };
}

function eventoDe(fila: Fila): FilaDeEvento {
  return {
    id: fila['id'] as string,
    eventType: fila['event_type'] as string,
    eventDate: fila['event_date'] as string | null,
    description: fila['description'] as string,
    ...procedenciaDe(fila),
  };
}

/** Las consultas van de una en una: `pg.Client` no admite consultas concurrentes y el caso son cinco lecturas cortas. */
type Leer = (sql: string) => Promise<Fila[]>;

async function leerDiagnosticoActivo(leer: Leer): Promise<FilaDeDiagnostico | null> {
  const [fila] = await leer(
    `SELECT id, cancer_type, histology, grade, staging_system, stage_value, performance_scale,
            performance_value, diagnosed_at::text AS diagnosed_at, entry_method,
            extraction_confidence, review_status, conflicts_with_id
       FROM clinical.diagnosis
      WHERE patient_id = $1 AND is_active AND ${SIN_RECHAZADOS}
      ORDER BY diagnosed_at DESC, created_at DESC
      LIMIT 1`,
  );
  return fila === undefined ? null : diagnosticoDe(fila);
}

async function leerBiomarcadores(leer: Leer): Promise<FilaDeBiomarcador[]> {
  const filas = await leer(
    `SELECT b.id, b.name, b.value, b.result_type, b.clinical_significance, b.created_at,
            e.performed_at::text AS performed_at, e.entry_method, b.extraction_confidence,
            b.review_status, b.conflicts_with_id
       FROM clinical.biomarker b JOIN clinical.exam e ON e.id = b.exam_id
      WHERE e.patient_id = $1 AND b.${SIN_RECHAZADOS}
      ORDER BY e.performed_at DESC, b.created_at DESC`,
  );
  return filas.map(biomarcadorDe);
}

async function leerAtributos(leer: Leer): Promise<FilaDeAtributo[]> {
  const filas = await leer(
    `SELECT id, attribute_key, value, observed_at::text AS observed_at, entry_method,
            extraction_confidence, review_status
       FROM clinical.clinical_attribute
      WHERE patient_id = $1 AND ${SIN_RECHAZADOS}
      ORDER BY attribute_key, observed_at DESC NULLS LAST`,
  );
  return filas.map(atributoDe);
}

async function leerTratamientosPrevios(leer: Leer): Promise<FilaDeTratamientoPrevio[]> {
  const filas = await leer(
    `SELECT id, line_number, setting, regimen_name, atc_codes, started_at::text AS started_at,
            ended_at::text AS ended_at, ongoing, end_reason, entry_method,
            extraction_confidence, review_status
       FROM clinical.prior_treatment
      WHERE patient_id = $1 AND ${SIN_RECHAZADOS}
      ORDER BY line_number NULLS LAST, started_at NULLS LAST`,
  );
  return filas.map(tratamientoPrevioDe);
}

/** Los eventos con `analysis_id` son el reflejo de un análisis previo en el timeline: no son datos clínicos. */
async function leerEventos(leer: Leer): Promise<FilaDeEvento[]> {
  const filas = await leer(
    `SELECT id, event_type, event_date::text AS event_date, description, entry_method,
            extraction_confidence, review_status
       FROM clinical.clinical_event
      WHERE patient_id = $1 AND analysis_id IS NULL AND ${SIN_RECHAZADOS}
      ORDER BY event_date NULLS LAST, created_at`,
  );
  return filas.map(eventoDe);
}

/** El episodio abierto del paciente o, si no hay, el último: el `AIAnalysisRecord` se asocia a él. */
async function leerEpisodioVigente(leer: Leer): Promise<string | null> {
  const [fila] = await leer(
    `SELECT id FROM clinical.care_episode
      WHERE patient_id = $1
      ORDER BY (closed_at IS NULL) DESC, opened_at DESC
      LIMIT 1`,
  );
  return fila === undefined ? null : (fila['id'] as string);
}

/**
 * Columnas de `clinical.ai_analysis_record` en el orden de `parametrosDelRegistro()`. Una sola sentencia: es atómica y
 * su `COMMIT` ocurre antes de que la promesa resuelva (RN-06). `RETURNING` devuelve lo realmente persistido.
 */
const INSERTAR_REGISTRO = `
  INSERT INTO clinical.ai_analysis_record (
    id, patient_id, episode_id, requested_by, analysis_type, trace_id, query_text, question_template_id,
    query_language, response_language, sources_selected, filters_applied, synthesis, applicability,
    evidence_options, discarded_options, case_summary, analysis_basis, agent_steps, omitted_claims,
    missing_critical_data, continued_with_warning, prior_analyses_used, patient_data_links,
    top_relevance_score, status, clinical_context_snapshot, context_fingerprint, rerun_of_analysis_id,
    data_classification, llm_provider, llm_model, embedding_model, reranker_model, nli_model,
    prompt_version, corpus_release, catalog_version, retrieval_params, created_at
  ) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb, $13::jsonb, $14::jsonb,
    $15::jsonb, $16::jsonb, $17::jsonb, $18::jsonb, $19::jsonb, $20, $21::jsonb, $22, $23::uuid[],
    $24::jsonb, $25, $26, $27::jsonb, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38,
    $39::jsonb, $40
  ) RETURNING *`;

const aJson = (valor: unknown): string | null => (valor === null ? null : JSON.stringify(valor));

/** `node-pg` convertiría un arreglo JS en un arreglo de PostgreSQL: los jsonb viajan siempre como texto JSON. */
function parametrosDelRegistro(r: RegistroDeAnalisis): unknown[] {
  return [
    r.id,
    r.patientId,
    r.episodeId,
    r.requestedBy,
    r.analysisType,
    r.traceId,
    r.queryText,
    r.questionTemplateId,
    r.queryLanguage,
    r.responseLanguage,
    aJson(r.sourcesSelected),
    aJson(r.filtersApplied),
    aJson(r.synthesis),
    aJson(r.applicability),
    aJson(r.evidenceOptions),
    aJson(r.discardedOptions),
    aJson(r.caseSummary),
    aJson(r.analysisBasis),
    aJson(r.agentSteps),
    r.omittedClaims,
    aJson(r.missingCriticalData),
    r.continuedWithWarning,
    r.priorAnalysesUsed,
    aJson(r.patientDataLinks),
    r.topRelevanceScore,
    r.status,
    aJson(r.clinicalContextSnapshot),
    r.contextFingerprint,
    r.rerunOfAnalysisId,
    r.dataClassification,
    r.llmProvider,
    r.llmModel,
    r.embeddingModel,
    r.rerankerModel,
    r.nliModel,
    r.promptVersion,
    r.corpusRelease,
    r.catalogVersion,
    aJson(r.retrievalParams),
    r.createdAt,
  ];
}

/** El registro tal como quedó en la fila (jsonb ya parseado por `pg`): de aquí sale la respuesta `200`. */
function registroDeFila(f: Fila): RegistroDeAnalisis {
  return {
    id: f['id'] as string,
    patientId: f['patient_id'] as string,
    episodeId: f['episode_id'] as string,
    requestedBy: f['requested_by'] as string,
    analysisType: f['analysis_type'] as RegistroDeAnalisis['analysisType'],
    traceId: f['trace_id'] as string,
    queryText: f['query_text'] as string,
    questionTemplateId: f['question_template_id'] as string | null,
    queryLanguage: f['query_language'] as RegistroDeAnalisis['queryLanguage'],
    responseLanguage: f['response_language'] as RegistroDeAnalisis['responseLanguage'],
    sourcesSelected: f['sources_selected'] as RegistroDeAnalisis['sourcesSelected'],
    filtersApplied: f['filters_applied'] as RegistroDeAnalisis['filtersApplied'],
    synthesis: f['synthesis'] as RegistroDeAnalisis['synthesis'],
    applicability: f['applicability'] as RegistroDeAnalisis['applicability'],
    evidenceOptions: f['evidence_options'] as RegistroDeAnalisis['evidenceOptions'],
    discardedOptions: f['discarded_options'] as RegistroDeAnalisis['discardedOptions'],
    caseSummary: null,
    analysisBasis: f['analysis_basis'] as RegistroDeAnalisis['analysisBasis'],
    agentSteps: f['agent_steps'] as RegistroDeAnalisis['agentSteps'],
    omittedClaims: f['omitted_claims'] as number,
    missingCriticalData: f['missing_critical_data'] as string[],
    continuedWithWarning: f['continued_with_warning'] as boolean,
    priorAnalysesUsed: f['prior_analyses_used'] as string[],
    patientDataLinks: f['patient_data_links'] as RegistroDeAnalisis['patientDataLinks'],
    topRelevanceScore: f['top_relevance_score'] as number | null,
    status: f['status'] as RegistroDeAnalisis['status'],
    clinicalContextSnapshot: f[
      'clinical_context_snapshot'
    ] as RegistroDeAnalisis['clinicalContextSnapshot'],
    contextFingerprint: f['context_fingerprint'] as string,
    rerunOfAnalysisId: null,
    dataClassification: f['data_classification'] as RegistroDeAnalisis['dataClassification'],
    llmProvider: f['llm_provider'] as string | null,
    llmModel: f['llm_model'] as string | null,
    embeddingModel: f['embedding_model'] as string | null,
    rerankerModel: f['reranker_model'] as string | null,
    nliModel: f['nli_model'] as string | null,
    promptVersion: f['prompt_version'] as string | null,
    corpusRelease: f['corpus_release'] as string | null,
    catalogVersion: f['catalog_version'] as string,
    retrievalParams: f['retrieval_params'] as RegistroDeAnalisis['retrievalParams'],
    createdAt: f['created_at'] as Date,
  };
}

/**
 * Lectura del caso con `pg` sobre el pool inyectado de `server.ts` (migración a Prisma = deuda D-1). Solo lee las
 * columnas que el builder usa: las notas, la identidad y la referencia del convenio no se leen. Las fechas llegan como
 * texto `AAAA-MM-DD` para que la zona horaria del proceso no mueva el día.
 */
export function createEvidenceAnalysisRepository(
  db: Consultador,
): CasoRepository & AnalisisRepository {
  return {
    async persistirAnalisis(registro) {
      const { rows } = await db.query(INSERTAR_REGISTRO, parametrosDelRegistro(registro));
      return registroDeFila(rows[0] ?? {});
    },
    async leerCaso(patientId) {
      const leer: Leer = async (sql) => (await db.query(sql, [patientId])).rows;
      const [paciente] = await leer(
        'SELECT id, data_origin, population FROM clinical.patient WHERE id = $1',
      );
      if (paciente === undefined) return null;
      return {
        paciente: {
          id: paciente['id'] as string,
          dataOrigin: paciente['data_origin'] as OrigenDeDatos,
          population: paciente['population'] as 'adulto' | 'pediatrico',
        },
        episodioId: await leerEpisodioVigente(leer),
        diagnosticoActivo: await leerDiagnosticoActivo(leer),
        biomarcadores: await leerBiomarcadores(leer),
        atributos: await leerAtributos(leer),
        tratamientosPrevios: await leerTratamientosPrevios(leer),
        eventos: await leerEventos(leer),
      };
    },
  };
}
