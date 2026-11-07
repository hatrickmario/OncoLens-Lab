import type { ChatBlock } from '../../../../packages/api-contracts/src/types/clinical-api';

export interface CitaNumeradaDelBloque {
  numero: number;
  cita: NonNullable<ChatBlock['citations']>[number];
}

/**
 * Numera `[E1]`, `[E2]`… las citas de todos los bloques del turno en el orden en que salen; devuelve las de cada bloque
 * por su posición. Las citas salen solo de `blocks[].citations` (no hay `citationIds` en el turno, glosario §3).
 */
export function numerarCitas(bloques: readonly ChatBlock[]): CitaNumeradaDelBloque[][] {
  let siguiente = 1;
  return bloques.map((bloque) =>
    (bloque.citations ?? []).map((cita) => ({ numero: siguiente++, cita })),
  );
}
