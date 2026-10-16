/** E/S compartida de los escáneres de la CI: el árbol versionado y la lectura de texto. */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/** Archivos versionados (y nuevos sin ignorar) bajo `raiz`, relativos y con `/`. */
export function listarArchivosVersionados(raiz) {
  const salida = execFileSync('git', ['-C', raiz, 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  return salida.split('\0').filter(Boolean);
}

/** Contenido de `ruta` (relativa a `raiz`) como `Buffer`, o `null` si no existe o no es un archivo. */
export function leerBytes(raiz, ruta) {
  try {
    return readFileSync(path.join(raiz, ruta));
  } catch {
    return null;
  }
}

/** Contenido de texto o `null` si el archivo no existe. */
export function leerTexto(raiz, ruta) {
  const bytes = leerBytes(raiz, ruta);
  return bytes === null ? null : bytes.toString('utf8');
}

/** Un archivo es de texto si sus primeros 8 KB no tienen bytes NUL (sin lista de extensiones). */
export function esTexto(bytes) {
  return !bytes.subarray(0, 8192).includes(0);
}
