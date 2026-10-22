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
// Solo reglas de tamaño y complejidad son exceptuables: ninguna de capas ni de seguridad (XSS, cliente, supertest).
const REGLAS_EXCEPTUABLES = ['max-lines-per-function', 'complexity', 'max-lines'];
const CAMPOS_EXCEPCION = ['regla', 'archivo', 'caduca', 'motivo', 'historia'];
// Tope de vigencia de una excepción desde hoy: la deuda se paga o se renueva con una decisión nueva.
const DIAS_MAXIMOS_DE_EXCEPCION = 90;
const MS_POR_DIA = 24 * 60 * 60 * 1000;

const esNumero = (valor) => typeof valor === 'number' && Number.isFinite(valor);

function exigirNumero(objeto, clave, nombre) {
  if (!esNumero(objeto?.[clave])) {
    throw new Error(`quality-thresholds.json: la clave "${nombre}" falta o no es numérica`);
  }
}

const fechaIso = (fecha) => fecha.toISOString().slice(0, 10);

/** AAAA-MM-DD que existe en el calendario (rechaza 2026-02-31): la fecha vuelve a formatearse igual. */
function esFechaReal(texto) {
  const fecha = new Date(`${texto}T00:00:00Z`);
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(texto) && !Number.isNaN(fecha.getTime()) && fechaIso(fecha) === texto
  );
}

function exigirExcepcion(excepcion, indice, hoy) {
  const donde = `quality-thresholds.json: excepciones[${indice}]`;
  for (const campo of CAMPOS_EXCEPCION) {
    if (typeof excepcion?.[campo] !== 'string' || excepcion[campo] === '') {
      throw new Error(`${donde} sin "${campo}"`);
    }
  }
  if (!esFechaReal(excepcion.caduca)) throw new Error(`${donde} "caduca" debe ser AAAA-MM-DD`);
  const tope = fechaIso(new Date(hoy.getTime() + DIAS_MAXIMOS_DE_EXCEPCION * MS_POR_DIA));
  if (excepcion.caduca > tope) {
    throw new Error(
      `${donde} "caduca" supera el tope de ${DIAS_MAXIMOS_DE_EXCEPCION} días (${tope})`,
    );
  }
  if (!REGLAS_EXCEPTUABLES.includes(excepcion.regla)) {
    throw new Error(`${donde} "regla" no exceptuable: ${excepcion.regla}`);
  }
  if (
    /[*?{}]/.test(excepcion.archivo) ||
    excepcion.archivo.split('/').includes('..') ||
    path.isAbsolute(excepcion.archivo)
  ) {
    throw new Error(`${donde} "archivo" debe ser una ruta literal dentro del repositorio`);
  }
}

/** Valida la estructura y devuelve los umbrales; el error nombra la clave ausente o no numérica. */
export function validarUmbrales(umbrales, hoy = new Date()) {
  for (const clave of CLAVES_NUMERICAS) exigirNumero(umbrales, clave, clave);
  for (const clave of CLAVES_WEB) exigirNumero(umbrales?.web, clave, `web.${clave}`);
  if (umbrales.web.componentLinesWarn > umbrales.web.componentLinesError) {
    throw new Error(
      'quality-thresholds.json: web.componentLinesWarn no puede superar a web.componentLinesError',
    );
  }
  (umbrales.excepciones ?? []).forEach((excepcion, indice) =>
    exigirExcepcion(excepcion, indice, hoy),
  );
  return { ...umbrales, excepciones: umbrales.excepciones ?? [] };
}

/**
 * Ruta de los umbrales: `QUALITY_THRESHOLDS` apunta a otro archivo solo para los tests (VITEST=true); en la CI
 * (CI=true) se rechaza para que nadie evalúe el PR con umbrales propios.
 */
export function rutaDeUmbrales(env = process.env) {
  if (!env.QUALITY_THRESHOLDS) return RUTA_UMBRALES;
  if (env.CI === 'true' && !env.VITEST) {
    throw new Error(
      'QUALITY_THRESHOLDS no se admite en la CI: los umbrales viven en quality-thresholds.json',
    );
  }
  return env.QUALITY_THRESHOLDS;
}

export function leerUmbrales(ruta = rutaDeUmbrales()) {
  return validarUmbrales(JSON.parse(readFileSync(ruta, 'utf8')));
}

/** Excepciones aún vigentes: la fecha `caduca` (AAAA-MM-DD) es el último día incluido. */
export function excepcionesVigentes(excepciones, hoy) {
  const hoyIso = hoy.toISOString().slice(0, 10);
  return excepciones.filter((excepcion) => excepcion.caduca >= hoyIso);
}
