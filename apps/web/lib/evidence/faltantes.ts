import type {
  CompletenessItem,
  CompletenessView,
} from '../../../../packages/api-contracts/src/types/clinical-api';
import { hrefDeVistaDeCaso } from '../ficha/anclas';
import { DESTINO_DE_REGISTRO, type TipoDeAccionManual } from '../registro-manual/destinos';
import { claveDeItem } from '../registro-manual/enlaces';
import { mensajes } from '../mensajes';

/** Resultado de leer el checklist: el panel nunca ve una excepción, solo estos tres casos. */
export type LecturaDelChecklist =
  | {
      tipo: 'ok';
      cancerTypeEnabled: boolean;
      catalogVersion: string;
      /** Todos los ítems en el orden del servidor: los lee la columna «Datos críticos» (D2). */
      items: CompletenessItem[];
      /** Solo los `faltante`: los lee el aviso del panel. */
      faltantes: CompletenessItem[];
    }
  | { tipo: 'no_disponible' }
  | { tipo: 'sin_sesion' };

/** `faltantes` solo con los ítems `faltante`: los `presente_sin_verificar` y `no_aplica` no lo son (D3). */
export function lecturaDeLaVista(vista: CompletenessView): LecturaDelChecklist {
  return {
    tipo: 'ok',
    cancerTypeEnabled: vista.cancerTypeEnabled,
    catalogVersion: vista.catalogVersion,
    items: vista.items,
    faltantes: vista.items.filter((item) => item.status === 'faltante'),
  };
}

/** Todo faltante lleva a la columna «Datos críticos» de la vista de caso, donde está su acción manual (D9). */
export function hrefDeColumnaDatosCriticos(patientId: string): string {
  return hrefDeVistaDeCaso(patientId, 'datos-criticos');
}

export interface AccionManual {
  tipo: TipoDeAccionManual;
  /** Clave del catálogo del ítem (`ki67`): lo único que viaja en `?item=`. */
  item: string;
}

/**
 * Única acción manual de un faltante según `destination.entity` (D3, D-7): el catálogo `DESTINO_DE_REGISTRO` la
 * decide y ninguna entidad devuelve «cargar documento» (OCR, Post-MVP). Entidad desconocida o clave fuera del catálogo
 * → sin acción: la fila se muestra igual.
 */
export function accionManualDe(item: CompletenessItem): AccionManual | null {
  const destino = Object.hasOwn(DESTINO_DE_REGISTRO, item.destination.entity)
    ? DESTINO_DE_REGISTRO[item.destination.entity]
    : undefined;
  const clave = claveDeItem(item.item);
  return destino === undefined || clave === undefined ? null : { tipo: destino.tipo, item: clave };
}

const SIMBOLOS: Record<CompletenessItem['status'], string> = {
  presente_verificado: '✓',
  presente_sin_verificar: '◐',
  faltante: '◌',
  no_aplica: '·',
};

/** Símbolo y palabra de cada estado (D7): el símbolo es decorativo, la palabra lleva el significado; «Faltante» es neutro. */
export function presentarEstado(estado: CompletenessItem['status']): {
  simbolo: string;
  texto: string;
} {
  return { simbolo: SIMBOLOS[estado], texto: mensajes().datosCriticos.estado[estado] };
}

/**
 * `continueWithWarning` de la solicitud: verdadero con ≥1 faltante o con el checklist caído; falso si no hubo (D1).
 * Coincide con los casos en que el panel muestra un aviso con resumen.
 */
export function debeContinuarConAviso(lectura: LecturaDelChecklist): boolean {
  if (lectura.tipo === 'no_disponible') return true;
  return lectura.tipo === 'ok' && lectura.faltantes.length > 0;
}
