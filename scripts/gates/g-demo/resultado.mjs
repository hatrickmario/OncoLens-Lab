/**
 * Único dueño del veredicto de G-Demo (design D3). Cada comprobación llega ya evaluada por su módulo con `{motivos}`;
 * aquí solo se concatenan, en un orden fijo, y se decide `superado | no_superado | regresion_fingida`. Solo el modo real
 * con todo en verde declara G-Demo; el fingido es regresión del recorrido. Las métricas no medidas (salvo las
 * obligatorias), las excepciones declaradas, la validación clínica y el p95 fuera de meta NUNCA son motivo de fallo.
 * También son suyos el destino del registro y el código de salida, que dependen del resultado.
 */
export const MODO = { FINGIDO: 'fingido', REAL: 'real' };
export const MODOS = Object.values(MODO);

export const RESULTADOS = {
  SUPERADO: 'superado',
  NO_SUPERADO: 'no_superado',
  REGRESION_FINGIDA: 'regresion_fingida',
};

const TITULO_SUPERADO =
  'G-Demo superado (criterios técnicos del MVP sobre datos sintéticos; la utilidad clínica no se valida aquí)';
const TITULO_REGRESION =
  'Regresión del recorrido en verde (modo fingido); G-Demo se declara solo en modo real';

const ORDEN_DE_LAS_COMPROBACIONES = [
  'e2e',
  'reporte',
  'soloSintetico',
  'excepciones',
  'procedencia',
  'metricas',
];

export function decidirResultado(comprobaciones, modo) {
  if (!MODOS.includes(modo)) throw new Error(`modo desconocido: ${modo}`);
  const motivos = ORDEN_DE_LAS_COMPROBACIONES.flatMap(
    (nombre) => comprobaciones[nombre]?.motivos ?? [],
  );
  if (motivos.length > 0) {
    return {
      resultado: RESULTADOS.NO_SUPERADO,
      titulo: `G-Demo no superado: ${motivos.join('; ')}`,
      motivos,
    };
  }
  return modo === MODO.REAL
    ? { resultado: RESULTADOS.SUPERADO, titulo: TITULO_SUPERADO, motivos }
    : { resultado: RESULTADOS.REGRESION_FINGIDA, titulo: TITULO_REGRESION, motivos };
}

/** Solo el registro real superado se versiona en docs/gates; todo lo demás (fingido o no superado) va a reports/gates, ignorado. */
export function rutaDelRegistro(resultado, modo, fecha) {
  if (resultado === RESULTADOS.SUPERADO) return `docs/gates/G-Demo-${fecha}.md`;
  const sufijo = resultado === RESULTADOS.NO_SUPERADO ? '-no-superado' : '';
  return `reports/gates/G-Demo-${modo}${sufijo}-${fecha}.md`;
}

export function codigoDeSalida(resultado) {
  return resultado === RESULTADOS.NO_SUPERADO ? 1 : 0;
}
