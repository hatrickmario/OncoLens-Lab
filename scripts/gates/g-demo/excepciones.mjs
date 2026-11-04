/**
 * Excepciones y capacidades diferidas declaradas (US-142 AC-4, AC-5; design D6). Datos versionados en
 * `docs/gates/g-demo-excepciones.json`: `{id, tipo?, descripcion, feature, destino, motivo}`.
 * Una excepción sin Feature o sin destino hace fallar la verificación; ninguna cuenta como fallo por sí misma.
 */
export const TIPO_SE_MIDE_EN_EL_PILOTO = 'se_mide_en_el_piloto';
export const ESTADO_SE_MIDE_EN_EL_PILOTO = 'se mide en el piloto';

const tieneTexto = (valor) => typeof valor === 'string' && valor.trim() !== '';

export function cargarExcepciones(json) {
  if (!Array.isArray(json)) throw new Error('g-demo-excepciones.json debe ser una lista');
  const incompletas = json
    .filter((e) => !tieneTexto(e?.feature) || !tieneTexto(e?.destino))
    .map((e) => String(e?.id ?? '(sin id)'));
  return { excepciones: json, incompletas };
}

/** Lo que solo se mide en el piloto (US-139, DEC-14, VM-1, VM-2, VM-4, VM-5): se declara, no se cuenta como fallo. */
export function declararValidacionClinica({ excepciones }) {
  return excepciones
    .filter((e) => e.tipo === TIPO_SE_MIDE_EN_EL_PILOTO)
    .map((e) => ({ ...e, estado: ESTADO_SE_MIDE_EN_EL_PILOTO }));
}

/** Las demás: capacidades diferidas por el slicing y AC que se verifican en G-Piloto. */
export function excepcionesDeCapacidad({ excepciones }) {
  return excepciones.filter((e) => e.tipo !== TIPO_SE_MIDE_EN_EL_PILOTO);
}
