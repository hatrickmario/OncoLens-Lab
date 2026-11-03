import type {
  FollowUpCitedSource,
  PatientDataLink,
} from '../../../../../packages/api-contracts/src/client/clinical-api/index.js';
import type { SupportedClaim } from '../../../../../packages/api-contracts/src/client/rag-orchestrator/index.js';
import type { Consultador } from '../auth/auth.repository.js';
import { sqlDatoVigente } from '../compartido/estados-de-revision.js';
import type { RegistroDeAnalisis } from './analysis-record.js';
import {
  eventoDe,
  registroDeFila,
  type Fila,
  type FilaDeEvento,
} from './evidence-analysis.repository.js';

/** Fila de `clinical.analysis_follow_up` (data-model §7), en camelCase. Inmutable; sin seudónimo (RN-11). */
export interface TurnoDeSeguimiento {
  id: string;
  analysisId: string;
  turnNumber: number;
  /** Pregunta en su versión normalizada y enmascarada. */
  questionText: string;
  status: 'con_evidencia' | 'sin_evidencia' | 'fuera_de_contexto';
  answer: SupportedClaim[];
  citedSources: FollowUpCitedSource[];
  omittedClaims: number;
  patientDataLinks: PatientDataLink[];
  dataClassification: RegistroDeAnalisis['dataClassification'];
  llmProvider: string;
  llmModel: string;
  embeddingModel: string | null;
  rerankerModel: string | null;
  nliModel: string;
  promptVersion: string;
  catalogVersion: string;
  /** El `traceId` propio del turno (`data-model` §7): nunca el del análisis. */
  traceId: string;
  createdAt: Date;
}

/** El turno a insertar: `turnNumber` lo calcula el repository dentro de la transacción. */
export type TurnoNuevo = Omit<TurnoDeSeguimiento, 'turnNumber'>;

export type ResultadoDeInsercion =
  { tipo: 'insertado'; turno: TurnoDeSeguimiento } | { tipo: 'limite_alcanzado' };

export interface FollowUpRepository {
  /** `null` si el análisis no existe. */
  leerAnalisis(analysisId: string): Promise<RegistroDeAnalisis | null>;
  contarTurnos(analysisId: string): Promise<number>;
  /** Eventos vigentes del paciente con fecha posterior a `desde` (`AAAA-MM-DD`): la evolución desde el análisis. */
  leerEventosPosteriores(patientId: string, desde: string): Promise<FilaDeEvento[]>;
  /** Inserta el turno bajo bloqueo del análisis; si ya hay `limite` turnos no inserta (carrera del último turno). */
  insertarTurno(turno: TurnoNuevo, limite: number): Promise<ResultadoDeInsercion>;
  listarTurnos(analysisId: string): Promise<TurnoDeSeguimiento[]>;
}

/** Ejecuta `trabajo` en una transacción sobre UNA conexión (BEGIN/COMMIT; ROLLBACK ante el fallo). */
export type EjecutarEnTransaccion = <T>(trabajo: (tx: Consultador) => Promise<T>) => Promise<T>;

const aJson = (valor: unknown): string => JSON.stringify(valor);

/** `turn_number` lo calcula la propia sentencia: `max + 1` del análisis (la transacción con bloqueo llega con US-218 AC-4). */
const INSERTAR_TURNO = `
  INSERT INTO clinical.analysis_follow_up (
    id, analysis_id, turn_number, question_text, status, answer, cited_sources, omitted_claims,
    patient_data_links, data_classification, llm_provider, llm_model, embedding_model, reranker_model,
    nli_model, prompt_version, catalog_version, trace_id, created_at
  ) VALUES (
    $1, $2, (SELECT COALESCE(MAX(turn_number), 0) + 1 FROM clinical.analysis_follow_up WHERE analysis_id = $2),
    $3, $4, $5::jsonb, $6::jsonb, $7, $8::jsonb, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
  ) RETURNING *`;

function parametrosDelTurno(t: TurnoNuevo): unknown[] {
  return [
    t.id,
    t.analysisId,
    t.questionText,
    t.status,
    aJson(t.answer),
    aJson(t.citedSources),
    t.omittedClaims,
    aJson(t.patientDataLinks),
    t.dataClassification,
    t.llmProvider,
    t.llmModel,
    t.embeddingModel,
    t.rerankerModel,
    t.nliModel,
    t.promptVersion,
    t.catalogVersion,
    t.traceId,
    t.createdAt,
  ];
}

/** El turno tal como quedó en la fila (jsonb ya parseado por `pg`): de aquí sale la respuesta `201` (RN-06). */
function turnoDeFila(f: Fila): TurnoDeSeguimiento {
  return {
    id: f['id'] as string,
    analysisId: f['analysis_id'] as string,
    turnNumber: f['turn_number'] as number,
    questionText: f['question_text'] as string,
    status: f['status'] as TurnoDeSeguimiento['status'],
    answer: f['answer'] as TurnoDeSeguimiento['answer'],
    citedSources: f['cited_sources'] as TurnoDeSeguimiento['citedSources'],
    omittedClaims: f['omitted_claims'] as number,
    patientDataLinks: f['patient_data_links'] as TurnoDeSeguimiento['patientDataLinks'],
    dataClassification: f['data_classification'] as TurnoDeSeguimiento['dataClassification'],
    llmProvider: f['llm_provider'] as string,
    llmModel: f['llm_model'] as string,
    embeddingModel: f['embedding_model'] as string | null,
    rerankerModel: f['reranker_model'] as string | null,
    nliModel: f['nli_model'] as string,
    promptVersion: f['prompt_version'] as string,
    catalogVersion: f['catalog_version'] as string,
    traceId: f['trace_id'] as string,
    createdAt: f['created_at'] as Date,
  };
}

/** Lectura y escritura de `clinical.analysis_follow_up` con `pg` sobre el pool inyectado (migración a Prisma = deuda D-1). */
export function crearFollowUpRepository(
  db: Consultador,
  enTransaccion: EjecutarEnTransaccion,
): FollowUpRepository {
  void enTransaccion;
  return {
    async leerAnalisis(analysisId) {
      const { rows } = await db.query('SELECT * FROM clinical.ai_analysis_record WHERE id = $1', [
        analysisId,
      ]);
      const fila = rows[0];
      return fila === undefined ? null : registroDeFila(fila);
    },
    async contarTurnos(analysisId) {
      const { rows } = await db.query(
        'SELECT count(*)::int AS n FROM clinical.analysis_follow_up WHERE analysis_id = $1',
        [analysisId],
      );
      return (rows[0]?.['n'] as number | undefined) ?? 0;
    },
    async leerEventosPosteriores(patientId, desde) {
      const { rows } = await db.query(
        `SELECT id, event_type, event_date::text AS event_date, description, entry_method,
                extraction_confidence, review_status
           FROM clinical.clinical_event
          WHERE patient_id = $1 AND analysis_id IS NULL AND ${sqlDatoVigente('review_status')}
            AND event_date > $2::date
          ORDER BY event_date, created_at`,
        [patientId, desde],
      );
      return rows.map(eventoDe);
    },
    async insertarTurno(turno) {
      const { rows } = await db.query(INSERTAR_TURNO, parametrosDelTurno(turno));
      return { tipo: 'insertado', turno: turnoDeFila(rows[0] ?? {}) };
    },
    async listarTurnos(analysisId) {
      const { rows } = await db.query(
        'SELECT * FROM clinical.analysis_follow_up WHERE analysis_id = $1 ORDER BY turn_number',
        [analysisId],
      );
      return rows.map(turnoDeFila);
    },
  };
}
