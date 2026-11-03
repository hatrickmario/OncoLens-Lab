import type { FollowUpTurn } from '../../../../../packages/api-contracts/src/client/clinical-api/index.js';
import type { GeneradorDeIds } from '../../infrastructure/ids.js';
import type { FollowUpRepository } from './follow-up.repository.js';
import type { PeticionDeSeguimiento } from './follow-up.schema.js';
import type {
  CatalogVersionProvider,
  Clock,
  ContextDeidentifier,
  RagFollowUpPort,
  RespuestaDeFallo,
} from './ports.js';

/** El análisis al que se pregunta no existe (`404`). */
export class AnalisisNoEncontradoError extends Error {
  constructor() {
    super('Análisis no encontrado');
    this.name = 'AnalisisNoEncontradoError';
  }
}

/** El análisis no tiene evidencia que preguntar (`422 ANALISIS_SIN_EVIDENCIA`). */
export class AnalisisSinEvidenciaError extends Error {
  constructor() {
    super('El análisis no tiene evidencia');
    this.name = 'AnalisisSinEvidenciaError';
  }
}

/** El análisis ya alcanzó `ANALYSIS_FOLLOWUP_MAX` turnos (`409 LIMITE_SEGUIMIENTO`). */
export class LimiteDeSeguimientoError extends Error {
  constructor() {
    super('Límite de seguimiento alcanzado');
    this.name = 'LimiteDeSeguimientoError';
  }
}

export interface ConfiguracionDelSeguimiento {
  /** `ANALYSIS_FOLLOWUP_MAX` (RN-22). */
  analysisFollowupMax: number;
  /** Plazo hacia rag-orchestrator en ms (`RAG_TIMEOUT_MS`, RN-22). */
  ragTimeoutMs: number;
  /** `AI_DISCLAIMER_TEXT` (RN-19, RN-22). */
  aiDisclaimerText: string;
}

export interface DependenciasDelSeguimiento {
  seguimientos: FollowUpRepository;
  desidentificador: ContextDeidentifier;
  rag: RagFollowUpPort;
  catalogo: CatalogVersionProvider;
  reloj: Clock;
  /** UUID de los turnos; generador inyectado. */
  idsDeTurnos: GeneradorDeIds;
  config: ConfiguracionDelSeguimiento;
}

export interface SolicitudDeSeguimiento {
  traceId: string;
  analysisId: string;
  peticion: PeticionDeSeguimiento;
}

export type ResultadoDelSeguimiento =
  { tipo: 'creado'; cuerpo: FollowUpTurn } | { tipo: 'fallo'; respuesta: RespuestaDeFallo };

export interface FollowUpService {
  crear(solicitud: SolicitudDeSeguimiento): Promise<ResultadoDelSeguimiento>;
  listar(analysisId: string): Promise<FollowUpTurn[]>;
}

export function crearFollowUpService(dependencias: DependenciasDelSeguimiento): FollowUpService {
  void dependencias;
  return {
    crear() {
      throw new Error('no implementado');
    },
    listar() {
      throw new Error('no implementado');
    },
  };
}
