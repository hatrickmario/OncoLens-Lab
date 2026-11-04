/**
 * Métricas del gate G-Demo frente a las metas iniciales (US-142 AC-2, DEC-07).
 *
 * Ninguna meta vive aquí (RN-22): salen de `metas-iniciales.yaml` (`claveMeta`) o, para las dos invariantes del gate
 * (G-2 = M-10.1 y G-14 = M-10.2), de `metricas.json` (`metaFija`). Las metas se comparan, nunca se modifican.
 * Todas las comprobaciones devuelven `{motivos: string[]}`: `decidirResultado` solo las concatena.
 */
import { parse } from 'yaml';

export const ORIGEN_METAS = 'metas-iniciales.yaml';
export const ORIGEN_META_FIJA = 'metricas.json (invariante del gate)';

/** Un solo vocabulario de estados para las métricas y para el p95. */
export const ESTADOS = {
  EN_META: 'en_meta',
  FUERA_DE_META: 'fuera_de_meta',
  NO_MEDIDA: 'no_medida',
  INSUMO_ADR42: 'insumo_adr42',
};

const MOTIVO_REPORTE = 'reporte de evaluate ausente o de otra configuración';

/** Metas por clave, tal como las declara el YAML (`minimo` o `maximo`). */
export function cargarMetas(textoYaml) {
  const documento = parse(textoYaml);
  if (!documento || typeof documento.metas !== 'object') {
    throw new Error('metas-iniciales.yaml no declara `metas`');
  }
  return documento.metas;
}

/**
 * El reporte de `evaluate` debe existir y ser de una de las configuraciones aceptadas (lista explícita en metricas.json).
 * `reportes` trae un elemento por cada `--reporte-evaluate` declarado (`null` si no se pudo leer): uno ilegible no se ignora.
 */
export function validarReporte(reportes, nombresAceptados) {
  const declarados = Array.isArray(reportes) ? reportes : [];
  const legibles = declarados.filter(Boolean);
  if (legibles.length < declarados.length) {
    return { ok: false, motivos: ['reporte de evaluate ilegible'] };
  }
  const ok =
    legibles.length > 0 &&
    legibles.every((r) => nombresAceptados.includes(r?.configuracion?.nombre));
  return { ok, motivos: ok ? [] : [MOTIVO_REPORTE] };
}

/** Una meta declara `minimo` o `maximo` numéricos; la misma regla para las métricas y para el p95. */
export function resolverMeta(declarada, nombre) {
  if (!declarada) throw new Error(`la meta ${nombre} no está en ${ORIGEN_METAS}`);
  const { minimo, maximo } = declarada;
  if (minimo === undefined && maximo === undefined) {
    throw new Error(`la meta ${nombre} no declara minimo ni maximo`);
  }
  for (const cota of [minimo, maximo].filter((c) => c !== undefined)) {
    if (typeof cota !== 'number' || !Number.isFinite(cota)) {
      throw new Error(`la meta ${nombre} debe ser numérica`);
    }
  }
  return { ...(minimo !== undefined && { minimo }), ...(maximo !== undefined && { maximo }) };
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
  const nombre = definicion.claveMeta ?? definicion.id;
  const declarada = definicion.metaFija ?? metas[definicion.claveMeta];
  return {
    meta: resolverMeta(declarada, nombre),
    origen: definicion.metaFija ? ORIGEN_META_FIJA : ORIGEN_METAS,
  };
}

function estadoFrenteALaMeta(valor, meta) {
  if (valor === null) return ESTADOS.NO_MEDIDA;
  if (meta.minimo !== undefined && valor < meta.minimo) return ESTADOS.FUERA_DE_META;
  if (meta.maximo !== undefined && valor > meta.maximo) return ESTADOS.FUERA_DE_META;
  return ESTADOS.EN_META;
}

function motivosDeMediciones(mediciones) {
  return mediciones.flatMap((m) => {
    if (m.estado === ESTADOS.FUERA_DE_META) {
      return [`${m.id} fuera de meta (valor ${m.valor}, meta ${textoDeMeta(m.meta)})`];
    }
    if (m.estado === ESTADOS.NO_MEDIDA && m.obligatoria) return [`${m.id} no medida`];
    return [];
  });
}

/**
 * Una medición por definición, con su valor, su meta, su origen y los casos validados y no validados. Los motivos solo
 * existen con un reporte válido: sin él, el motivo es el del reporte y no una lista de métricas «no medidas».
 */
export function evaluarMetricas(reportes, definiciones, metas, nombresAceptados) {
  const mediciones = definiciones.map((definicion) => {
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
        estado === ESTADOS.NO_MEDIDA
          ? (definicion.motivoSiNoSeMide ?? 'el reporte no la trae')
          : null,
    };
  });
  const reporteValido = validarReporte(reportes, nombresAceptados).ok;
  return { mediciones, motivos: reporteValido ? motivosDeMediciones(mediciones) : [] };
}
