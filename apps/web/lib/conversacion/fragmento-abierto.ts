import type {
  ChatCitation,
  CitedSource,
} from '../../../../packages/api-contracts/src/types/clinical-api';

/** Lo que el panel lateral muestra de una cita: su texto, su título y, si el turno trae la fuente, sus metadatos. */
export interface FragmentoAbierto {
  texto: string;
  titulo: string;
  ordinal: { numero: number; total: number } | null;
  fuente: CitedSource | null;
}

/** Fragmento de una fuente citada por una opción del análisis: texto y metadatos son los del corpus (RN-04, RN-25). */
export function fragmentoDeFuente(fuente: CitedSource): FragmentoAbierto {
  return { texto: fuente.chunkTextSnapshot, titulo: fuente.title, ordinal: null, fuente };
}

/**
 * Fragmento de una cita de un bloque del chat. Sus metadatos salen de la fuente del análisis del mismo turno con el
 * mismo `chunkId`; sin ella, el panel conserva lo que la cita trae y dice «No disponible» (nunca inventa, RN-25).
 */
export function fragmentoDeCitaDelChat(
  cita: ChatCitation,
  fuentes: readonly CitedSource[],
): FragmentoAbierto {
  return {
    texto: cita.chunkTextSnapshot,
    titulo: cita.sourceTitle,
    ordinal: { numero: cita.chunkOrdinal, total: cita.chunkCount },
    fuente: fuentes.find((fuente) => fuente.chunkId === cita.chunkId) ?? null,
  };
}
