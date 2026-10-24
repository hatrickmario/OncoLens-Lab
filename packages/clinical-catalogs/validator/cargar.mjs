/**
 * Lectura del catálogo a la forma que consume `validarCatalogo` (L1D-93 D2). La E/S se inyecta (`leerArchivo`): el
 * script de CI pasa `fs.readFileSync` y el arranque de `clinical-api` el suyo. Un archivo ilegible o con JSON roto
 * lanza `ArchivoIlegibleError`, que nombra el archivo del catálogo y nunca la ruta ni el contenido (RN-10, RN-14).
 */

export class ArchivoIlegibleError extends Error {
  /** @param {string} archivo nombre relativo al catálogo (p. ej. `mama/datos-criticos.json`), sin la ruta del montaje */
  constructor(archivo) {
    super(`archivo_ilegible ${archivo}`);
    this.name = 'ArchivoIlegibleError';
    this.codigo = 'archivo_ilegible';
    this.archivo = archivo;
  }
}

function leerJson(directorio, archivo, leerArchivo) {
  try {
    return JSON.parse(leerArchivo(`${directorio}/${archivo}`));
  } catch {
    // El error de E/S o del parser puede citar la ruta o el contenido: se descarta.
    throw new ArchivoIlegibleError(archivo);
  }
}

/** Archivos del catálogo que recorre el validador: manifiesto, claves de atributos y, por tipo, datos críticos y aplicabilidad. */
export function leerCatalogo(directorio, leerArchivo) {
  const manifest = leerJson(directorio, 'manifest.json', leerArchivo);
  const atributos = leerJson(directorio, 'atributos.json', leerArchivo);
  const tipos = {};
  for (const tipo of manifest.cancerTypes ?? []) {
    tipos[tipo] = {
      datosCriticos: leerJson(directorio, `${tipo}/datos-criticos.json`, leerArchivo),
      aplicabilidad: leerJson(directorio, `${tipo}/aplicabilidad.json`, leerArchivo),
    };
  }
  return { manifest, atributos, tipos };
}

/** Esquemas del paquete que `validarCatalogo` necesita, leídos de `schemas/` (uso del script de CI). */
export function leerEsquemas(directorioDeEsquemas, leerArchivo) {
  const leer = (nombre) => leerJson(directorioDeEsquemas, `${nombre}.schema.json`, leerArchivo);
  return {
    manifest: leer('manifest'),
    atributos: leer('atributos'),
    datosCriticos: leer('datos-criticos'),
    aplicabilidad: leer('aplicabilidad'),
  };
}
