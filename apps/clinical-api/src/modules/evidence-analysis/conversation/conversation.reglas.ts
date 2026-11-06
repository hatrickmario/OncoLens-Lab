import type {
  ChatBlock,
  ConversationDataLink,
} from '../../../../../../packages/api-contracts/src/client/clinical-api/index.js';
import type {
  CaseFact,
  ChatCompletenessItem,
  ChatIntent,
  ChatRehydration,
  RagQueryInternalResponse,
} from '../../../../../../packages/api-contracts/src/client/rag-orchestrator/index.js';
import type { TurnoDeConversacion } from './conversation.repository.js';
import type { EnlaceDelHecho } from './hechos-del-caso.js';

/** Lo que Backend 1 deriva del resultado de evidencia del turno (glosario S6 §2): nunca lo recibe de Backend 2. */
export interface EstadoDelTurno {
  status: 'respondido' | 'sin_evidencia' | 'no_clasificada';
  topRelevanceScore: number | null;
}

/** `rehydration` del PRIMER turno y de todo hilo sin turnos: sin turnos y con el estado estructurado vacío. */
export function rehidratacionVacia(): ChatRehydration {
  throw new Error('no implementado');
}

/**
 * Lista blanca de lo que viaja a Backend 2 al rehidratar un hilo (RN-11, ADR-51 §4): los últimos `limite` turnos con solo
 * `{question, intent, blocksText, factRefs}` y el estado estructurado del último. Nunca UUID, fechas absolutas,
 * `analysisId`, `dataLinks` ni `createdAt`.
 */
export function construirRehidratacion(
  turnos: readonly TurnoDeConversacion[],
  limite: number,
): ChatRehydration {
  void turnos;
  void limite;
  throw new Error('no implementado');
}

/** `status` y `topRelevanceScore` del turno: con `evidenceAnalysis` los suyos (`null` no es `0.0`, RN-02). */
export function derivarEstadoDelTurno(
  intent: ChatIntent,
  evidencia: RagQueryInternalResponse | undefined,
): EstadoDelTurno {
  void intent;
  void evidencia;
  throw new Error('no implementado');
}

/** `activeAnalysisId`: el `analysisId` del turno más reciente que lo tenga; `null` si ninguno. */
export function analisisActivo(turnos: readonly TurnoDeConversacion[]): string | null {
  void turnos;
  throw new Error('no implementado');
}

/** Etiquetas de los hechos del caso enviados en el turno (`dataUsed`). */
export function etiquetasDeHechosUsados(hechos: readonly CaseFact[]): string[] {
  void hechos;
  throw new Error('no implementado');
}

/** Etiquetas de los ítems enviados con un tipo de faltante (`dataMissing`). */
export function etiquetasDeFaltantes(items: readonly ChatCompletenessItem[]): string[] {
  void items;
  throw new Error('no implementado');
}

export type ResolucionDeEnlaces =
  { ok: true; enlaces: ConversationDataLink[] } | { ok: false; factRefSinResolver: string };

/** Un enlace por `factRef` distinto de los bloques, en orden de aparición; un `factRef` que el turno no envió no se resuelve. */
export function enlacesDelTurno(
  bloques: readonly ChatBlock[],
  hechos: ReadonlyMap<string, EnlaceDelHecho>,
): ResolucionDeEnlaces {
  void bloques;
  void hechos;
  throw new Error('no implementado');
}
