// Umbrales de calidad (L1D-263, RN-22): única fuente en quality-thresholds.json.
// ESLint, dependency-cruiser y el reporte los leen de aquí; Ruff los recibe sincronizados (ai-services).
import { readFileSync } from 'node:fs';
import path from 'node:path';

export const RUTA_UMBRALES = path.resolve(import.meta.dirname, '../../quality-thresholds.json');

const CLAVES_NUMERICAS = [
  'maxLinesPerFunction',
  'complexity',
  'c901MaxComplexity',
  'plr0915MaxStatements',
];
const CLAVES_WEB = ['componentLinesWarn', 'componentLinesError'];
const CAMPOS_EXCEPCION = ['regla', 'archivo', 'caduca', 'motivo'];

const esNumero = (valor) => typeof valor === 'number' && Number.isFinite(valor);

function exigirNumero(objeto, clave, nombre) {
  if (!esNumero(objeto?.[clave])) {
    throw new Error(`quality-thresholds.json: la clave "${nombre}" falta o no es numérica`);
  }
}

function exigirExcepcion(excepcion, indice) {
  for (const campo of CAMPOS_EXCEPCION) {
    if (typeof excepcion?.[campo] !== 'string' || excepcion[campo] === '') {
      throw new Error(`quality-thresholds.json: excepciones[${indice}] sin "${campo}"`);
    }
  }
}

/** Valida la estructura y devuelve los umbrales; el error nombra la clave ausente o no numérica. */
export function validarUmbrales(umbrales) {
  for (const clave of CLAVES_NUMERICAS) exigirNumero(umbrales, clave, clave);
  for (const clave of CLAVES_WEB) exigirNumero(umbrales?.web, clave, `web.${clave}`);
  if (umbrales.web.componentLinesWarn > umbrales.web.componentLinesError) {
    throw new Error(
      'quality-thresholds.json: web.componentLinesWarn no puede superar a web.componentLinesError',
    );
  }
  (umbrales.excepciones ?? []).forEach(exigirExcepcion);
  return umbrales;
}

export function leerUmbrales(ruta = RUTA_UMBRALES) {
  return validarUmbrales(JSON.parse(readFileSync(ruta, 'utf8')));
}

/** Clasifica el tamaño de un componente: ok, alerta (no falla) o error (falla la CI). */
export function evaluarTamanoComponente(lineas, web) {
  if (lineas > web.componentLinesError) return 'error';
  if (lineas > web.componentLinesWarn) return 'alerta';
  return 'ok';
}

/** Excepciones aún vigentes: la fecha `caduca` (AAAA-MM-DD) es el último día incluido. */
export function excepcionesVigentes(excepciones, hoy) {
  const hoyIso = hoy.toISOString().slice(0, 10);
  return excepciones.filter((excepcion) => excepcion.caduca >= hoyIso);
}
