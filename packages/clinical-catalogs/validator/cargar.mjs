import { ARCHIVOS_DEL_CATALOGO, NOMBRES_DE_ARCHIVO } from './archivos.mjs';
import { nombrable } from './nombrable.mjs';

const ESQUEMAS_DE_ARCHIVOS = NOMBRES_DE_ARCHIVO.map(
  (nombre) => ARCHIVOS_DEL_CATALOGO[nombre].esquema,
);

/**
 * Lectura del catálogo a la forma que consume `validarCatalogo` (L1D-93 D2). La E/S se inyecta (`leerArchivo`): el
 * script de CI pasa `fs.readFileSync` y el arranque de `clinical-api` el suyo. Un archivo ilegible o con JSON roto
 * lanza `ArchivoIlegibleError`, que nombra el archivo del catálogo y nunca la ruta ni el contenido (RN-10, RN-14).
 */

/** Nombre del archivo para el mensaje: cada segmento (sin `.json`) pasa por `nombrable`, nunca contenido del catálogo. */
const nombreSeguroDe = (archivo) =>
  archivo
    .split('/')
    .map((segmento) => nombrable(segmento.replace(/\.json$/, '')))
    .join('/');

export class ArchivoIlegibleError extends Error {
  /** @param {string} archivo nombre relativo al catálogo (p. ej. `mama/datos-criticos.json`), sin la ruta del montaje */
  constructor(archivo) {
    const seguro = nombreSeguroDe(archivo);
    super(`archivo_ilegible ${seguro}`);
    this.name = 'ArchivoIlegibleError';
    this.codigo = 'archivo_ilegible';
    this.archivo = seguro;
  }
}

const FORMA_DE_TIPO = /^[a-z]+$/;

function leerJson(directorio, archivo, leerArchivo) {
  try {
    return JSON.parse(leerArchivo(`${directorio}/${archivo}`));
  } catch {
    // El error de E/S o del parser puede citar la ruta o el contenido: se descarta.
    throw new ArchivoIlegibleError(archivo);
  }
}

/** Archivos del catálogo que recorre el validador: manifiesto, claves de atributos y de población y, por tipo, datos críticos y aplicabilidad. */
export function leerCatalogo(directorio, leerArchivo) {
  const manifest = leerJson(directorio, 'manifest.json', leerArchivo);
  const atributos = leerJson(directorio, 'atributos.json', leerArchivo);
  const poblacion = leerJson(directorio, 'poblacion.json', leerArchivo);
  const tipos = {};
  // Solo se lee por tipos con la forma del manifiesto (`^[a-z]+$`): `../x` no construye una ruta de lectura. El
  // esquema del manifiesto rechaza luego el tipo deformado.
  const tiposLeibles = Array.isArray(manifest?.cancerTypes)
    ? manifest.cancerTypes.filter((tipo) => typeof tipo === 'string' && FORMA_DE_TIPO.test(tipo))
    : [];
  for (const tipo of tiposLeibles) {
    tipos[tipo] = Object.fromEntries(
      NOMBRES_DE_ARCHIVO.map((nombre) => [
        nombre,
        leerJson(directorio, `${tipo}/${nombre}.json`, leerArchivo),
      ]),
    );
  }
  return { manifest, atributos, poblacion, tipos };
}

/** Esquemas del paquete que `validarCatalogo` necesita, leídos de `schemas/` (uso del script de CI). */
export function leerEsquemas(directorioDeEsquemas, leerArchivo) {
  const leer = (nombre) => leerJson(directorioDeEsquemas, `${nombre}.schema.json`, leerArchivo);
  const nombres = [
    'manifest',
    'atributos',
    'poblacion',
    'comun',
    'validation',
    ...ESQUEMAS_DE_ARCHIVOS,
  ];
  return Object.fromEntries(nombres.map((nombre) => [nombre, leer(nombre)]));
}
