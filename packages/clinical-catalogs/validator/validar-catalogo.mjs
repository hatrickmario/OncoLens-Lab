import { Ajv2020 } from 'ajv/dist/2020.js';
import {
  ARCHIVOS_DE_RAIZ,
  ARCHIVOS_DECLARADOS_POR_EL_MANIFIESTO,
  ARCHIVOS_DEL_CATALOGO,
  NOMBRES_DE_ARCHIVO,
} from './archivos.mjs';
import { catalogHashDeReglasDePoblacion } from './canonico.mjs';
import { nombrable } from './nombrable.mjs';
import { clavesRepetidasEn, verificarCatalogHash, vocabularioDe } from './reglas.mjs';

/**
 * Núcleo puro del validador del catálogo (L1D-93 D2): recibe los archivos ya leídos, la allowlist del modelo y los
 * esquemas; no hace E/S. Lo usan `catalog:validate` (CI) y el arranque de `clinical-api`: una sola implementación.
 *
 * @typedef {{ codigo: string, tipoDeCancer?: string, elemento?: string, archivo?: string, campo?: string }} Violacion  (ítem: tipoDeCancer + elemento, y campo si la regla lo nombra; archivo: tipoDeCancer opcional + archivo)
 */

/** Mensaje de una violación: código y ítem, sin ruta ni valores. */
export const mensajeDe = ({ codigo, tipoDeCancer = 'catalogo', elemento, archivo, campo }) =>
  `${codigo} ${nombrable(tipoDeCancer)}/${nombrable(elemento ?? archivo)}` +
  (campo === undefined ? '' : ` campo=${nombrable(campo)}`);

const itemsDe = (archivo) =>
  Array.isArray(archivo?.items)
    ? archivo.items.filter((item) => item !== null && typeof item === 'object')
    : [];

/** Archivo de claves (`atributos`, `poblacion`) con la forma que las reglas recorren; uno deformado lo rechaza su esquema. */
const conClaves = (archivo) => (Array.isArray(archivo?.keys) ? archivo : { keys: [] });

/** Reglas de cada ítem según el registro de archivos (`ARCHIVOS_DEL_CATALOGO`). */
function violacionesDeLosItems(archivo, nombreDelArchivo, contexto) {
  const { reglas, contexto: contextoDeLosItems } = ARCHIVOS_DEL_CATALOGO[nombreDelArchivo];
  const items = itemsDe(archivo);
  const delArchivo = {
    ...contexto,
    ...contextoDeLosItems?.(items),
    // El contexto común va al final: el de una entrada no puede anular una invariante compartida.
    clavesRepetidas: clavesRepetidasEn(items),
  };
  return items.flatMap((item) =>
    reglas
      .map((regla) => regla(item, delArchivo))
      .filter(Boolean)
      .map((resultado) => ({
        ...(typeof resultado === 'string' ? { codigo: resultado } : resultado),
        tipoDeCancer: contexto.tipoDeCancer,
        elemento: item.key,
      })),
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

/** Esquemas compilados por nombre: `manifest`, cada archivo de raíz y cada archivo del registro. */
function compilarEsquemas(esquemas) {
  const ajv = new Ajv2020({ strict: true });
  ajv.addSchema(esquemas.validation);
  ajv.addSchema(esquemas.comun);
  const delRegistro = NOMBRES_DE_ARCHIVO.map((nombre) => [
    nombre,
    ajv.compile(esquemas[ARCHIVOS_DEL_CATALOGO[nombre].esquema]),
  ]);
  const deLaRaiz = Object.entries(ARCHIVOS_DE_RAIZ).map(([nombre, { esquema }]) => [
    nombre,
    ajv.compile(esquemas[esquema]),
  ]);
  const declarados = Object.entries(ARCHIVOS_DECLARADOS_POR_EL_MANIFIESTO).map(
    ([nombre, { esquema }]) => [nombre, ajv.compile(esquemas[esquema])],
  );
  return {
    manifest: ajv.compile(esquemas.manifest),
    ...Object.fromEntries(declarados),
    ...Object.fromEntries(deLaRaiz),
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

/** Archivos que el manifiesto declara por tipo (D4-03): esquema y `catalogHash` declarado frente al recalculado. */
function violacionesDeLosDeclarados(manifest, tipos, esquemasCompilados) {
  return Object.entries(ARCHIVOS_DECLARADOS_POR_EL_MANIFIESTO).flatMap(([nombre, { clave }]) =>
    Object.entries(tipos).flatMap(([tipoDeCancer, delTipo]) => {
      const declarado = manifest?.[clave]?.[tipoDeCancer];
      const archivo = delTipo[nombre];
      if (declarado === undefined || archivo === undefined) return [];
      const violacion = (codigo) => [{ codigo, tipoDeCancer, archivo: nombre }];
      if (!esquemasCompilados[nombre](archivo)) return violacion('esquema_invalido');
      return catalogHashDeReglasDePoblacion(archivo) === declarado.catalogHash
        ? []
        : violacion('hash_distinto');
    }),
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
 *   `archivos` = `{ manifest, <archivo de raíz>, tipos: { <tipo>: { <archivo del registro>: contenido } } }`;
 *   `esquemas` = `{ manifest, comun, validation, <archivo de raíz>, <archivo del registro>: esquema }`
 * @returns {{ valido: boolean, catalogVersion: string | null, violaciones: Violacion[] }}
 */
export function validarCatalogo({ archivos, allowlist, esquemas }) {
  const esquemasCompilados = compilarEsquemas(esquemas);
  const contexto = {
    allowlist,
    vocabulario: vocabularioDe(esquemas),
    ...Object.fromEntries(
      Object.keys(ARCHIVOS_DE_RAIZ).map((nombre) => [nombre, conClaves(archivos[nombre])]),
    ),
  };
  const violaciones = [
    ...violacionDeEsquema(esquemasCompilados.manifest, archivos.manifest, 'manifest'),
    ...Object.keys(ARCHIVOS_DE_RAIZ).flatMap((nombre) =>
      violacionDeEsquema(esquemasCompilados[nombre], archivos[nombre], nombre),
    ),
    ...Object.entries(archivos.tipos).flatMap(([tipoDeCancer, delTipo]) =>
      violacionesDelTipoSinLanzar(tipoDeCancer, delTipo, contexto, esquemasCompilados),
    ),
    ...violacionesDeLosDeclarados(archivos.manifest, archivos.tipos, esquemasCompilados),
  ];
  return {
    valido: violaciones.length === 0,
    catalogVersion: archivos.manifest?.version ?? null,
    violaciones,
  };
}
