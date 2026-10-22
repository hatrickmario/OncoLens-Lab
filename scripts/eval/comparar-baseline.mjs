/**
 * Comparador de regresión contra `data/evaluation/baseline.json` (US-074 AC-5/AC-6, L1D-237, ADR-41 «DoD»).
 * Módulo puro: recibe el reporte de `evaluate` y el baseline (esquema `oncolens.evaluate.v1`) y devuelve, por métrica
 * numérica del baseline, su valor, su marca de validación y si empeoró más que la tolerancia (`EVAL_MAX_REGRESSION`).
 * Solo agregados: nunca textos ni datos (RN-14).
 */

const EPSILON = 1e-9;
const ROTULO_POR_DEFECTO = 'no_validada';

/** Claves que no son métricas comparables: conteos, intervalos de confianza y el bloque de validación. */
const esClaveIgnorada = (clave) => clave === 'n' || clave === 'validacion' || clave.endsWith('_ic95');

/** En estas métricas menos es mejor (p. ej. `violaciones_rn02`); en las demás, más es mejor. */
const menosEsMejor = (metrica) => /(^|\.)violaciones/.test(metrica);

const esObjeto = (valor) => typeof valor === 'object' && valor !== null && !Array.isArray(valor);

/** Métricas numéricas del baseline como `{ metrica, baseline, rotulo }`, con la marca de validación de su sección. */
function metricasDelBaseline(nodo, ruta = [], rotulo = ROTULO_POR_DEFECTO) {
  const rotuloAqui = nodo.validacion?.rotulo ?? rotulo;
  return Object.entries(nodo)
    .filter(([clave]) => !esClaveIgnorada(clave))
    .flatMap(([clave, valor]) => {
      if (esObjeto(valor)) return metricasDelBaseline(valor, [...ruta, clave], rotuloAqui);
      return typeof valor === 'number' ? [{ metrica: [...ruta, clave].join('.'), baseline: valor, rotulo: rotuloAqui }] : [];
    });
}

const valorEn = (nodo, metrica) => metrica.split('.').reduce((actual, clave) => (esObjeto(actual) ? actual[clave] : undefined), nodo);

/** `empeora` = cuánto se alejó el valor del baseline hacia lo peor (negativo si mejoró). */
function estadoDe({ metrica, baseline, actual }, tolerancia) {
  if (typeof actual !== 'number') return 'regresion';
  const empeora = menosEsMejor(metrica) ? actual - baseline : baseline - actual;
  // Un conteo de invariante (`violaciones_*`, RN-02) no admite caída tolerada: cualquier aumento es regresión.
  const permitida = menosEsMejor(metrica) ? 0 : tolerancia;
  if (empeora > permitida + EPSILON) return 'regresion';
  if (empeora > EPSILON) return 'tolerada';
  return empeora < -EPSILON ? 'mejora' : 'igual';
}

/**
 * @param {object} reporte salida de `evaluate` (con `metricas`)
 * @param {object} baseline `data/evaluation/baseline.json`
 * @param {{ tolerancia: number }} opciones caída máxima tolerada, en puntos absolutos de la métrica
 * @returns {{ filas: { metrica: string, baseline: number, actual: number | null, rotulo: string, estado: 'igual' | 'mejora' | 'tolerada' | 'regresion' }[],
 *             regresiones: { metrica: string, baseline: number, actual: number | null }[] }}
 */
export function compararConBaseline(reporte, baseline, { tolerancia }) {
  const filas = metricasDelBaseline(baseline.metricas).map((fila) => {
    const valor = valorEn(reporte.metricas, fila.metrica);
    const actual = typeof valor === 'number' ? valor : null;
    return { ...fila, actual, estado: estadoDe({ ...fila, actual }, tolerancia) };
  });
  return { filas, regresiones: filas.filter((fila) => fila.estado === 'regresion') };
}

const ETIQUETA_DE_ESTADO = { igual: 'igual', mejora: 'mejora', tolerada: 'caída tolerada', regresion: 'regresión' };
const textoDe = (valor) => (valor === null ? 'sin valor' : String(valor));

/** Un texto con saltos de línea, barras, comillas invertidas o ángulos no puede añadir Markdown ni HTML propio. */
export function textoSeguro(texto) {
  return texto.replace(/[\r\n`|<>]/g, '?');
}

/** Tabla Markdown de métricas con la marca «validada / no validada» de cada una (AC-6). */
export function tablaMarkdown({ filas }) {
  const lineas = filas.map(
    (f) => `| ${textoSeguro(f.metrica)} | ${textoDe(f.baseline)} | ${textoDe(f.actual)} | ${textoSeguro(f.rotulo.replace('_', ' '))} | ${ETIQUETA_DE_ESTADO[f.estado]} |`,
  );
  return ['| Métrica | Baseline | Actual | Validación | Estado |', '|---|---|---|---|---|', ...lineas].join('\n');
}
