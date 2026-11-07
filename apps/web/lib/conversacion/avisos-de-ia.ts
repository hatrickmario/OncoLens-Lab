import type { ConversationTurn } from '../../../../packages/api-contracts/src/types/clinical-api';

/**
 * Bloques que el código de Backend 1 y 2 arma sin LLM (exentos de los avisos de IA). La lista es de los DETERMINISTAS
 * conocidos y no de los generados: un `kind` nuevo o desconocido cuenta como generado y exige avisos (RN-19 falla
 * cerrado). `conflicto` es determinista (L1D-319).
 */
const DETERMINISTAS = new Set(['catalogo', 'conflicto', 'faltante', 'fuente', 'limitacion']);

/** Mensajes del sistema: Backend 2 los emite con `notices = []`, sin contenido generado. */
const INTENCIONES_DEL_SISTEMA = new Set(['fuera_de_alcance', 'no_clasificada']);

/** RN-19: un turno con contenido generado y sin avisos del backend no se pinta como válido. */
export function faltanAvisosDeIA(
  turno: Pick<ConversationTurn, 'intent' | 'blocks' | 'notices'>,
): boolean {
  if (turno.notices.length > 0 || INTENCIONES_DEL_SISTEMA.has(turno.intent)) return false;
  return turno.blocks.some((bloque) => !DETERMINISTAS.has(bloque.kind));
}
