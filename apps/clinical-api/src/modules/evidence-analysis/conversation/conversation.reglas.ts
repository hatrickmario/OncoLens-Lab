import type {
  ChatBlock,
  ConversationDataLink,
} from '../../../../../../packages/api-contracts/src/client/clinical-api/index.js';
import type {
  ChatCompletenessItem,
  ChatIntent,
  ChatRehydration,
  RagQueryInternalResponse,
  StructuredState,
} from '../../../../../../packages/api-contracts/src/client/rag-orchestrator/index.js';
import type { RegistroDeAnalisis } from '../analysis-record.js';
import type { TurnoDeConversacion } from './conversation.repository.js';
import type { ClaseDeHecho, EnlaceDelHecho } from './hechos-del-caso.js';

/** Lo que Backend 1 deriva del resultado de evidencia del turno (glosario S6 §2): nunca lo recibe de Backend 2. */
export interface EstadoDelTurno {
  status: 'respondido' | 'sin_evidencia' | 'no_clasificada';
  topRelevanceScore: number | null;
}

/** `rehydration` del PRIMER turno y de todo hilo sin turnos: sin turnos y con el estado estructurado vacío. */
export function rehidratacionVacia(): ChatRehydration {
  return {
    turns: [],
    structuredState: {
      intentsVistos: [],
      preguntasPrevias: [],
      opcionesMostradas: [],
      citasMostradas: [],
      faltantesSenalados: [],
    },
  };
}

/** `factRef` de los bloques de un turno, sin repetir y en orden de aparición. */
function factRefsDe(bloques: readonly ChatBlock[]): string[] {
  return [...new Set(bloques.flatMap((bloque) => bloque.factRefs ?? []))];
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
  const ultimo = turnos.at(-1);
  if (ultimo === undefined) return rehidratacionVacia();
  return {
    turns: (limite <= 0 ? [] : turnos.slice(-limite)).map((turno) => ({
      question: turno.questionMasked,
      intent: turno.intent,
      blocksText: turno.blocks.map((bloque) => bloque.text),
      factRefs: factRefsDe(turno.blocks),
    })),
    structuredState: ultimo.structuredState,
  };
}

/** `status` y `topRelevanceScore` del turno: con `evidenceAnalysis` los suyos (`null` no es `0.0`, RN-02). */
export function derivarEstadoDelTurno(
  intent: ChatIntent,
  evidencia: RagQueryInternalResponse | undefined,
): EstadoDelTurno {
  if (evidencia !== undefined) {
    return {
      status: evidencia.status === 'sin_evidencia' ? 'sin_evidencia' : 'respondido',
      topRelevanceScore: evidencia.topRelevanceScore,
    };
  }
  return {
    status: intent === 'no_clasificada' ? 'no_clasificada' : 'respondido',
    topRelevanceScore: null,
  };
}

/**
 * Estado de un turno de seguimiento (sin `evidenceAnalysis`): el puntaje es el de `ultimaEvidencia` del estado estructurado
 * que devolvió Backend 2; `null` (nada sobre el umbral) es `sin_evidencia`, nunca `0.0` (RN-02).
 */
export function estadoDelSeguimiento(estructurado: StructuredState): EstadoDelTurno {
  const puntaje = estructurado.ultimaEvidencia?.topRelevanceScore ?? null;
  return { status: puntaje === null ? 'sin_evidencia' : 'respondido', topRelevanceScore: puntaje };
}

/**
 * El turno que creó el análisis es el que comparte `trace_id` con su registro (el registro se arma con el `traceId` del
 * turno); los demás turnos que lo referencian son seguimientos. No depende de la identidad del objeto ni del orden.
 */
export function creoElAnalisis(
  registro: Pick<RegistroDeAnalisis, 'traceId'> | undefined,
  turno: Pick<TurnoDeConversacion, 'traceId'>,
): boolean {
  return registro !== undefined && registro.traceId === turno.traceId;
}

/** `activeAnalysisId`: el `analysisId` del turno más reciente que lo tenga; `null` si ninguno. */
export function analisisActivo(turnos: readonly TurnoDeConversacion[]): string | null {
  return turnos.findLast((turno) => turno.analysisId !== null)?.analysisId ?? null;
}

const ETIQUETA_POR_CLASE: Readonly<Record<ClaseDeHecho, string>> = {
  diagnostico: 'Diagnóstico',
  biomarcador: 'Biomarcador',
  atributo: 'Atributo clínico',
  tratamiento: 'Tratamiento previo',
  evento: 'Evento clínico',
};

/** Etiquetas de los hechos del caso enviados en el turno (`dataUsed`): la clase del hecho, en español. */
export function etiquetasDeHechosUsados(hechos: readonly { kind: ClaseDeHecho }[]): string[] {
  return hechos.map((hecho) => ETIQUETA_POR_CLASE[hecho.kind]);
}

/** Etiquetas de los ítems enviados con un tipo de faltante (`dataMissing`). */
export function etiquetasDeFaltantes(items: readonly ChatCompletenessItem[]): string[] {
  return items.filter((item) => item.gapType !== null).map((item) => item.label);
}

export type ResolucionDeEnlaces =
  { ok: true; enlaces: ConversationDataLink[] } | { ok: false; factRefSinResolver: string };

/** Un dato sin fecha confiable (`null`) va al final y nunca se trata como el día `0`. */
const claveDeDia = (dia: number | null): number => (dia === null ? Number.POSITIVE_INFINITY : dia);

/**
 * Orden de presentación de los enlaces (US-260, AC-02.4): día relativo ascendente, sin fecha al final y, a igual día,
 * el orden de aparición en los bloques. Regla pura: nunca se confía en el orden que devuelve el LLM.
 */
export function ordenarPorDiaRelativo(
  enlaces: readonly ConversationDataLink[],
): ConversationDataLink[] {
  return enlaces
    .map((enlace, posicion) => ({ enlace, posicion }))
    .sort(
      (a, b) =>
        claveDeDia(a.enlace.relativeDay) - claveDeDia(b.enlace.relativeDay) ||
        a.posicion - b.posicion,
    )
    .map(({ enlace }) => enlace);
}

/** Un enlace por `factRef` distinto de los bloques, ordenados por día relativo; un `factRef` que el turno no envió no se resuelve. */
export function enlacesDelTurno(
  bloques: readonly ChatBlock[],
  hechos: ReadonlyMap<string, EnlaceDelHecho>,
): ResolucionDeEnlaces {
  const enlaces: ConversationDataLink[] = [];
  for (const factRef of factRefsDe(bloques)) {
    const hecho = hechos.get(factRef);
    if (hecho === undefined) return { ok: false, factRefSinResolver: factRef };
    enlaces.push({ factRef, ...hecho });
  }
  return { ok: true, enlaces: ordenarPorDiaRelativo(enlaces) };
}
