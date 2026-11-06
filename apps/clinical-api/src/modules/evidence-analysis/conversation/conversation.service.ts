import type {
  Conversation,
  ConversationDataLink,
  ConversationTurn,
  EvidenceAnalysis,
} from '../../../../../../packages/api-contracts/src/client/clinical-api/index.js';
import type {
  ChatCompletenessItem,
  ChatTurnRequest,
  DataClassification,
  RagQueryInternalRequest,
  RagQueryInternalResponse,
} from '../../../../../../packages/api-contracts/src/client/rag-orchestrator/index.js';
import { zChatTurnResponseRefinado } from '../../../../../../packages/api-contracts/src/zod/rag-orchestrator/refinamientos.gen.js';
import type { Clock } from '../../../infrastructure/clock.js';
import type { GeneradorDeIds } from '../../../infrastructure/ids.js';
import {
  FalloDePersistenciaError,
  RespuestaInternaInvalidaError,
  topRelevanceScorePersistible,
} from '../analysis-completion.js';
import { armarRegistro, type RegistroDeAnalisis } from '../analysis-record.js';
import { aEvidenceAnalysis } from '../evidence-analysis.mapper.js';
import { construirContextoDelChat } from '../clinical-context.builder.js';
import { clasificacionDelPaciente, proveedorPermitido } from '../regla-proveedor.js';
import type { CasoClinico, CasoRepository } from '../evidence-analysis.repository.js';
import { calcularDeadline } from '../evidence-analysis.service.js';
import {
  PROVEEDOR_NO_PERMITIDO,
  RESPUESTA_INTERNA_INVALIDA,
  esHiloDesconocido,
  mapearFalloRagDeChat,
} from '../rag-failure.js';
import { llamarConPlazo } from '../rag-plazo.js';
import type {
  AnalysisBasisBuilder,
  CatalogVersionProvider,
  ChatTurnPort,
  ChecklistDelChat,
  ContextDeidentifier,
  ContextoPermitido,
  MapaDeDataRefs,
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
  analisisActivo,
  construirRehidratacion,
  creoElAnalisis,
  derivarEstadoDelTurno,
  estadoDelSeguimiento,
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
  /** `ANALYSIS_MAX_OPTIONS` (RN-22): tope de opciones que declara la Base del análisis del turno de evidencia. */
  maxOpciones: number;
  /** `AI_DISCLAIMER_TEXT` (RN-19): aviso del `EvidenceAnalysis` que se responde. */
  aiDisclaimerText: string;
}

export interface DependenciasDeLaConversacion {
  conversaciones: ConversationRepository;
  casos: CasoRepository;
  checklist: ChecklistDelChat;
  desidentificador: ContextDeidentifier;
  rag: ChatTurnPort;
  /** Base del análisis (FR-27) del turno de evidencia: la misma del gateway. */
  base: AnalysisBasisBuilder;
  /** UUID de los `AIAnalysisRecord` del chat; el mismo generador del gateway. */
  idsDeAnalisis: GeneradorDeIds;
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
  userId: string;
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
 * (RN-06). `status` y `topRelevanceScore` los deriva Backend 1 (nunca los recibe): el turno de evidencia los toma del
 * registro del análisis; el de seguimiento, de `ultimaEvidencia`; el resto, de su intención.
 */
function aConversationTurn(
  turno: TurnoDeConversacion,
  estado: EstadoDelTurno,
  evidenceAnalysis?: EvidenceAnalysis,
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
    ...(evidenceAnalysis !== undefined && { evidenceAnalysis }),
    notices: turno.notices,
    dataUsed: turno.dataUsed,
    dataMissing: turno.dataMissing,
  };
}

/** Un turno ya persistido al leer la conversación: el que creó el análisis trae el suyo; el de seguimiento, no. */
function leerTurno(
  turno: TurnoDeConversacion,
  turnos: readonly TurnoDeConversacion[],
  registros: ReadonlyMap<string, RegistroDeAnalisis>,
  disclaimer: string,
): ConversationTurn {
  const registro = turno.analysisId === null ? undefined : registros.get(turno.analysisId);
  if (registro !== undefined && creoElAnalisis(turnos, turno)) {
    const estado: EstadoDelTurno = {
      status: registro.status === 'sin_evidencia' ? 'sin_evidencia' : 'respondido',
      topRelevanceScore: registro.topRelevanceScore,
    };
    return aConversationTurn(turno, estado, aEvidenceAnalysis(registro, disclaimer));
  }
  const estado =
    turno.analysisId === null
      ? derivarEstadoDelTurno(turno.intent, undefined)
      : estadoDelSeguimiento(turno.structuredState);
  return aConversationTurn(turno, estado);
}

function aConversation(
  conversacion: Conversacion,
  turnos: readonly TurnoDeConversacion[],
  registros: ReadonlyMap<string, RegistroDeAnalisis>,
  disclaimer: string,
): Conversation {
  return {
    conversationId: conversacion.id,
    patientId: conversacion.patientId,
    createdAt: conversacion.createdAt.toISOString(),
    turns: turnos.map((turno) => leerTurno(turno, turnos, registros, disclaimer)),
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
  return aConversation(conversacion, [], new Map(), dependencias.config.aiDisclaimerText);
}

async function leerConversacionConTurnos(
  dependencias: Dependencias,
  conversationId: string,
): Promise<Conversation> {
  const conversacion = await leerConversacionExistente(dependencias, conversationId);
  const turnos = await dependencias.conversaciones.listarTurnos(conversationId);
  const ids = [...new Set(turnos.flatMap((t) => (t.analysisId === null ? [] : [t.analysisId])))];
  const registros = await dependencias.conversaciones.leerRegistros(ids);
  return aConversation(conversacion, turnos, registros, dependencias.config.aiDisclaimerText);
}

/** Lo que el turno envía a Backend 2 y lo que Backend 1 conserva de ello para derivar `dataUsed` y `dataMissing`. */
interface TurnoPreparado {
  request: ChatTurnRequest;
  hechos: HechosDelCaso;
  faltantes: readonly ChatCompletenessItem[];
  dataRefs: MapaDeDataRefs;
  clasificacion: DataClassification;
}

/**
 * RN-11: la pregunta y el contexto del caso salen enmascarados con el desidentificador de ADR-40, con un seudónimo
 * nuevo por turno. Es el único punto donde algo de la conversación se prepara para la IA; solo enmascara.
 */
function desidentificarContexto(
  { desidentificador }: Dependencias,
  conversacion: Conversacion,
  entrada: {
    traceId: string;
    question: string;
    contexto: ContextoPermitido;
    dataOrigin: DataClassification;
  },
): Promise<SalidaDeDesidentificacion> {
  return desidentificador.desidentificar({
    traceId: entrada.traceId,
    patientId: conversacion.patientId,
    contexto: entrada.contexto,
    query: entrada.question,
    dataOrigin: entrada.dataOrigin,
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
  const { contexto, dataRefs } = construirContextoDelChat(caso, reloj.now(), claves);
  const clasificacion = clasificacionDelPaciente(caso.paciente);
  const { clinicalContext, query } = await desidentificarContexto(dependencias, conversacion, {
    traceId: solicitud.traceId,
    question: solicitud.peticion.question,
    contexto,
    dataOrigin: clasificacion,
  });
  const hechos = construirHechosDelCaso(clinicalContext, dataRefs);
  const activo = analisisActivo(previos);
  return {
    hechos,
    faltantes: items,
    dataRefs,
    clasificacion,
    request: {
      threadId: conversacion.threadId,
      pseudoPatientId: clinicalContext.pseudoPatientId,
      traceId: solicitud.traceId,
      question: query,
      dataClassification: clasificacion,
      catalogVersion: catalogo.version(),
      clinicalContext,
      caseFacts: hechos.caseFacts,
      completeness: [...items],
      // Solo enruta el turno en Backend 2: el id es de Backend 1, que es su único dueño (RN-10).
      ...(activo !== null && { activeAnalysisId: activo }),
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
  if (primera.ok || !esHiloDesconocido(primera) || previos.length === 0) return primera;
  return consultar(dependencias, {
    ...request,
    rehydration: construirRehidratacion(previos, dependencias.config.chatRehydrateTurns),
  });
}

/** Lo que se persiste de un turno: la fila, su estado derivado y, si el turno es de evidencia, el registro del análisis. */
interface TurnoArmado {
  turno: TurnoNuevo;
  estado: EstadoDelTurno;
  registro?: RegistroDeAnalisis;
}

/** `RagQueryInternalRequest` equivalente al turno de evidencia: lo que la Base y el registro dicen que se consultó. */
function consultaEquivalente(
  preparado: TurnoPreparado,
  maxOpciones: number,
  traceId: string,
): RagQueryInternalRequest {
  return {
    traceId,
    query: preparado.request.question,
    sourcesSelected: { guias: true, ensayos: true, publicaciones: true },
    dataClassification: preparado.clasificacion,
    catalogVersion: preparado.request.catalogVersion,
    maxOptions: maxOpciones,
    // El chat no tiene filtros ni año mínimo: toda la evidencia vigente del corpus (igual que en Backend 2).
    filtersApplied: {
      historiaCompleta: false,
      soloBiomarcadoresRelevantes: false,
      ultimosSeisMeses: false,
      antecedentesFamiliares: false,
      publishedFromYear: null,
    },
    clinicalContext: preparado.request.clinicalContext,
  };
}

/** El `AIAnalysisRecord` del turno de evidencia, con el contenido trazable del gateway (AC-T1.4). */
function armarRegistroDelTurno(
  { base, idsDeAnalisis, reloj, config }: Dependencias,
  solicitud: SolicitudDeTurno,
  preparado: TurnoPreparado,
  caso: CasoClinico,
  evidencia: RagQueryInternalResponse,
): RegistroDeAnalisis {
  if (caso.episodioId === null) throw new FalloDePersistenciaError();
  const request = consultaEquivalente(preparado, config.maxOpciones, solicitud.traceId);
  return armarRegistro({
    id: idsDeAnalisis(),
    creadoEn: reloj.now(),
    traceId: solicitud.traceId,
    patientId: caso.paciente.id,
    episodeId: caso.episodioId,
    userId: solicitud.userId,
    questionTemplateId: null,
    continueWithWarning: false,
    request,
    dataRefs: preparado.dataRefs,
    respuesta: evidencia,
    base: base.construir(request, evidencia, false),
    topRelevanceScore: topRelevanceScorePersistible(evidencia),
  });
}

type CuerpoDelChat = NonNullable<ReturnType<typeof validarCuerpoDelChat>>;

/** La respuesta de Backend 2 validada y coherente con el estado de la conversación; `null` si no lo es. */
function validarCuerpoDelChat(
  cuerpoDeRag: unknown,
  preparado: TurnoPreparado,
  activo: string | null,
) {
  const validada = zChatTurnResponseRefinado.safeParse(cuerpoDeRag);
  if (!validada.success) return null;
  const cuerpo = validada.data;
  const enlaces = enlacesDelTurno(cuerpo.blocks, preparado.hechos.enlaces);
  if (!enlaces.ok) return null;
  // Un seguimiento exige un análisis activo y no crea otro: ante lo contrario, Backend 2 respondió algo incoherente.
  const incoherente =
    cuerpo.subintent === 'seguimiento_evidencia' &&
    (activo === null || cuerpo.evidenceAnalysis !== undefined);
  return incoherente ? null : { cuerpo, enlaces: enlaces.enlaces };
}

/** El registro del análisis si el turno trae `evidenceAnalysis`; `null` si el análisis es incoherente (RN-02). */
function registroDelTurno(
  dependencias: Dependencias,
  solicitud: SolicitudDeTurno,
  preparado: TurnoPreparado,
  caso: CasoClinico,
  evidencia: RagQueryInternalResponse | undefined,
): RegistroDeAnalisis | undefined | null {
  if (evidencia === undefined) return undefined;
  try {
    return armarRegistroDelTurno(dependencias, solicitud, preparado, caso, evidencia);
  } catch (error) {
    if (error instanceof RespuestaInternaInvalidaError) return null;
    throw error;
  }
}

function filaDelTurno(
  dependencias: Dependencias,
  solicitud: SolicitudDeTurno,
  preparado: TurnoPreparado,
  { cuerpo, enlaces }: Pick<CuerpoDelChat, 'cuerpo'> & { enlaces: ConversationDataLink[] },
  analysisId: string | null,
): TurnoNuevo {
  const meta = cuerpo.evidenceAnalysis?.meta;
  return {
    id: dependencias.idsDeTurnos(),
    conversationId: solicitud.conversationId,
    questionMasked: preparado.request.question,
    intent: cuerpo.intent,
    aboutTurnId: solicitud.peticion.aboutTurnId ?? null,
    blocks: cuerpo.blocks,
    dataLinks: enlaces,
    omittedClaims: cuerpo.omittedClaims,
    notices: cuerpo.notices,
    dataUsed: etiquetasDeHechosUsados(preparado.hechos.caseFacts),
    dataMissing: etiquetasDeFaltantes(preparado.faltantes),
    analysisId,
    structuredState: cuerpo.structuredState,
    llmProvider: cuerpo.llmProvider,
    llmModel: meta?.llmModel ?? null,
    promptVersion: meta?.promptVersion ?? null,
    traceId: solicitud.traceId,
    createdAt: dependencias.reloj.now(),
  };
}

/**
 * El turno a persistir desde la respuesta de Backend 2; `null` si no cumple el contrato, cita un `factRef` que no se envió
 * o es incoherente, o el fallo ya traducido (proveedor no permitido, RN-12).
 */
function armarTurno(
  dependencias: Dependencias,
  solicitud: SolicitudDeTurno,
  preparado: TurnoPreparado,
  caso: CasoClinico,
  previos: readonly TurnoDeConversacion[],
  cuerpoDeRag: unknown,
): TurnoArmado | RespuestaDeFallo | null {
  const activo = analisisActivo(previos);
  const validado = validarCuerpoDelChat(cuerpoDeRag, preparado, activo);
  if (validado === null) return null;
  const evidencia = validado.cuerpo.evidenceAnalysis;
  if (
    evidencia !== undefined &&
    !proveedorPermitido(preparado.clasificacion, evidencia.meta.llmProvider)
  ) {
    return PROVEEDOR_NO_PERMITIDO;
  }
  const registro = registroDelTurno(dependencias, solicitud, preparado, caso, evidencia);
  if (registro === null) return null;
  const esSeguimiento = validado.cuerpo.subintent === 'seguimiento_evidencia';
  const estado = esSeguimiento
    ? estadoDelSeguimiento(validado.cuerpo.structuredState)
    : derivarEstadoDelTurno(validado.cuerpo.intent, evidencia);
  const analysisId = registro?.id ?? (esSeguimiento ? activo : null);
  return {
    estado,
    ...(registro !== undefined && { registro }),
    turno: filaDelTurno(dependencias, solicitud, preparado, validado, analysisId),
  };
}

/**
 * RN-06: el turno (y, si es de evidencia, su `AIAnalysisRecord`) se persiste ANTES de responder, en una sola
 * transacción, y la respuesta sale de las filas leídas, nunca de lo armado en memoria.
 */
async function persistirTurnoAntesDeResponder(
  { conversaciones, config }: Dependencias,
  armado: TurnoArmado,
): Promise<ConversationTurn> {
  try {
    if (armado.registro === undefined) {
      const turno = await conversaciones.insertarTurno(armado.turno);
      return aConversationTurn(turno, armado.estado);
    }
    const { registro, turno } = await conversaciones.insertarTurnoDeEvidencia(
      armado.registro,
      armado.turno,
    );
    return aConversationTurn(
      turno,
      armado.estado,
      aEvidenceAnalysis(registro, config.aiDisclaimerText),
    );
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
  const armado = armarTurno(dependencias, solicitud, preparado, caso, previos, respuesta.cuerpo);
  if (armado === null) return { tipo: 'fallo', respuesta: RESPUESTA_INTERNA_INVALIDA };
  if ('codigo' in armado) return { tipo: 'fallo', respuesta: armado };
  return { tipo: 'creado', cuerpo: await persistirTurnoAntesDeResponder(dependencias, armado) };
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
