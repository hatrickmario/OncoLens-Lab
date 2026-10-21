import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { formasDe, leerZip } from './depurar-traza';

/**
 * Busca secretos en un árbol de archivos como lo haría quien descarga el artefacto (L1D-278, RN-14): en claro, en base64
 * (las tres alineaciones posibles dentro de un texto mayor), dentro de zips anidados y dentro de los zips que el informe
 * HTML incrusta en base64 (`data:application/zip;base64,...`). Devuelve las rutas con coincidencia, nunca el valor.
 */

const ZIP_INCRUSTADO = /data:application\/zip;base64,([A-Za-z0-9+/=]+)/g;
const INICIO_DE_ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
/** Caracteres base64 que dependen solo del secreto según cuántos bytes lo preceden (0, 1 o 2 módulo 3). */
const INICIO_ESTABLE = [0, 2, 3];

/** Las tres formas en que el base64 de un texto mayor puede contener al secreto (sin los caracteres de borde). */
function formasEnBase64(forma: string): string[] {
  const bytes = Buffer.from(forma, 'utf8');
  return [0, 1, 2].map((relleno) => {
    const total = Buffer.concat([Buffer.alloc(relleno), bytes]);
    const sinRelleno = total.toString('base64').replace(/=+$/, '');
    const completo = total.length % 3 === 0 ? sinRelleno : sinRelleno.slice(0, -1);
    return completo.slice(INICIO_ESTABLE[relleno]);
  });
}

function buscarEnBytes(ruta: string, datos: Buffer, formas: string[], bases64: string[]): string[] {
  const texto = datos.toString('latin1');
  const aqui = [...formas, ...bases64].some((forma) => texto.includes(forma)) ? [ruta] : [];
  const entradas = datos.subarray(0, 4).equals(INICIO_DE_ZIP)
    ? (() => {
        try {
          return leerZip(datos);
        } catch {
          return [{ nombre: '(ilegible)', datos: Buffer.alloc(0) }];
        }
      })()
    : [];
  const incrustados = [...texto.matchAll(ZIP_INCRUSTADO)].map((coincidencia, indice) => ({
    nombre: `incrustado-${indice}`,
    datos: Buffer.from(coincidencia[1] ?? '', 'base64'),
  }));
  const anidados = [...entradas, ...incrustados].flatMap((entrada) =>
    buscarEnBytes(`${ruta}!${entrada.nombre}`, entrada.datos, formas, bases64),
  );
  return [...aqui, ...anidados];
}

function archivosDe(carpeta: string): string[] {
  return readdirSync(carpeta, { recursive: true, withFileTypes: true })
    .filter((entrada) => entrada.isFile())
    .map((entrada) => path.join(entrada.parentPath, entrada.name));
}

/** Rutas (relativas a `carpeta`, con `!` para los zips anidados) donde aparece algún secreto. */
export function buscarSecretos(carpeta: string, secretos: string[]): string[] {
  const formas = formasDe(secretos);
  const bases64 = formas.flatMap(formasEnBase64);
  return archivosDe(carpeta).flatMap((archivo) =>
    buscarEnBytes(
      path.relative(carpeta, archivo),
      readFileSync(archivo),
      formas.map((forma) => Buffer.from(forma, 'utf8').toString('latin1')),
      bases64,
    ),
  );
}
