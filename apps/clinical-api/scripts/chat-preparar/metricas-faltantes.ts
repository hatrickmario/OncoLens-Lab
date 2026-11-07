import type { TipoDeVacio } from './casos.js';

/** Métricas de faltantes de un paciente sembrado (M-04.1, M-04.2 y exactitud de `gapType`, US-269 AC-4). */
export interface MetricasDeFaltantes {
  esperados: number;
  sensibilidad: number | null;
  especificidad: number | null;
  gapType: { correctos: number; total: number };
}

/** Un ítem del `completeness[]` que `clinical-api` envía a `/chat/turn` (solo lo que la medición lee). */
export interface ItemEnviado {
  item: string;
  status: string;
  gapType: string | null;
}

export interface FaltanteEsperado {
  item: string;
  gap_type: TipoDeVacio;
}

/** Razón `parte / total`; sin muestra es `null`, nunca `0` (un `0` diría que el sistema falló). */
const razon = (parte: number, total: number): number | null => (total === 0 ? null : parte / total);

/**
 * M-04.1 (sensibilidad: los faltantes sembrados que el checklist reporta con vacío), M-04.2 (especificidad: los ítems no
 * sembrados, aplicables, que el checklist no reporta) y la exactitud de `gapType` (el tipo exacto de cada faltante
 * sembrado). Un ítem sembrado ausente del checklist cuenta como no detectado.
 */
export function medirFaltantes(
  esperados: readonly FaltanteEsperado[],
  enviados: readonly ItemEnviado[],
): MetricasDeFaltantes {
  const tipoEnviado = new Map(enviados.map((item) => [item.item, item.gapType]));
  const clavesEsperadas = new Set(esperados.map((e) => e.item));
  const detectados = esperados.filter((e) => tipoEnviado.get(e.item) != null).length;
  const exactos = esperados.filter((e) => tipoEnviado.get(e.item) === e.gap_type).length;
  const noSembrados = enviados.filter(
    (item) => !clavesEsperadas.has(item.item) && item.status !== 'no_aplica',
  );
  const sinVacio = noSembrados.filter((item) => item.gapType === null).length;
  return {
    esperados: esperados.length,
    sensibilidad: razon(detectados, esperados.length),
    especificidad: razon(sinVacio, noSembrados.length),
    gapType: { correctos: exactos, total: esperados.length },
  };
}
