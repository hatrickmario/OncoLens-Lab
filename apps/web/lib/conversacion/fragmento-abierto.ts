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

export function fragmentoDeFuente(_fuente: CitedSource): FragmentoAbierto {
  throw new Error('no implementado');
}

export function fragmentoDeCitaDelChat(
  _cita: ChatCitation,
  _fuentes: readonly CitedSource[],
): FragmentoAbierto {
  throw new Error('no implementado');
}
