import { Ajv2020 } from 'ajv/dist/2020.js';
import { ARCHIVOS_DEL_CATALOGO, NOMBRES_DE_ARCHIVO } from './archivos.mjs';
import { nombrable } from './nombrable.mjs';
import { verificarCatalogHash, vocabularioDe } from './reglas.mjs';

/**
 * Núcleo puro del validador del catálogo (L1D-93 D2): recibe los archivos ya leídos, la allowlist del modelo y los
 * esquemas; no hace E/S. Lo usan `catalog:validate` (CI) y el arranque de `clinical-api`: una sola implementación.
 *
 * @typedef {{ codigo: string, tipoDeCancer?: string, elemento?: string, archivo?: string }} Violacion  (ítem: tipoDeCancer + elemento; archivo: tipoDeCancer opcional + archivo)
 */

/** Mensaje de una violación: código y ítem, sin ruta ni valores. */
export const mensajeDe = ({ codigo, tipoDeCancer = 'catalogo', elemento, archivo }) =>
  `${codigo} ${nombrable(tipoDeCancer)}/${nombrable(elemento ?? archivo)}`;

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
      .map((codigo) => ({ codigo, tipoDeCancer: contexto.tipoDeCancer, elemento: item.key })),
  );
}

function violacionesDelArchivo(archivo, nombreDelArchivo, contexto) {
  const delItem = violacionesDeLosItems(archivo, nombreDelArchivo, contexto);
  const delHash = verificarCatalogHash(archivo);
  return delItem.length > 0 || delHash === null
    ? delItem
    : [{ codigo: delHash, tipoDeCancer: contexto.tipoDeCancer, archivo: nombreDelArchivo }];
}

function violacionDeEsquema(validar, contenido, archivo, tipoDeCancer) {
  return validar(contenido)
    ? []
    : [{ codigo: 'esquema_invalido', ...(tipoDeCancer && { tipoDeCancer }), archivo }];
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
    : violacionDeEsquema(validarEsquema, archivo, nombre, contexto.tipoDeCancer);
}

function violacionesDelTipo(tipoDeCancer, archivosDelTipo, contexto, esquemasCompilados) {
  const clavesDelTipo = itemsDe(archivosDelTipo['datos-criticos']).map((item) => item.key);
  const delTipo = { ...contexto, tipoDeCancer, clavesDelTipo };
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
function violacionesDelTipoSinLanzar(tipoDeCancer, archivosDelTipo, contexto, esquemasCompilados) {
  try {
    return violacionesDelTipo(tipoDeCancer, archivosDelTipo, contexto, esquemasCompilados);
  } catch {
    return [{ codigo: 'esquema_invalido', tipoDeCancer, archivo: '?' }];
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
    ...violacionDeEsquema(esquemasCompilados.manifest, archivos.manifest, 'manifest'),
    ...violacionDeEsquema(esquemasCompilados.atributos, archivos.atributos, 'atributos'),
    ...Object.entries(archivos.tipos).flatMap(([tipoDeCancer, delTipo]) =>
      violacionesDelTipoSinLanzar(tipoDeCancer, delTipo, contexto, esquemasCompilados),
    ),
  ];
  return {
    valido: violaciones.length === 0,
    catalogVersion: archivos.manifest?.version ?? null,
    violaciones,
  };
}
