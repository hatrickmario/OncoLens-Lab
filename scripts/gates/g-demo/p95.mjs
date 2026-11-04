/**
 * p95 de `POST /platform/evidence-analyses` frente a G-5 (US-142 AC-7, design D5). Nunca bloquea: fuera de meta es insumo
 * de ADR-42. La meta llega de `metas-iniciales.yaml` (RN-22); aquí no hay literal.
 */
export function evaluarP95(p95, meta) {
  const base = { clave: meta.clave, meta: meta.maximo, valor: p95 ?? null };
  if (p95 === null || p95 === undefined || !Number.isFinite(p95)) return { ...base, estado: 'no_medido' };
  return { ...base, estado: p95 > meta.maximo ? 'insumo_adr42' : 'en_meta' };
}
