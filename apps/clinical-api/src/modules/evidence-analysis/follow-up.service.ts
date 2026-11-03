import type { FollowUpTurn } from '../../../../../packages/api-contracts/src/client/clinical-api/index.js';
import type { RagFollowUpRequest } from '../../../../../packages/api-contracts/src/client/rag-orchestrator/index.js';
import { zRagFollowUpResponseRefinado } from '../../../../../packages/api-contracts/src/zod/rag-orchestrator/refinamientos.gen.js';
import type { GeneradorDeIds } from '../../infrastructure/ids.js';
import type { RegistroDeAnalisis } from './analysis-record.js';
import { FalloDePersistenciaError } from './analysis-completion.js';
import { calcularDeadline } from './evidence-analysis.service.js';
import { RESPUESTA_INTERNA_INVALIDA, mapearFalloRagDeSeguimiento } from './rag-failure.js';
import type { FollowUpRepository, TurnoDeSeguimiento, TurnoNuevo } from './follow-up.repository.js';
import {
  armarRagFollowUpRequest,
  contextoConMemoria,
  memoriaDelAnalisis,
} from './follow-up.request.js';
import {
  chunksCitadosPorElAnalisis,
  enlacesDelTurno,
  marcarFuentesNuevas,
  superaLimiteDeSeguimiento,
} from './follow-up.reglas.js';
import type { PeticionDeSeguimiento } from './follow-up.schema.js';
import type {
  CatalogVersionProvider,
  Clock,
  ContextDeidentifier,
  RagFollowUpPort,
  RespuestaDeFallo,
  RespuestaDeSeguimientoRag,
} from './ports.js';
import { llamarConPlazo } from './rag-plazo.js';

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

const fechaUtc = (instante: Date): string => instante.toISOString().slice(0, 10);

/** `FollowUpTurn` de la respuesta, construido desde lo persistido: lo que el oncólogo ve es lo que quedó registrado (RN-06). */
function aFollowUpTurn(turno: TurnoDeSeguimiento, disclaimer: string): FollowUpTurn {
  return {
    id: turno.id,
    analysisId: turno.analysisId,
    turnNumber: turno.turnNumber,
    question: turno.questionText,
    status: turno.status,
    answer: turno.answer,
    citedSources: turno.citedSources,
    omittedClaims: turno.omittedClaims,
    patientDataLinks: turno.patientDataLinks,
    disclaimer,
    createdAt: turno.createdAt.toISOString(),
  };
}

/**
 * Seguimiento de un análisis (FR-31): leer el análisis → límite → desidentificar pregunta, memoria y evolución con
 * seudónimo nuevo → consultar a `/rag/follow-up` con plazo → persistir el turno ANTES de responder (RN-06). Los puertos
 * llegan por la factory.
 */
export function crearFollowUpService(dependencias: DependenciasDelSeguimiento): FollowUpService {
  const { seguimientos, desidentificador, rag, catalogo, reloj, idsDeTurnos, config } =
    dependencias;

  async function leerAnalisisExistente(analysisId: string): Promise<RegistroDeAnalisis> {
    const registro = await seguimientos.leerAnalisis(analysisId);
    if (registro === null) throw new AnalisisNoEncontradoError();
    return registro;
  }

  /** Solo un análisis `con_evidencia` admite preguntas: ni el `sin_evidencia` ni el `tipo_no_habilitado` tienen sobre qué. */
  async function leerAnalisisConEvidencia(analysisId: string): Promise<RegistroDeAnalisis> {
    const registro = await leerAnalisisExistente(analysisId);
    if (registro.status !== 'con_evidencia') throw new AnalisisSinEvidenciaError();
    return registro;
  }

  /** Pregunta, memoria del análisis y evolución posterior, enmascaradas con el desidentificador de ADR-40 (RN-11). */
  async function armarRequest(
    { traceId, peticion }: SolicitudDeSeguimiento,
    registro: RegistroDeAnalisis,
  ): Promise<RagFollowUpRequest> {
    const eventos = await seguimientos.leerEventosPosteriores(
      registro.patientId,
      fechaUtc(registro.createdAt),
    );
    const memoria = memoriaDelAnalisis(registro, eventos, reloj.now());
    const { clinicalContext, query } = await desidentificador.desidentificar({
      traceId,
      patientId: registro.patientId,
      contexto: contextoConMemoria(registro, memoria),
      query: peticion.question,
      dataOrigin: registro.dataClassification,
    });
    return armarRagFollowUpRequest({
      traceId,
      catalogVersion: catalogo.version(),
      question: query,
      registro,
      clinicalContext,
    });
  }

  function consultar(request: RagFollowUpRequest): Promise<RespuestaDeSeguimientoRag> {
    const deadline = calcularDeadline(reloj.now(), config.ragTimeoutMs);
    return llamarConPlazo(config.ragTimeoutMs, (signal) =>
      rag.responder(request, { deadline, signal }),
    );
  }

  /** RN-06: el turno se persiste ANTES de responder y la respuesta sale de la fila leída, nunca de lo armado en memoria. */
  async function persistirTurnoAntesDeResponder(turno: TurnoNuevo): Promise<TurnoDeSeguimiento> {
    try {
      const resultado = await seguimientos.insertarTurno(turno, config.analysisFollowupMax);
      if (resultado.tipo === 'limite_alcanzado') throw new LimiteDeSeguimientoError();
      return resultado.turno;
    } catch (error) {
      if (error instanceof LimiteDeSeguimientoError) throw error;
      throw new FalloDePersistenciaError();
    }
  }

  /** El turno a persistir desde la respuesta validada; `null` si no cumple el contrato o cita un `dataRef` que el análisis no conoce. */
  function armarTurno(
    solicitud: SolicitudDeSeguimiento,
    registro: RegistroDeAnalisis,
    respuesta: Extract<RespuestaDeSeguimientoRag, { ok: true }>,
    request: RagFollowUpRequest,
  ): TurnoNuevo | null {
    const validada = zRagFollowUpResponseRefinado.safeParse(respuesta.cuerpo);
    if (!validada.success) return null;
    const cuerpo = validada.data;
    const { enlaces, sinResolver } = enlacesDelTurno(cuerpo.answer, registro.patientDataLinks);
    if (sinResolver.length > 0) return null;
    return {
      id: idsDeTurnos(),
      analysisId: solicitud.analysisId,
      questionText: request.question,
      status: cuerpo.status,
      answer: cuerpo.answer,
      citedSources: marcarFuentesNuevas(
        cuerpo.citedSources,
        chunksCitadosPorElAnalisis(registro.evidenceOptions, registro.synthesis),
      ),
      omittedClaims: cuerpo.omittedClaims,
      patientDataLinks: enlaces,
      dataClassification: registro.dataClassification,
      llmProvider: cuerpo.meta.llmProvider,
      llmModel: cuerpo.meta.llmModel,
      embeddingModel: cuerpo.meta.embeddingModel,
      rerankerModel: cuerpo.meta.rerankerModel,
      nliModel: cuerpo.meta.nliModel,
      promptVersion: cuerpo.meta.promptVersion,
      catalogVersion: cuerpo.meta.catalogVersion,
      traceId: solicitud.traceId,
      createdAt: reloj.now(),
    };
  }

  return {
    async crear(solicitud) {
      const registro = await leerAnalisisConEvidencia(solicitud.analysisId);
      const turnos = await seguimientos.contarTurnos(solicitud.analysisId);
      if (superaLimiteDeSeguimiento(turnos, config.analysisFollowupMax)) {
        throw new LimiteDeSeguimientoError();
      }
      const request = await armarRequest(solicitud, registro);
      const respuesta = await consultar(request);
      if (!respuesta.ok)
        return { tipo: 'fallo', respuesta: mapearFalloRagDeSeguimiento(respuesta) };
      const nuevo = armarTurno(solicitud, registro, respuesta, request);
      if (nuevo === null) return { tipo: 'fallo', respuesta: RESPUESTA_INTERNA_INVALIDA };
      const turno = await persistirTurnoAntesDeResponder(nuevo);
      return { tipo: 'creado', cuerpo: aFollowUpTurn(turno, config.aiDisclaimerText) };
    },
    async listar(analysisId) {
      await leerAnalisisExistente(analysisId);
      const turnos = await seguimientos.listarTurnos(analysisId);
      return turnos.map((turno) => aFollowUpTurn(turno, config.aiDisclaimerText));
    },
  };
}
