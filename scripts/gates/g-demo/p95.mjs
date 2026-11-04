/**
 * p95 de `POST /platform/evidence-analyses` frente a G-5 (US-142 AC-7, design D5). Nunca bloquea: fuera de meta es insumo
 * de ADR-42. La meta llega de `metas-iniciales.yaml` (RN-22); aquí no hay literal. Tiene la misma forma de meta que las
 * métricas (`meta: {maximo}`) y el mismo vocabulario de estados.
 */
import { ESTADOS } from './metricas.mjs';
import { MODO } from './resultado.mjs';

/** El modo fingido no mide el p95: no hay modelos reales, aunque llegue un valor. */
export function evaluarP95(p95, { clave, maximo }, modo) {
  const base = { clave, meta: { maximo }, motivos: [] };
  if (modo === MODO.FINGIDO) {
    return {
      ...base,
      valor: null,
      estado: ESTADOS.NO_MEDIDA,
      motivo: 'modo fingido: sin modelos reales',
    };
  }
  if (typeof p95 !== 'number' || !Number.isFinite(p95)) {
    return { ...base, valor: null, estado: ESTADOS.NO_MEDIDA, motivo: 'sin medición del baseline' };
  }
  const estado = p95 > maximo ? ESTADOS.INSUMO_ADR42 : ESTADOS.EN_META;
  return { ...base, valor: p95, estado, motivo: null };
}
