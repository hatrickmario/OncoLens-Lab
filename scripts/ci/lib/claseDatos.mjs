/**
 * Una sola definición de "marcado `sintetico`" para los dos escáneres (design.md D5, Open Questions):
 * `clase: sintetico` (vocabulario de data_origin y de los manifiestos de L1D-102 y L1D-274) o la marca literal
 * `sintetico: true` de AC-4. Módulo puro: la E/S llega por funciones inyectadas.
 */
import path from 'node:path';
import YAML from 'yaml';

const NOMBRES_DE_MANIFIESTO = ['manifest.json', 'manifest.yaml', 'manifest.yml'];
const CABECERA = /(?:^|[\s{,#"'])(?:clase["']?\s*[:=]\s*["']?sintetico\b|["']?sintetico["']?\s*[:=]\s*true\b)/;
const TAMANO_CABECERA = 2048;

/**
 * El manifiesto más cercano a `ruta`: sube por los directorios hasta `raiz` (inclusive).
 * @param {string} ruta archivo, relativo a la raíz
 * @param {(ruta: string) => string | null} leerArchivo devuelve el contenido o `null` si no existe
 * @returns {{ ruta: string, contenido: string } | null}
 */
export function manifiestoMasCercano(ruta, leerArchivo) {
  let directorio = path.posix.dirname(ruta);
  for (;;) {
    for (const nombre of NOMBRES_DE_MANIFIESTO) {
      const candidata = directorio === '.' ? nombre : `${directorio}/${nombre}`;
      const contenido = leerArchivo(candidata);
      if (contenido !== null) return { ruta: candidata, contenido };
    }
    if (directorio === '.' || directorio === '/') return null;
    directorio = path.posix.dirname(directorio);
  }
}

/** ¿El manifiesto (JSON o YAML) declara la clase de datos `sintetico`? Un manifiesto ilegible no la declara. */
export function declaraClaseSintetico(manifiesto) {
  try {
    const datos = YAML.parse(manifiesto.contenido);
    return datos?.clase === 'sintetico' || datos?.sintetico === true;
  } catch {
    return false;
  }
}

/** ¿La cabecera del propio archivo (primeros bytes) declara la clase `sintetico`? */
export function declaraClaseEnCabecera(texto) {
  return CABECERA.test(texto.slice(0, TAMANO_CABECERA));
}
