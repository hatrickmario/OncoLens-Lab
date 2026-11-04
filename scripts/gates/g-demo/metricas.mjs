/**
 * Métricas del gate G-Demo frente a las metas iniciales (US-142 AC-2, DEC-07).
 *
 * Ninguna meta vive aquí (RN-22): salen de `metas-iniciales.yaml` (`claveMeta`) o, para las dos invariantes del gate
 * (G-2 = M-10.1 y G-14 = M-10.2), de `metricas.json` (`metaFija`). Las metas se comparan, nunca se modifican.
 */
import { parse } from 'yaml';

export const ORIGEN_METAS = 'metas-iniciales.yaml';
export const ORIGEN_META_FIJA = 'metricas.json (invariante del gate)';
/** La configuración de `evaluate` que el gate acepta (`eval/configs/s5*.yaml`). */
export const PREFIJO_CONFIGURACION_DEL_GATE = 's5';

/** Metas por clave, tal como las declara el YAML (`minimo` o `maximo`). */
export function cargarMetas(textoYaml) {
  const documento = parse(textoYaml);
  if (!documento || typeof documento.metas !== 'object') {
    throw new Error('metas-iniciales.yaml no declara `metas`');
  }
  return documento.metas;
}

/** El reporte de `evaluate` debe existir y ser de la configuración del S5; si no, el gate no puede medir. */
export function validarReporte(reportes) {
  const lista = Array.isArray(reportes) ? reportes.filter(Boolean) : [];
  const motivo = 'reporte de evaluate ausente o de otra configuración';
  if (lista.length === 0) return { ok: false, motivo };
  const todosDelGate = lista.every((r) =>
    String(r?.configuracion?.nombre ?? '').startsWith(PREFIJO_CONFIGURACION_DEL_GATE),
  );
  return todosDelGate ? { ok: true } : { ok: false, motivo };
}

/** Cómo se muestra una meta (`≥ n` o `≤ n`): una sola definición para el motivo y la tabla. */
export function textoDeMeta(meta) {
  return meta.minimo !== undefined ? `≥ ${meta.minimo}` : `≤ ${meta.maximo}`;
}

function valorEn(objeto, ruta) {
  let actual = objeto;
  for (const clave of ruta) {
    if (actual === null || typeof actual !== 'object') return undefined;
    actual = actual[clave];
  }
  return actual;
}

/** `validacion` más cercana subiendo por la ruta: cuántos casos validados y no validados componen la métrica (AC-T5.3). */
function validacionDe(objeto, ruta) {
  for (let largo = ruta.length - 1; largo > 0; largo -= 1) {
    const validacion = valorEn(objeto, [...ruta.slice(0, largo), 'validacion']);
    if (validacion && typeof validacion === 'object') {
      return {
        validadas: validacion.preguntas_validadas ?? null,
        noValidadas: validacion.preguntas_no_validadas ?? null,
      };
    }
  }
  return { validadas: null, noValidadas: null };
}

function buscarEnReportes(reportes, rutas) {
  for (const reporte of reportes) {
    for (const ruta of rutas) {
      const valor = valorEn(reporte, ruta);
      if (typeof valor === 'number' && Number.isFinite(valor)) {
        return { valor, ...validacionDe(reporte, ruta) };
      }
    }
  }
  return { valor: null, validadas: null, noValidadas: null };
}

function metaDe(definicion, metas) {
  if (definicion.metaFija) return { meta: definicion.metaFija, origen: ORIGEN_META_FIJA };
  const declarada = metas[definicion.claveMeta];
  if (!declarada) throw new Error(`la meta ${definicion.claveMeta} no está en ${ORIGEN_METAS}`);
  const { minimo, maximo } = declarada;
  return {
    meta: { ...(minimo !== undefined && { minimo }), ...(maximo !== undefined && { maximo }) },
    origen: ORIGEN_METAS,
  };
}

function estadoFrenteALaMeta(valor, meta) {
  if (valor === null) return 'no_medida';
  if (meta.minimo !== undefined && valor < meta.minimo) return 'fuera_de_meta';
  if (meta.maximo !== undefined && valor > meta.maximo) return 'fuera_de_meta';
  return 'en_meta';
}

/** Una medición por definición, con su valor, su meta, su origen y los casos validados y no validados. */
export function evaluarMetricas(reportes, definiciones, metas) {
  return definiciones.map((definicion) => {
    const { meta, origen } = metaDe(definicion, metas);
    const { valor, validadas, noValidadas } = buscarEnReportes(reportes, definicion.rutas);
    const estado = estadoFrenteALaMeta(valor, meta);
    return {
      id: definicion.id,
      etiqueta: definicion.etiqueta,
      obligatoria: definicion.obligatoria === true,
      valor,
      meta,
      origen,
      estado,
      validadas,
      noValidadas,
      motivo:
        estado === 'no_medida' ? (definicion.motivoSiNoSeMide ?? 'el reporte no la trae') : null,
    };
  });
}
