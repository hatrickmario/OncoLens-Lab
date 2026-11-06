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
import type { ConversationRepository } from './conversation.repository.js';
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
 * Conversación del oncólogo sobre un paciente (L1D-315, ADR-51): abre la conversación con un `thread_id` aleatorio y,
 * en cada turno, enmascara la pregunta, desidentifica el contexto con seudónimo nuevo, consulta a `/chat/turn` y
 * persiste el turno ANTES de responder (RN-06). Los puertos llegan por la factory.
 */
export function crearConversationService(
  dependencias: DependenciasDeLaConversacion,
): ConversationService {
  void dependencias;
  return {
    abrir: () => Promise.reject(new Error('no implementado')),
    leer: () => Promise.reject(new Error('no implementado')),
    crearTurno: () => Promise.reject(new Error('no implementado')),
  };
}
