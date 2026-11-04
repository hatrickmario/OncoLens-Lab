/**
 * Registro del gate (US-142 AC-6): Markdown desde `docs/gates/plantilla-G-Demo.md`. Solo agregados, nombres de métrica y
 * de variable, identificadores públicos de versión y modelos: nunca filas, identidad, credenciales ni cadenas de conexión.
 */
export const NO_DISPONIBLE = 'No disponible';
export const DUENO = 'usuario (PO)';

const valorOTexto = (valor) =>
  valor === null || valor === undefined || valor === '' ? NO_DISPONIBLE : String(valor);

/** Sustituye `{{clave}}`; una clave sin dato o un marcador sin sustituir es un error: el registro nunca sale a medias. */
export function renderizarRegistro(plantilla, datos) {
  const completa = plantilla.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_, clave) => {
    if (!(clave in datos)) throw new Error(`la plantilla pide «${clave}» y no hay dato`);
    return String(datos[clave]);
  });
  return completa;
}

function textoDeMeta(meta) {
  return meta.minimo !== undefined ? `≥ ${meta.minimo}` : `≤ ${meta.maximo}`;
}

const ESTADOS_DE_METRICA = {
  en_meta: 'en meta',
  fuera_de_meta: 'FUERA DE META',
  no_medida: 'no medida',
};

export function tablaDeMetricas(metricas) {
  const filas = metricas.map((m) =>
    [
      m.id,
      valorOTexto(m.valor),
      textoDeMeta(m.meta),
      m.origen,
      ESTADOS_DE_METRICA[m.estado],
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
  const no = metricas.filter((m) => m.estado === 'no_medida');
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

export function textoDelP95(p95, { fuente, consultas }) {
  if (p95.estado === 'no_medido') {
    return `no medido (${fuente}); meta ${p95.meta} s (clave \`${p95.clave}\`); no bloquea`;
  }
  const marca =
    p95.estado === 'insumo_adr42' ? 'fuera de meta: insumo de ADR-42' : 'dentro de la meta';
  return `${p95.valor} s, ${marca}; meta ${p95.meta} s (clave \`${p95.clave}\`); consultas: ${valorOTexto(consultas)}; fuente: ${fuente}`;
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

export { valorOTexto };
