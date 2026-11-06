import type {
  Conversation,
  ConversationTurn,
} from '../../../../../../packages/api-contracts/src/client/clinical-api/index.js';
import type { Clock } from '../../../infrastructure/clock.js';
import type { GeneradorDeIds } from '../../../infrastructure/ids.js';
import type { CasoRepository } from '../evidence-analysis.repository.js';
import type {
  CatalogVersionProvider,
  ChatTurnPort,
  ChecklistDelChat,
  ContextDeidentifier,
  RespuestaDeFallo,
} from '../ports.js';
import type {
  Conversacion,
  ConversationRepository,
  TurnoDeConversacion,
} from './conversation.repository.js';
import { derivarEstadoDelTurno, type EstadoDelTurno } from './conversation.reglas.js';
import type { PeticionDeTurno } from './conversation.schema.js';

/** La conversación (o el paciente al que se ancla) no existe (`404`). */
export class ConversacionNoEncontradaError extends Error {
  constructor() {
    super('Conversación no encontrada');
    this.name = 'ConversacionNoEncontradaError';
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
    turns: turnos.map(aConversationTurn),
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
    crearTurno: () => Promise.reject(new Error('no implementado')),
  };
}
