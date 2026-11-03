import type { FollowUpTurn } from '../../../../../packages/api-contracts/src/types/clinical-api';
import { mensajes, rellenar } from '../../mensajes';

export interface ContadorDeSeguimiento {
  usados: number;
  /** `null` en un análisis histórico sin `maxFollowUps`: se informa lo usado, sin total (RN-22). */
  total: number | null;
}

/**
 * Preguntas usadas = `turnNumber` del último turno (el servidor manda, no un conteo local); el total sale de
 * `analysisBasis.maxFollowUps`. Tras un `409` el límite está agotado: usados pasa a ser el total.
 */
export function contadorDeSeguimiento(
  turnos: readonly Pick<FollowUpTurn, 'turnNumber'>[],
  maxFollowUps: number | undefined,
  limiteAlcanzado = false,
): ContadorDeSeguimiento {
  const total = maxFollowUps ?? null;
  const ultimo = turnos.at(-1)?.turnNumber ?? 0;
  return { usados: limiteAlcanzado && total !== null ? total : ultimo, total };
}

export function textoDelContador({ usados, total }: ContadorDeSeguimiento): string {
  const { contadorConTotal, contadorSinTotal } = mensajes().followUp;
  return total === null
    ? rellenar(contadorSinTotal, { n: usados })
    : rellenar(contadorConTotal, { n: usados, max: total });
}
