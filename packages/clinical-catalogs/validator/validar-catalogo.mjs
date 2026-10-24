import { Ajv2020 } from 'ajv/dist/2020.js';
import { ARCHIVOS_DEL_CATALOGO, NOMBRES_DE_ARCHIVO } from './archivos.mjs';
import { nombrable } from './nombrable.mjs';
import { verificarCatalogHash, vocabularioDe } from './reglas.mjs';

/**
 * Núcleo puro del validador del catálogo (L1D-93 D2): recibe los archivos ya leídos, la allowlist del modelo y los
 * esquemas; no hace E/S. Lo usan `catalog:validate` (CI) y el arranque de `clinical-api`: una sola implementación.
 *
 * @typedef {{ codigo: string, tipo: string, clave: string }} Violacion
 */

/** Mensaje de una violación: código y ítem, sin ruta ni valores. */
export const mensajeDe = ({ codigo, tipo, clave }) =>
  `${codigo} ${nombrable(tipo)}/${nombrable(clave)}`;

const itemsDe = (archivo) =>
  Array.isArray(archivo?.items)
    ? archivo.items.filter((item) => item !== null && typeof item === 'object')
    : [];

/** Reglas de cada ítem según el registro de archivos (`ARCHIVOS_DEL_CATALOGO`). */
function violacionesDeLosItems(archivo, nombreDelArchivo, contexto) {
  const { reglas } = ARCHIVOS_DEL_CATALOGO[nombreDelArchivo];
  return itemsDe(archivo).flatMap((item) =>
    reglas
      .map((regla) => regla(item, contexto))
      .filter(Boolean)
      .map((codigo) => ({ codigo, tipo: contexto.tipo, clave: item.key })),
  );
}

function violacionesDelArchivo(archivo, nombreDelArchivo, contexto) {
  const delItem = violacionesDeLosItems(archivo, nombreDelArchivo, contexto);
  const delHash = verificarCatalogHash(archivo);
  return delItem.length > 0 || delHash === null
    ? delItem
    : [{ codigo: delHash, tipo: contexto.tipo, clave: nombreDelArchivo }];
}

function violacionDeEsquema(validar, contenido, tipo, clave) {
  return validar(contenido) ? [] : [{ codigo: 'esquema_invalido', tipo, clave }];
}

/** Esquemas compilados por nombre: `manifest`, `atributos` y cada archivo del registro. */
function compilarEsquemas(esquemas) {
  const ajv = new Ajv2020({ strict: true });
  ajv.addSchema(esquemas.validation);
  const delRegistro = NOMBRES_DE_ARCHIVO.map((nombre) => [
    nombre,
    ajv.compile(esquemas[ARCHIVOS_DEL_CATALOGO[nombre].esquema]),
  ]);
  return {
    manifest: ajv.compile(esquemas.manifest),
    atributos: ajv.compile(esquemas.atributos),
    ...Object.fromEntries(delRegistro),
  };
}

/** Las reglas con nombre explican mejor un fallo que el esquema genérico: este solo entra si ellas callan. */
function violacionesDeReglasOEsquema(archivo, nombre, validarEsquema, contexto) {
  const delArchivo = violacionesDelArchivo(archivo, nombre, contexto);
  return delArchivo.length > 0
    ? delArchivo
    : violacionDeEsquema(validarEsquema, archivo, contexto.tipo, nombre);
}

function violacionesDelTipo(tipo, archivosDelTipo, contexto, esquemasCompilados) {
  const clavesDelTipo = itemsDe(archivosDelTipo['datos-criticos']).map((item) => item.key);
  const delTipo = { ...contexto, tipo, clavesDelTipo };
  return NOMBRES_DE_ARCHIVO.flatMap((nombre) =>
    violacionesDeReglasOEsquema(
      archivosDelTipo[nombre],
      nombre,
      esquemasCompilados[nombre],
      delTipo,
    ),
  );
}

/**
 * Red de seguridad: una forma que las reglas no previeron es un catálogo inválido, no una excepción que escape del
 * arranque o de la CI. El error original se descarta (puede citar contenido del catálogo).
 */
function violacionesDelTipoSinLanzar(tipo, archivosDelTipo, contexto, esquemasCompilados) {
  try {
    return violacionesDelTipo(tipo, archivosDelTipo, contexto, esquemasCompilados);
  } catch {
    return [{ codigo: 'esquema_invalido', tipo, clave: '?' }];
  }
}

/**
 * @param {{ archivos: object, allowlist: object, esquemas: object }} entrada
 *   `archivos` = `{ manifest, atributos, tipos: { <tipo>: { <archivo del registro>: contenido } } }`;
 *   `esquemas` = `{ manifest, atributos, <archivo del registro>: esquema }`
 * @returns {{ valido: boolean, catalogVersion: string | null, violaciones: Violacion[] }}
 */
export function validarCatalogo({ archivos, allowlist, esquemas }) {
  const esquemasCompilados = compilarEsquemas(esquemas);
  const contexto = {
    allowlist,
    vocabulario: vocabularioDe(esquemas['datos-criticos']),
    atributos: Array.isArray(archivos.atributos?.keys) ? archivos.atributos : { keys: [] },
  };
  const violaciones = [
    ...violacionDeEsquema(esquemasCompilados.manifest, archivos.manifest, 'catalogo', 'manifest'),
    ...violacionDeEsquema(
      esquemasCompilados.atributos,
      archivos.atributos,
      'catalogo',
      'atributos',
    ),
    ...Object.entries(archivos.tipos).flatMap(([tipo, delTipo]) =>
      violacionesDelTipoSinLanzar(tipo, delTipo, contexto, esquemasCompilados),
    ),
  ];
  return {
    valido: violaciones.length === 0,
    catalogVersion: archivos.manifest?.version ?? null,
    violaciones,
  };
}
