import type {
  Conversation,
  ConversationTurn,
} from '../../../../../../packages/api-contracts/src/client/clinical-api/index.js';
import type {
  ChatCompletenessItem,
  ChatTurnRequest,
} from '../../../../../../packages/api-contracts/src/client/rag-orchestrator/index.js';
import { zChatTurnResponseRefinado } from '../../../../../../packages/api-contracts/src/zod/rag-orchestrator/refinamientos.gen.js';
import type { Clock } from '../../../infrastructure/clock.js';
import type { GeneradorDeIds } from '../../../infrastructure/ids.js';
import { FalloDePersistenciaError } from '../analysis-completion.js';
import { construirContextoPermitido } from '../clinical-context.builder.js';
import { clasificacionDelPaciente } from '../regla-proveedor.js';
import type { CasoClinico, CasoRepository } from '../evidence-analysis.repository.js';
import { calcularDeadline } from '../evidence-analysis.service.js';
import { RESPUESTA_INTERNA_INVALIDA, mapearFalloRagDeChat } from '../rag-failure.js';
import { llamarConPlazo } from '../rag-plazo.js';
import type {
  CatalogVersionProvider,
  ChatTurnPort,
  ChecklistDelChat,
  ContextDeidentifier,
  ContextoPermitido,
  RespuestaDeFallo,
  RespuestaDeTurnoRag,
  SalidaDeDesidentificacion,
} from '../ports.js';
import type {
  Conversacion,
  ConversationRepository,
  TurnoDeConversacion,
  TurnoNuevo,
} from './conversation.repository.js';
import { construirHechosDelCaso, type HechosDelCaso } from './hechos-del-caso.js';
import {
  construirRehidratacion,
  derivarEstadoDelTurno,
  enlacesDelTurno,
  etiquetasDeFaltantes,
  etiquetasDeHechosUsados,
  rehidratacionVacia,
  type EstadoDelTurno,
} from './conversation.reglas.js';
import type { PeticionDeTurno } from './conversation.schema.js';

/** La conversación (o el paciente al que se ancla) no existe (`404`). */
export class ConversacionNoEncontradaError extends Error {
  constructor() {
    super('Conversación no encontrada');
    this.name = 'ConversacionNoEncontradaError';
  }
}

/** El turno al que se refiere la pregunta (`aboutTurnId`) no es de esta conversación (`422 CUERPO_INVALIDO`). */
export class TurnoReferidoInexistenteError extends Error {
  constructor() {
    super('El turno referido no es de la conversación');
    this.name = 'TurnoReferidoInexistenteError';
  }
}

export interface ConfiguracionDeLaConversacion {
  /** Plazo hacia rag-orchestrator en ms (`RAG_TIMEOUT_MS`, RN-22). */
  ragTimeoutMs: number;
  /** `CHAT_REHYDRATE_TURNS` (RN-22): turnos que se reenvían al rehidratar un hilo desconocido. */
  chatRehydrateTurns: number;
}

export interface DependenciasDeLaConversacion {
  conversaciones: ConversationRepository;
  casos: CasoRepository;
  checklist: ChecklistDelChat;
  desidentificador: ContextDeidentifier;
  rag: ChatTurnPort;
  catalogo: CatalogVersionProvider;
  reloj: Clock;
  /** UUID de las conversaciones, de sus turnos y de su hilo (`thread_id`): tres generadores distintos. */
  idsDeConversaciones: GeneradorDeIds;
  idsDeTurnos: GeneradorDeIds;
  idsDeHilos: GeneradorDeIds;
  config: ConfiguracionDeLaConversacion;
}

export interface SolicitudDeTurno {
  traceId: string;
  conversationId: string;
  peticion: PeticionDeTurno;
}

export type ResultadoDelTurno =
  { tipo: 'creado'; cuerpo: ConversationTurn } | { tipo: 'fallo'; respuesta: RespuestaDeFallo };

export interface ConversationService {
  abrir(solicitud: { patientId: string; userId: string }): Promise<Conversation>;
  leer(conversationId: string): Promise<Conversation>;
  crearTurno(solicitud: SolicitudDeTurno): Promise<ResultadoDelTurno>;
}

/**
 * `ConversationTurn` de la respuesta, construido desde lo persistido: lo que el oncólogo ve es lo que quedó registrado
 * (RN-06). `status` y `topRelevanceScore` los deriva Backend 1 (nunca los recibe); al leer una conversación salen de la
 * intención de la fila, porque el resultado de evidencia del turno no se persiste hasta L1D-322.
 */
function aConversationTurn(
  turno: TurnoDeConversacion,
  estado: EstadoDelTurno = derivarEstadoDelTurno(turno.intent, undefined),
): ConversationTurn {
  return {
    id: turno.id,
    turnNumber: turno.turnNumber,
    createdAt: turno.createdAt.toISOString(),
    question: turno.questionMasked,
    intent: turno.intent,
    ...(turno.aboutTurnId !== null && { aboutTurnId: turno.aboutTurnId }),
    status: estado.status,
    topRelevanceScore: estado.topRelevanceScore,
    blocks: turno.blocks,
    dataLinks: turno.dataLinks,
    omittedClaims: turno.omittedClaims,
    ...(turno.analysisId !== null && { analysisId: turno.analysisId }),
    notices: turno.notices,
    dataUsed: turno.dataUsed,
    dataMissing: turno.dataMissing,
  };
}

function aConversation(
  conversacion: Conversacion,
  turnos: readonly TurnoDeConversacion[],
): Conversation {
  return {
    conversationId: conversacion.id,
    patientId: conversacion.patientId,
    createdAt: conversacion.createdAt.toISOString(),
    turns: turnos.map((turno) => aConversationTurn(turno)),
  };
}

type Dependencias = DependenciasDeLaConversacion;

async function leerConversacionExistente(
  { conversaciones }: Dependencias,
  conversationId: string,
): Promise<Conversacion> {
  const conversacion = await conversaciones.leerConversacion(conversationId);
  if (conversacion === null) throw new ConversacionNoEncontradaError();
  return conversacion;
}

/** `thread_id` aleatorio del generador inyectado (ADR-51): nunca derivado de `patientId`, del `id` ni del seudónimo. */
async function abrirConversacion(
  dependencias: Dependencias,
  { patientId, userId }: { patientId: string; userId: string },
): Promise<Conversation> {
  const { conversaciones, idsDeConversaciones, idsDeHilos, reloj } = dependencias;
  if (!(await conversaciones.existePaciente(patientId))) throw new ConversacionNoEncontradaError();
  const conversacion = await conversaciones.insertarConversacion({
    id: idsDeConversaciones(),
    patientId,
    threadId: idsDeHilos(),
    createdBy: userId,
    createdAt: reloj.now(),
  });
  return aConversation(conversacion, []);
}

async function leerConversacionConTurnos(
  dependencias: Dependencias,
  conversationId: string,
): Promise<Conversation> {
  const conversacion = await leerConversacionExistente(dependencias, conversationId);
  const turnos = await dependencias.conversaciones.listarTurnos(conversationId);
  return aConversation(conversacion, turnos);
}

/** Lo que el turno envía a Backend 2 y lo que Backend 1 conserva de ello para derivar `dataUsed` y `dataMissing`. */
interface TurnoPreparado {
  request: ChatTurnRequest;
  hechos: HechosDelCaso;
  faltantes: readonly ChatCompletenessItem[];
}

/**
 * RN-11: la pregunta y el contexto del caso salen enmascarados con el desidentificador de ADR-40, con un seudónimo
 * nuevo por turno. Es el único punto donde algo de la conversación se prepara para la IA; solo enmascara.
 */
function desidentificarContexto(
  { desidentificador }: Dependencias,
  conversacion: Conversacion,
  caso: CasoClinico,
  entrada: { traceId: string; question: string; contexto: ContextoPermitido },
): Promise<SalidaDeDesidentificacion> {
  return desidentificador.desidentificar({
    traceId: entrada.traceId,
    patientId: conversacion.patientId,
    contexto: entrada.contexto,
    query: entrada.question,
    dataOrigin: clasificacionDelPaciente(caso.paciente),
  });
}

/** El primer turno (y todo hilo sin turnos) ya lleva la rehidratación vacía: rag responde 404 a un hilo que no conoce. */
function rehidratacionInicial(
  previos: readonly TurnoDeConversacion[],
): Pick<ChatTurnRequest, 'rehydration'> {
  return previos.length === 0 ? { rehydration: rehidratacionVacia() } : {};
}

async function prepararTurno(
  dependencias: Dependencias,
  solicitud: SolicitudDeTurno,
  conversacion: Conversacion,
  caso: CasoClinico,
  previos: readonly TurnoDeConversacion[],
): Promise<TurnoPreparado> {
  const { checklist, catalogo, reloj } = dependencias;
  const items = await checklist.items(conversacion.patientId);
  const claves = items.filter((item) => item.status === 'faltante').map((item) => item.item);
  const { contexto, dataRefs } = construirContextoPermitido(caso, reloj.now(), claves);
  const { clinicalContext, query } = await desidentificarContexto(
    dependencias,
    conversacion,
    caso,
    {
      traceId: solicitud.traceId,
      question: solicitud.peticion.question,
      contexto,
    },
  );
  const hechos = construirHechosDelCaso(clinicalContext, dataRefs, caso);
  return {
    hechos,
    faltantes: items,
    request: {
      threadId: conversacion.threadId,
      pseudoPatientId: clinicalContext.pseudoPatientId,
      traceId: solicitud.traceId,
      question: query,
      dataClassification: clasificacionDelPaciente(caso.paciente),
      catalogVersion: catalogo.version(),
      clinicalContext,
      caseFacts: hechos.caseFacts,
      completeness: [...items],
      ...rehidratacionInicial(previos),
    },
  };
}

function consultar(
  { rag, reloj, config }: Dependencias,
  request: ChatTurnRequest,
): Promise<RespuestaDeTurnoRag> {
  const deadline = calcularDeadline(reloj.now(), config.ragTimeoutMs);
  return llamarConPlazo(config.ragTimeoutMs, (signal) =>
    rag.responder(request, { deadline, signal }),
  );
}

const esHiloDesconocido = (respuesta: RespuestaDeTurnoRag): boolean =>
  !respuesta.ok && respuesta.status === 404 && respuesta.codigo === 'HILO_DESCONOCIDO';

/**
 * ADR-51 §4, `[S6 resp. 9]`: ante un hilo que Backend 2 perdió (reinicio, TTL o desalojo) se reenvía el turno UNA vez con
 * la rehidratación de los últimos turnos. Si el primer envío ya la llevaba (primer turno) o el reenvío vuelve a recibir
 * `HILO_DESCONOCIDO`, no hay más intentos: el fallo sale por la tabla única de fallos.
 */
async function consultarRehidratandoSiHaceFalta(
  dependencias: Dependencias,
  request: ChatTurnRequest,
  previos: readonly TurnoDeConversacion[],
): Promise<RespuestaDeTurnoRag> {
  const primera = await consultar(dependencias, request);
  if (!esHiloDesconocido(primera) || request.rehydration !== undefined) return primera;
  return consultar(dependencias, {
    ...request,
    rehydration: construirRehidratacion(previos, dependencias.config.chatRehydrateTurns),
  });
}

/** El turno a persistir desde la respuesta validada; `null` si no cumple el contrato o cita un `factRef` que no se envió. */
function armarTurno(
  { idsDeTurnos, reloj }: Dependencias,
  solicitud: SolicitudDeTurno,
  preparado: TurnoPreparado,
  cuerpoDeRag: unknown,
): { turno: TurnoNuevo; estado: EstadoDelTurno } | null {
  const validada = zChatTurnResponseRefinado.safeParse(cuerpoDeRag);
  if (!validada.success) return null;
  const cuerpo = validada.data;
  const enlaces = enlacesDelTurno(cuerpo.blocks, preparado.hechos.enlaces);
  if (!enlaces.ok) return null;
  const meta = cuerpo.evidenceAnalysis?.meta;
  return {
    estado: derivarEstadoDelTurno(cuerpo.intent, cuerpo.evidenceAnalysis),
    turno: {
      id: idsDeTurnos(),
      conversationId: solicitud.conversationId,
      questionMasked: preparado.request.question,
      intent: cuerpo.intent,
      aboutTurnId: solicitud.peticion.aboutTurnId ?? null,
      blocks: cuerpo.blocks,
      dataLinks: enlaces.enlaces,
      omittedClaims: cuerpo.omittedClaims,
      notices: cuerpo.notices,
      dataUsed: etiquetasDeHechosUsados(preparado.hechos.caseFacts),
      dataMissing: etiquetasDeFaltantes(preparado.faltantes),
      analysisId: null,
      structuredState: cuerpo.structuredState,
      llmProvider: cuerpo.llmProvider,
      llmModel: meta?.llmModel ?? null,
      promptVersion: meta?.promptVersion ?? null,
      traceId: solicitud.traceId,
      createdAt: reloj.now(),
    },
  };
}

/** RN-06: el turno se persiste ANTES de responder y la respuesta sale de la fila leída, nunca de lo armado en memoria. */
async function persistirTurnoAntesDeResponder(
  { conversaciones }: Dependencias,
  turno: TurnoNuevo,
): Promise<TurnoDeConversacion> {
  try {
    return await conversaciones.insertarTurno(turno);
  } catch {
    // Sin eco del error de PostgreSQL: puede traer texto de la pregunta o de la respuesta (RN-10).
    throw new FalloDePersistenciaError();
  }
}

function exigirTurnoReferidoEnLaConversacion(
  previos: readonly TurnoDeConversacion[],
  aboutTurnId: string | undefined,
): void {
  if (aboutTurnId !== undefined && !previos.some((turno) => turno.id === aboutTurnId)) {
    throw new TurnoReferidoInexistenteError();
  }
}

async function crearTurno(
  dependencias: Dependencias,
  solicitud: SolicitudDeTurno,
): Promise<ResultadoDelTurno> {
  const conversacion = await leerConversacionExistente(dependencias, solicitud.conversationId);
  const caso = await dependencias.casos.leerCaso(conversacion.patientId);
  if (caso === null) throw new ConversacionNoEncontradaError();
  const previos = await dependencias.conversaciones.listarTurnos(conversacion.id);
  exigirTurnoReferidoEnLaConversacion(previos, solicitud.peticion.aboutTurnId);
  const preparado = await prepararTurno(dependencias, solicitud, conversacion, caso, previos);
  const respuesta = await consultarRehidratandoSiHaceFalta(
    dependencias,
    preparado.request,
    previos,
  );
  if (!respuesta.ok) return { tipo: 'fallo', respuesta: mapearFalloRagDeChat(respuesta) };
  const armado = armarTurno(dependencias, solicitud, preparado, respuesta.cuerpo);
  if (armado === null) return { tipo: 'fallo', respuesta: RESPUESTA_INTERNA_INVALIDA };
  const turno = await persistirTurnoAntesDeResponder(dependencias, armado.turno);
  return { tipo: 'creado', cuerpo: aConversationTurn(turno, armado.estado) };
}

/**
 * Conversación del oncólogo sobre un paciente (L1D-315, ADR-51): abre la conversación con un `thread_id` aleatorio y,
 * en cada turno, enmascara la pregunta, desidentifica el contexto con seudónimo nuevo, consulta a `/chat/turn` y
 * persiste el turno ANTES de responder (RN-06). Los puertos llegan por la factory.
 */
export function crearConversationService(
  dependencias: DependenciasDeLaConversacion,
): ConversationService {
  return {
    abrir: (solicitud) => abrirConversacion(dependencias, solicitud),
    leer: (conversationId) => leerConversacionConTurnos(dependencias, conversationId),
    crearTurno: (solicitud) => crearTurno(dependencias, solicitud),
  };
}
