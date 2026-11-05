/**
 * Registro del gate (US-142 AC-6): Markdown desde `docs/gates/plantilla-G-Demo.md`. Solo agregados, nombres de métrica y
 * de variable, identificadores públicos de versión y modelos: nunca filas, identidad, credenciales ni cadenas de conexión.
 */
import { ESTADOS, textoDeMeta } from './metricas.mjs';

export const NO_DISPONIBLE = 'No disponible';
export const DUENO = 'usuario (PO)';

export const valorOTexto = (valor) =>
  valor === null || valor === undefined || valor === '' ? NO_DISPONIBLE : String(valor);

/** Sustituye `{{clave}}`; una clave sin dato o un marcador sin sustituir es un error: el registro nunca sale a medias. */
export function renderizarRegistro(plantilla, datos) {
  return plantilla.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_, clave) => {
    if (!(clave in datos)) throw new Error(`la plantilla pide «${clave}» y no hay dato`);
    return String(datos[clave]);
  });
}

const ESTADOS_DE_METRICA = {
  [ESTADOS.EN_META]: 'en meta',
  [ESTADOS.FUERA_DE_META]: 'FUERA DE META',
  [ESTADOS.NO_MEDIDA]: 'no medida',
};

function textoDelEstado(estado) {
  const texto = ESTADOS_DE_METRICA[estado];
  if (!texto) throw new Error('estado de métrica desconocido');
  return texto;
}

/** Avisos que no bloquean (p. ej., RN-28 no verificable en modo fingido); visibles en el registro. */
export function listaDeAvisos(avisos) {
  return avisos.length === 0 ? '- Ninguno.' : avisos.map((a) => `- ${a}`).join('\n');
}

export function tablaDeMetricas(metricas) {
  const filas = metricas.map((m) =>
    [
      m.id,
      valorOTexto(m.valor),
      textoDeMeta(m.meta),
      m.origen,
      textoDelEstado(m.estado),
      `${valorOTexto(m.validadas)} / ${valorOTexto(m.noValidadas)}`,
    ].join(' | '),
  );
  return [
    '| Métrica | Valor | Meta | Origen de la meta | Estado | Casos validados / no validados |',
    '|---|---|---|---|---|---|',
    ...filas.map((f) => `| ${f} |`),
  ].join('\n');
}

export function listaDeNoMedidas(metricas) {
  const no = metricas.filter((m) => m.estado === ESTADOS.NO_MEDIDA);
  return no.length === 0 ? '- Ninguna.' : no.map((m) => `- ${m.id}: ${m.motivo}`).join('\n');
}

export function listaDeExcepciones(excepciones) {
  if (excepciones.length === 0) return '- Ninguna.';
  return excepciones
    .map((e) => `- ${e.id}: ${e.descripcion} (${e.feature}; destino ${e.destino}). ${e.motivo}`)
    .join('\n');
}

export function listaDeValidacionClinica(validacion) {
  if (validacion.length === 0) return '- Ninguna.';
  return validacion
    .map((v) => `- ${v.id}: ${v.descripcion}: ${v.estado} (${v.feature}, ${v.destino}).`)
    .join('\n');
}

const MARCA_DEL_P95 = {
  [ESTADOS.EN_META]: 'dentro de la meta',
  [ESTADOS.INSUMO_ADR42]: 'fuera de meta: insumo de ADR-42',
};

/** Lista blanca de lo que puede copiarse al registro versionado (RN-14): lo que no encaja se declara «No disponible». */
export const PATRON_DE_COMMIT = /^[0-9a-f]{40}$/;
export const PATRON_DE_VERSION_O_MODELO = /^[\w.:@+/-]{1,80}$/;
/** Modelo del reporte: el nombre de siempre o la cadena `<modelo>@<revisión>#sha256:<64 hex>` que escribe `evaluate` (D5-55). */
export const PATRON_DE_MODELO = /^[\w.:@+/-]{1,120}(?:#sha256:[0-9a-f]{64})?$/;

export function valorSeguro(valor, patron) {
  return typeof valor === 'string' && patron.test(valor) ? valor : null;
}

export function enteroSeguro(valor) {
  return /^\d{1,6}$/.test(String(valor ?? '')) ? Number(valor) : null;
}

export function textoDelP95(p95, { fuente, consultas }) {
  const meta = `meta ${p95.meta.maximo} s (clave \`${p95.clave}\`)`;
  if (p95.estado === ESTADOS.NO_MEDIDA) {
    return `no medida (${p95.motivo}; ${fuente}); ${meta}; no bloquea`;
  }
  const marca = MARCA_DEL_P95[p95.estado];
  if (!marca) throw new Error('estado de p95 desconocido');
  return `${p95.valor} s, ${marca}; ${meta}; consultas: ${valorOTexto(consultas)}; fuente: ${fuente}`;
}

export function textoDelConteo(soloSintetico) {
  if (!soloSintetico.verificable) return NO_DISPONIBLE;
  const c = soloSintetico.conteo;
  return `sintetico=${c.sintetico}, real_anonimizado=${c.real_anonimizado}, real_identificado=${c.real_identificado}`;
}

export function textoDeBanderas(soloSintetico) {
  if (!soloSintetico.verificable) return NO_DISPONIBLE;
  return Object.entries(soloSintetico.banderas)
    .map(([nombre, activa]) => `${nombre}=${activa}`)
    .join(', ');
}
