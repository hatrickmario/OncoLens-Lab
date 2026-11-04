/**
 * Único dueño del veredicto de G-Demo (design D3). Recibe las comprobaciones ya evaluadas por los demás módulos y devuelve
 * `superado | no_superado | regresion_fingida` con sus motivos. Solo el modo real con todo en verde declara G-Demo; el
 * fingido es regresión del recorrido. Las métricas no medidas (salvo las obligatorias), las excepciones declaradas, la
 * validación clínica y el p95 fuera de meta NUNCA son motivo de fallo.
 */
import { textoDeMeta } from './metricas.mjs';

export const MODOS = ['fingido', 'real'];

export const RESULTADOS = {
  SUPERADO: 'superado',
  NO_SUPERADO: 'no_superado',
  REGRESION_FINGIDA: 'regresion_fingida',
};

/** Esqueleto (L1D-248). */
export function rutaDelRegistro(_resultado, _modo, _fecha) {
  throw new Error('no implementado');
}

/** Esqueleto (L1D-248). */
export function codigoDeSalida(_resultado) {
  throw new Error('no implementado');
}

const TITULO_SUPERADO = 'G-Demo superado';
const TITULO_REGRESION =
  'Regresión del recorrido en verde (modo fingido); G-Demo se declara solo en modo real';

function motivosDeMetricas(metricas) {
  return metricas.flatMap((m) => {
    if (m.estado === 'fuera_de_meta')
      return [`${m.id} fuera de meta (valor ${m.valor}, meta ${textoDeMeta(m.meta)})`];
    if (m.estado === 'no_medida' && m.obligatoria) return [`${m.id} no medida`];
    return [];
  });
}

function motivosDeLasComprobaciones({
  e2e,
  reporte,
  metricas,
  soloSintetico,
  excepciones,
  procedencia,
}) {
  return [
    ...(e2e.ok ? [] : [`paso fallido: ${e2e.pasoFallido ?? 'recorrido E2E sin resultado'}`]),
    ...(reporte.ok ? [] : [reporte.motivo]),
    ...(reporte.ok ? motivosDeMetricas(metricas) : []),
    ...(soloSintetico.ok ? [] : soloSintetico.motivos),
    ...excepciones.incompletas.map((id) => `excepción sin destino: ${id}`),
    ...(procedencia.faltantes.length > 0 ? ['procedencia incompleta'] : []),
  ];
}

export function decidirResultado(comprobaciones, modo) {
  if (!MODOS.includes(modo)) throw new Error(`modo desconocido: ${modo}`);
  const motivos = motivosDeLasComprobaciones(comprobaciones);
  if (motivos.length > 0) {
    return {
      resultado: 'no_superado',
      titulo: `G-Demo no superado: ${motivos.join('; ')}`,
      motivos,
    };
  }
  return modo === 'real'
    ? { resultado: 'superado', titulo: TITULO_SUPERADO, motivos }
    : { resultado: 'regresion_fingida', titulo: TITULO_REGRESION, motivos };
}
