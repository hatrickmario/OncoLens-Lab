import type { FollowUpTurn } from '../../../../../packages/api-contracts/src/client/clinical-api/index.js';
import type {
  PriorAnalysisMemory,
  RagFollowUpRequest,
} from '../../../../../packages/api-contracts/src/client/rag-orchestrator/index.js';
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
  fechaUtc,
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
  SalidaDeDesidentificacion,
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

type Dependencias = DependenciasDelSeguimiento;

async function leerAnalisisExistente(
  { seguimientos }: Dependencias,
  analysisId: string,
): Promise<RegistroDeAnalisis> {
  const registro = await seguimientos.leerAnalisis(analysisId);
  if (registro === null) throw new AnalisisNoEncontradoError();
  return registro;
}

/** Solo un análisis `con_evidencia` admite preguntas: ni el `sin_evidencia` ni el `tipo_no_habilitado` tienen sobre qué. */
async function leerAnalisisConEvidencia(
  dependencias: Dependencias,
  analysisId: string,
): Promise<RegistroDeAnalisis> {
  const registro = await leerAnalisisExistente(dependencias, analysisId);
  if (registro.status !== 'con_evidencia') throw new AnalisisSinEvidenciaError();
  return registro;
}

/** Memoria rotulada del análisis con la evolución registrada desde entonces (aún sin enmascarar; RN-24). */
async function memoriaDelSeguimiento(
  { seguimientos, reloj }: Dependencias,
  registro: RegistroDeAnalisis,
): Promise<PriorAnalysisMemory> {
  const eventos = await seguimientos.leerEventosPosteriores(
    registro.patientId,
    fechaUtc(registro.createdAt),
  );
  return memoriaDelAnalisis(registro, eventos, reloj.now());
}

/**
 * RN-11: la pregunta y la memoria del análisis con su evolución salen enmascaradas con el desidentificador de ADR-40,
 * con un seudónimo nuevo por turno. Es el único punto donde algo del seguimiento se prepara para la IA; solo enmascara.
 */
function desidentificarContexto(
  { desidentificador }: Dependencias,
  { traceId, peticion }: SolicitudDeSeguimiento,
  registro: RegistroDeAnalisis,
  memoria: PriorAnalysisMemory,
): Promise<SalidaDeDesidentificacion> {
  return desidentificador.desidentificar({
    traceId,
    patientId: registro.patientId,
    contexto: contextoConMemoria(registro, memoria),
    query: peticion.question,
    dataOrigin: registro.dataClassification,
  });
}

async function armarRequest(
  dependencias: Dependencias,
  solicitud: SolicitudDeSeguimiento,
  registro: RegistroDeAnalisis,
): Promise<RagFollowUpRequest> {
  const memoria = await memoriaDelSeguimiento(dependencias, registro);
  const { clinicalContext, query } = await desidentificarContexto(
    dependencias,
    solicitud,
    registro,
    memoria,
  );
  return armarRagFollowUpRequest({
    traceId: solicitud.traceId,
    catalogVersion: dependencias.catalogo.version(),
    question: query,
    registro,
    clinicalContext,
  });
}

function consultar(
  { rag, reloj, config }: Dependencias,
  request: RagFollowUpRequest,
): Promise<RespuestaDeSeguimientoRag> {
  const deadline = calcularDeadline(reloj.now(), config.ragTimeoutMs);
  return llamarConPlazo(config.ragTimeoutMs, (signal) =>
    rag.responder(request, { deadline, signal }),
  );
}

/** RN-06: el turno se persiste ANTES de responder y la respuesta sale de la fila leída, nunca de lo armado en memoria. */
async function persistirTurnoAntesDeResponder(
  { seguimientos, config }: Dependencias,
  turno: TurnoNuevo,
): Promise<TurnoDeSeguimiento> {
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
  { idsDeTurnos, reloj }: Dependencias,
  solicitud: SolicitudDeSeguimiento,
  registro: RegistroDeAnalisis,
  cuerpoDeRag: unknown,
  pregunta: string,
): TurnoNuevo | null {
  const validada = zRagFollowUpResponseRefinado.safeParse(cuerpoDeRag);
  if (!validada.success) return null;
  const cuerpo = validada.data;
  const { enlaces, sinResolver } = enlacesDelTurno(cuerpo.answer, registro.patientDataLinks);
  if (sinResolver.length > 0) return null;
  return {
    id: idsDeTurnos(),
    analysisId: solicitud.analysisId,
    questionText: pregunta,
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

/** `409` antes de gastar la IA: el límite sale de configuración (RN-22) y se comprueba otra vez al insertar, bajo bloqueo. */
async function exigirTurnoDisponible(
  { seguimientos, config }: Dependencias,
  analysisId: string,
): Promise<void> {
  const turnos = await seguimientos.contarTurnos(analysisId);
  if (superaLimiteDeSeguimiento(turnos, config.analysisFollowupMax)) {
    throw new LimiteDeSeguimientoError();
  }
}

async function crearTurno(
  dependencias: Dependencias,
  solicitud: SolicitudDeSeguimiento,
): Promise<ResultadoDelSeguimiento> {
  const registro = await leerAnalisisConEvidencia(dependencias, solicitud.analysisId);
  await exigirTurnoDisponible(dependencias, solicitud.analysisId);
  const request = await armarRequest(dependencias, solicitud, registro);
  const respuesta = await consultar(dependencias, request);
  if (!respuesta.ok) return { tipo: 'fallo', respuesta: mapearFalloRagDeSeguimiento(respuesta) };
  const nuevo = armarTurno(dependencias, solicitud, registro, respuesta.cuerpo, request.question);
  if (nuevo === null) return { tipo: 'fallo', respuesta: RESPUESTA_INTERNA_INVALIDA };
  const turno = await persistirTurnoAntesDeResponder(dependencias, nuevo);
  return { tipo: 'creado', cuerpo: aFollowUpTurn(turno, dependencias.config.aiDisclaimerText) };
}

async function listarTurnos(
  dependencias: Dependencias,
  analysisId: string,
): Promise<FollowUpTurn[]> {
  await leerAnalisisExistente(dependencias, analysisId);
  const turnos = await dependencias.seguimientos.listarTurnos(analysisId);
  return turnos.map((turno) => aFollowUpTurn(turno, dependencias.config.aiDisclaimerText));
}

/**
 * Seguimiento de un análisis (FR-31): leer el análisis → límite → desidentificar pregunta, memoria y evolución con
 * seudónimo nuevo → consultar a `/rag/follow-up` con plazo → persistir el turno ANTES de responder (RN-06). Los puertos
 * llegan por la factory.
 */
export function crearFollowUpService(dependencias: DependenciasDelSeguimiento): FollowUpService {
  return {
    crear: (solicitud) => crearTurno(dependencias, solicitud),
    listar: (analysisId) => listarTurnos(dependencias, analysisId),
  };
}
