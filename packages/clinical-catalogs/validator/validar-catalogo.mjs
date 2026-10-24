import { Ajv2020 } from 'ajv/dist/2020.js';
import {
  exigirAtributoDeclarado,
  exigirCondicionBienFormada,
  exigirDestino,
  exigirDestinoExistente,
  exigirEstadoValido,
  verificarCatalogHash,
  vocabularioDe,
} from './reglas.mjs';

/**
 * Núcleo puro del validador del catálogo (L1D-93 D2): recibe los archivos ya leídos, la allowlist del modelo y los
 * esquemas; no hace E/S. Lo usan `catalog:validate` (CI) y el arranque de `clinical-api`: una sola implementación.
 *
 * @typedef {{ codigo: string, tipo: string, clave: string }} Violacion
 */

const FORMA_REGISTRABLE = /^[a-z0-9_-]{1,64}$/;

/** Nombre de un ítem o archivo para el mensaje: solo si tiene forma de clave del catálogo, nunca contenido arbitrario. */
const nombrable = (valor) => (typeof valor === 'string' && FORMA_REGISTRABLE.test(valor) ? valor : '?');

/** Mensaje de una violación: código y ítem, sin ruta ni valores. */
export const mensajeDe = ({ codigo, tipo, clave }) => `${codigo} ${nombrable(tipo)}/${nombrable(clave)}`;

const itemsDe = (archivo) => (Array.isArray(archivo?.items) ? archivo.items.filter((item) => item !== null && typeof item === 'object') : []);

/** Reglas por ítem con destino; `datos-criticos.json` añade las propias de los datos críticos. */
function reglasDelItem(item, contexto) {
  const { tipo, allowlist, atributos, vocabulario, clavesDelTipo, esDatoCritico } = contexto;
  const sinDestino = exigirDestino(item);
  const delDestino = sinDestino
    ? [sinDestino]
    : [exigirDestinoExistente(item, allowlist), exigirAtributoDeclarado(item, tipo, atributos)];
  const delDato = esDatoCritico
    ? [exigirCondicionBienFormada(item, clavesDelTipo, vocabulario), exigirEstadoValido(item, vocabulario)]
    : [];
  return [...delDestino, ...delDato].filter(Boolean);
}

function violacionesDelArchivo(archivo, nombreDelArchivo, contexto) {
  const delContexto = { ...contexto, esDatoCritico: nombreDelArchivo === 'datos-criticos' };
  const delItem = itemsDe(archivo).flatMap((item) =>
    reglasDelItem(item, delContexto).map((codigo) => ({ codigo, tipo: contexto.tipo, clave: item.key })),
  );
  const delHash = verificarCatalogHash(archivo);
  return delItem.length > 0 || delHash === null
    ? delItem
    : [{ codigo: delHash, tipo: contexto.tipo, clave: nombreDelArchivo }];
}

function violacionDeEsquema(validar, contenido, tipo, clave) {
  return validar(contenido) ? [] : [{ codigo: 'esquema_invalido', tipo, clave }];
}

function compilarEsquemas(esquemas) {
  const ajv = new Ajv2020({ strict: true });
  return {
    manifest: ajv.compile(esquemas.manifest),
    atributos: ajv.compile(esquemas.atributos),
    datosCriticos: ajv.compile(esquemas.datosCriticos),
    aplicabilidad: ajv.compile(esquemas.aplicabilidad),
  };
}

/** Las reglas con nombre explican mejor un fallo que el esquema genérico: este solo entra si ellas callan. */
function violacionesDeReglasOEsquema(archivo, nombre, validarEsquema, contexto) {
  const delArchivo = violacionesDelArchivo(archivo, nombre, contexto);
  return delArchivo.length > 0 ? delArchivo : violacionDeEsquema(validarEsquema, archivo, contexto.tipo, nombre);
}

function violacionesDelTipo(tipo, { datosCriticos, aplicabilidad }, contexto, esquemasCompilados) {
  const clavesDelTipo = itemsDe(datosCriticos).map((item) => item.key);
  const delTipo = { ...contexto, tipo, clavesDelTipo };
  return [
    ...violacionesDeReglasOEsquema(datosCriticos, 'datos-criticos', esquemasCompilados.datosCriticos, delTipo),
    ...violacionesDeReglasOEsquema(aplicabilidad, 'aplicabilidad', esquemasCompilados.aplicabilidad, delTipo),
  ];
}

/**
 * @param {{ archivos: object, allowlist: object, esquemas: object }} entrada
 *   `archivos` = `{ manifest, atributos, tipos: { <tipo>: { datosCriticos, aplicabilidad } } }`
 * @returns {{ valido: boolean, catalogVersion: string | null, violaciones: Violacion[] }}
 */
export function validarCatalogo({ archivos, allowlist, esquemas }) {
  const esquemasCompilados = compilarEsquemas(esquemas);
  const contexto = {
    allowlist,
    vocabulario: vocabularioDe(esquemas.datosCriticos),
    atributos: Array.isArray(archivos.atributos?.keys) ? archivos.atributos : { keys: [] },
  };
  const violaciones = [
    ...violacionDeEsquema(esquemasCompilados.manifest, archivos.manifest, 'catalogo', 'manifest'),
    ...violacionDeEsquema(esquemasCompilados.atributos, archivos.atributos, 'catalogo', 'atributos'),
    ...Object.entries(archivos.tipos).flatMap(([tipo, delTipo]) =>
      violacionesDelTipo(tipo, delTipo, contexto, esquemasCompilados),
    ),
  ];
  return { valido: violaciones.length === 0, catalogVersion: archivos.manifest?.version ?? null, violaciones };
}
