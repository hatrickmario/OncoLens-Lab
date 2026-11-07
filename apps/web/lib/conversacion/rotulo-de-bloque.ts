import type { ConversationTurn } from '../../../../packages/api-contracts/src/types/clinical-api';

/** Cómo se rotula un bloque: el tipo de información que contiene, nunca solo por color (glosario §3). */
export type GrupoDeBloque = 'clinico' | 'evidencia' | 'interpretacion' | 'alcance' | 'adicional';

const GRUPOS: Readonly<Record<string, GrupoDeBloque>> = {
  documentado: 'clinico',
  catalogo: 'clinico',
  conflicto: 'clinico',
  faltante: 'clinico',
  interpretacion: 'interpretacion',
  evidencia: 'evidencia',
  fuente: 'evidencia',
  limitacion: 'alcance',
};

/** Un `kind` fuera del enum cerrado cae en `adicional`: se rotula genérico y su texto no se oculta. */
export function grupoDelBloque(kind: string): GrupoDeBloque {
  return Object.hasOwn(GRUPOS, kind) ? GRUPOS[kind]! : 'adicional';
}

/** Bloques que redacta el LLM: exigen los avisos de IA del turno (RN-19). Los deterministas están exentos. */
const GENERADOS = new Set(['documentado', 'interpretacion', 'evidencia']);
/** Mensajes del sistema: Backend 2 los emite con `notices = []`, sin contenido generado. */
const INTENCIONES_DEL_SISTEMA = new Set(['fuera_de_alcance', 'no_clasificada']);

/** RN-19: un turno con contenido generado y sin avisos del backend no se pinta como válido. */
export function faltanAvisosDeIA(
  turno: Pick<ConversationTurn, 'intent' | 'blocks' | 'notices'>,
): boolean {
  if (turno.notices.length > 0 || INTENCIONES_DEL_SISTEMA.has(turno.intent)) return false;
  return turno.blocks.some((bloque) => GENERADOS.has(bloque.kind));
}
