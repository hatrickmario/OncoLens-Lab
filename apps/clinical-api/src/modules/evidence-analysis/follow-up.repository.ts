import type {
  FollowUpCitedSource,
  PatientDataLink,
} from '../../../../../packages/api-contracts/src/client/clinical-api/index.js';
import type { SupportedClaim } from '../../../../../packages/api-contracts/src/client/rag-orchestrator/index.js';
import type { Consultador } from '../auth/auth.repository.js';
import type { RegistroDeAnalisis } from './analysis-record.js';
import type { FilaDeEvento } from './evidence-analysis.repository.js';

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
  /** Eventos vigentes del paciente con fecha posterior a `desde` (la evolución desde el análisis). */
  leerEventosPosteriores(patientId: string, desde: Date): Promise<FilaDeEvento[]>;
  /** Inserta el turno bajo bloqueo del análisis; si ya hay `limite` turnos no inserta (carrera del último turno). */
  insertarTurno(turno: TurnoNuevo, limite: number): Promise<ResultadoDeInsercion>;
  listarTurnos(analysisId: string): Promise<TurnoDeSeguimiento[]>;
}

/** Ejecuta `trabajo` en una transacción sobre UNA conexión (BEGIN/COMMIT; ROLLBACK ante el fallo). */
export type EjecutarEnTransaccion = <T>(trabajo: (tx: Consultador) => Promise<T>) => Promise<T>;

export function crearFollowUpRepository(
  db: Consultador,
  enTransaccion: EjecutarEnTransaccion,
): FollowUpRepository {
  void db;
  void enTransaccion;
  const noImplementado = (): never => {
    throw new Error('no implementado');
  };
  return {
    leerAnalisis: noImplementado,
    contarTurnos: noImplementado,
    leerEventosPosteriores: noImplementado,
    insertarTurno: noImplementado,
    listarTurnos: noImplementado,
  };
}
