import type { ChatBlock } from '../../../../packages/api-contracts/src/types/clinical-api';

/** Cómo se rotula un bloque: el tipo de información que contiene, nunca solo por color (glosario §3). */
export type GrupoDeBloque = 'clinico' | 'evidencia' | 'interpretacion' | 'alcance' | 'adicional';

const GRUPOS: Readonly<Record<ChatBlock['kind'], GrupoDeBloque>> = {
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
  return Object.hasOwn(GRUPOS, kind) ? GRUPOS[kind as ChatBlock['kind']] : 'adicional';
}
