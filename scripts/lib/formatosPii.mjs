/**
 * Formatos de PII: única lectura y única aplicación de `config/pii-formats.json` (RN-22). Los comparten el escáner de la CI
 * (scripts/ci/pii-scan.mjs) y la regla de ejemplos sintéticos (scripts/contracts/rules/assertExamplesSynthetic.mjs).
 * Los `patron` del archivo son neutros (describen la PII); las exenciones viven en campos que solo aplica este módulo:
 * `prefijosExentos` (p. ej. el centinela SINT-, sensible a mayúsculas), `contextosExentos` (`url`: solo la ruta de la URL;
 * la consulta y el fragmento se escanean siempre), `prefijosDeRegistroExentos`, `dominiosExentos` y `correosExentos`.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

const RAIZ = path.resolve(import.meta.dirname, '../..');
const ARCHIVO_DE_FORMATOS = 'config/pii-formats.json';
const MAXIMO_DE_CARACTERES_DE_UNA_SIGLA = 4;
const URL_EN_LINEA = /https?:\/\/[^\s<>()[\]"']+/giu;

const escaparAlternativa = (texto) => texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const caracteresSignificativos = (texto) => texto.replace(/[^\p{L}\p{N}]/gu, '').length;

/** Una sigla corta (CC, C.C., TI, ID…) exige límite de palabra; una palabra larga se reconoce también dentro de camelCase. */
function alternativaDePalabraClave(palabra) {
  const escapada = escaparAlternativa(palabra);
  return caracteresSignificativos(palabra) <= MAXIMO_DE_CARACTERES_DE_UNA_SIGLA ? `(?<![\\p{L}\\p{N}_])${escapada}(?![\\p{L}_])` : escapada;
}

export function leerConfiguracionDeFormatos(raiz = RAIZ) {
  return JSON.parse(readFileSync(path.join(raiz, ARCHIVO_DE_FORMATOS), 'utf8'));
}

/** Compila los formatos: sustituye las palabras clave y añade las banderas global y de índices. */
export function compilarFormatos(configuracion) {
  return configuracion.formatos.map((formato) => {
    const palabras = (formato.palabrasClave ?? []).map(alternativaDePalabraClave).join('|');
    const fuente = formato.patron.replace('{{palabrasClave}}', palabras);
    return { ...formato, expresion: new RegExp(fuente, `${formato.banderas ?? ''}gd`) };
  });
}

export const formatosCompilados = (raiz) => compilarFormatos(leerConfiguracionDeFormatos(raiz));

/** Prefijo centinela de los valores sintéticos (SINT-): una sola definición, la del formato de documento. */
export const PREFIJO_SINTETICO = leerConfiguracionDeFormatos().formatos.find((formato) => formato.tipo === 'documento_identidad').prefijosExentos[0];

/** ¿El dominio casa con alguna exención (`*.test` = cualquier dominio que termina en `.test`; `example.com` incluye subdominios)? */
export function dominioExento(dominio, exentos = []) {
  const minuscula = dominio.toLowerCase();
  return exentos.some((exento) =>
    exento.startsWith('*.') ? minuscula.endsWith(exento.slice(1)) : minuscula === exento || minuscula.endsWith(`.${exento}`),
  );
}

const esCorreoExento = (valor, exentos = []) => exentos.some((exento) => `${exento.local}@${exento.dominio}`.toLowerCase() === valor.toLowerCase());

function cumpleLosDigitos(formato, valor) {
  const digitos = valor.replace(/\D/g, '').length;
  return digitos >= (formato.digitosMin ?? 0) && digitos <= (formato.digitosMax ?? Infinity);
}

const tienePrefijoExento = (linea, inicio, formato) =>
  (formato.prefijosExentos ?? []).some((prefijo) => linea.slice(Math.max(0, inicio - prefijo.length), inicio) === prefijo);

/** Palabra clave y valor dentro de la ruta de una misma URL (antes de `?`, `#` y `;`): la consulta y el fragmento nunca se eximen. */
function estanEnLaRutaDeUnaUrl(linea, inicioDeLaClave, inicioDelValor) {
  return [...linea.matchAll(URL_EN_LINEA)].some((url) => {
    const posicionDeLaConsulta = url[0].search(/[?#;]/);
    const finDeLaRuta = url.index + (posicionDeLaConsulta === -1 ? url[0].length : posicionDeLaConsulta);
    return [inicioDeLaClave, inicioDelValor].every((posicion) => posicion >= url.index && posicion < finDeLaRuta);
  });
}

/**
 * Identificador de registro exento (`prefijosDeRegistroExentos`, p. ej. `NCT` de ClinicalTrials.gov): el prefijo justo antes
 * del valor, en mayúsculas, y exactamente ocho dígitos. Es independiente de la palabra clave: no exime a un documento con letras.
 */
const esIdentificadorDeRegistro = (linea, inicioDelValor, valor, formato) =>
  /^\d{8}$/.test(valor) &&
  (formato.prefijosDeRegistroExentos ?? []).some((prefijo) => linea.slice(Math.max(0, inicioDelValor - prefijo.length), inicioDelValor) === prefijo);

function exento(linea, coincidencia, formato) {
  const { valor, dominio } = coincidencia.groups;
  const [inicioDelValor] = coincidencia.indices.groups.valor;
  if (!cumpleLosDigitos(formato, valor)) return true;
  if (tienePrefijoExento(linea, inicioDelValor, formato)) return true;
  if (esIdentificadorDeRegistro(linea, inicioDelValor, valor, formato)) return true;
  if ((formato.contextosExentos ?? []).includes('url') && estanEnLaRutaDeUnaUrl(linea, coincidencia.index, inicioDelValor)) return true;
  if (dominio && dominioExento(dominio, formato.dominiosExentos)) return true;
  return Boolean(dominio) && esCorreoExento(valor, formato.correosExentos);
}

/**
 * Coincidencias de PII de una línea, tras aplicar las exenciones de cada formato.
 * Con `sinExenciones` devuelve todo lo que casa con el patrón (la regla de ejemplos es más estricta que el escáner).
 * @returns {{ formato: object, valor: string, dominio?: string }[]}
 */
export function coincidenciasPii(linea, formatos, { sinExenciones = false } = {}) {
  return formatos.flatMap((formato) =>
    [...linea.matchAll(formato.expresion)]
      .filter((coincidencia) => sinExenciones || !exento(linea, coincidencia, formato))
      .map((coincidencia) => ({ formato, valor: coincidencia.groups.valor, dominio: coincidencia.groups.dominio })),
  );
}
