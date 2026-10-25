#!/usr/bin/env node
/**
 * `npm run catalog:version-guard [-- --dir <ruta>] [--base <ref>]` (L1D-126, decisión del usuario 2026-10-24):
 * una versión publicada del catálogo no cambia de contenido. Para cada archivo con contenido (datos críticos y
 * aplicabilidad por tipo, `atributos` y `poblacion`) compara el hash del contenido del árbol actual con el de la base
 * (`git show <base>:<archivo>`); si cambió y `manifest.version` es igual a la de la base, falla nombrando el archivo.
 *
 * Excepción: contenido de la base vacío (o archivo ausente) = primera publicación de ese contenido.
 * Sin base (primera vez, rama sin `origin/main`): falla cerrado cuando `CI=true` y avisa en local.
 * La salida nombra tipo y archivo, nunca la ruta ni valores del catálogo (RN-10, RN-14).
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  ARCHIVOS_DE_RAIZ,
  NOMBRES_DE_ARCHIVO,
  hashDeContenido,
} from '../../packages/clinical-catalogs/validator/index.mjs';
import { nombrable } from '../../packages/clinical-catalogs/validator/nombrable.mjs';

const RAIZ = path.resolve(import.meta.dirname, '../..');
const CATALOGO_POR_DEFECTO = path.join(RAIZ, 'packages/clinical-catalogs');
const FORMA_DE_TIPO = /^[a-z]+$/;
const FORMA_DE_VERSION = /^(test-([a-z]+-)?)?\d+\.\d+\.\d+$/;

/** La versión solo se imprime si tiene la forma del manifiesto, nunca contenido arbitrario. */
const versionNombrable = (version) =>
  typeof version === 'string' && FORMA_DE_VERSION.test(version) ? version : '?';

/** Ítems o claves de un archivo ya leído; cualquier otra forma cuenta como vacío. */
function contenidoDe(archivo) {
  if (Array.isArray(archivo?.items)) return archivo.items;
  return Array.isArray(archivo?.keys) ? archivo.keys : [];
}

/** Archivos con contenido del catálogo (sin extensión, `<tipo>/<archivo>` o `<archivo>`), derivados de los registros. */
function archivosDelCatalogo(manifiesto) {
  const tipos = Array.isArray(manifiesto?.cancerTypes)
    ? manifiesto.cancerTypes.filter((tipo) => typeof tipo === 'string' && FORMA_DE_TIPO.test(tipo))
    : [];
  const porTipo = tipos.flatMap((tipo) => NOMBRES_DE_ARCHIVO.map((nombre) => `${tipo}/${nombre}`));
  return [...Object.keys(ARCHIVOS_DE_RAIZ), ...porTipo];
}

/**
 * @param {{ actual: Lectura, base: Lectura }} entrada
 *   `Lectura` = `{ version, archivos: { [nombre]: objeto JSON | null } }`
 * @returns {{ codigo: string, archivo: string }[]}
 */
export function cambiosSinSubirVersion({ actual, base }) {
  if (actual.version !== base.version) return [];
  return Object.entries(actual.archivos)
    .filter(([nombre, archivo]) => {
      const previo = contenidoDe(base.archivos[nombre]);
      const cambio = hashDeContenido(contenidoDe(archivo)) !== hashDeContenido(previo);
      return cambio && previo.length > 0;
    })
    .map(([nombre]) => ({ codigo: 'contenido_cambiado_sin_subir_version', archivo: nombre }));
}

const mensajeDe = ({ codigo, archivo }) =>
  `${codigo} ${archivo
    .split('/')
    .map((segmento) => nombrable(segmento))
    .join('/')}`;

const leerJsonOpcional = (lectura) => {
  try {
    return JSON.parse(lectura());
  } catch {
    return null;
  }
};

/** La base existe como commit en el repositorio que contiene `directorio`. */
const baseDisponible = (directorio, base) =>
  spawnSync('git', ['rev-parse', '--verify', '--quiet', `${base}^{commit}`], { cwd: directorio })
    .status === 0;

function leerLaBase(directorio, base, nombres, versionActual) {
  const delGit = (nombre) =>
    leerJsonOpcional(() => {
      const resultado = spawnSync('git', ['show', `${base}:./${nombre}.json`], {
        cwd: directorio,
        encoding: 'utf8',
      });
      if (resultado.status !== 0) throw new Error('ausente');
      return resultado.stdout;
    });
  const manifiesto = delGit('manifest');
  return {
    version: manifiesto === null ? versionActual : manifiesto.version,
    archivos: Object.fromEntries(nombres.map((nombre) => [nombre, delGit(nombre)])),
  };
}

function leerElActual(directorio) {
  const leer = (nombre) =>
    leerJsonOpcional(() => readFileSync(path.join(directorio, `${nombre}.json`), 'utf8'));
  const manifiesto = leer('manifest');
  return {
    version: manifiesto?.version,
    archivos: Object.fromEntries(archivosDelCatalogo(manifiesto).map((n) => [n, leer(n)])),
    manifiesto,
  };
}

/** Ejecuta la comprobación: código de salida y líneas a imprimir. */
export function comprobar({ directorio, base, enCi }) {
  if (!baseDisponible(directorio, base)) {
    const linea = 'base_no_disponible';
    return enCi
      ? { codigo: 1, lineas: [linea], error: true }
      : {
          codigo: 0,
          lineas: [`${linea} (aviso local: no se comparó contra la base)`],
          error: true,
        };
  }
  const actual = leerElActual(directorio);
  const baseLeida = leerLaBase(directorio, base, Object.keys(actual.archivos), actual.version);
  const violaciones = cambiosSinSubirVersion({ actual, base: baseLeida });
  if (violaciones.length > 0) return { codigo: 1, lineas: violaciones.map(mensajeDe), error: true };
  return {
    codigo: 0,
    lineas: [`catalog:version-guard OK catalogVersion=${versionNombrable(actual.version)}`],
  };
}

function opcion(argumentos, nombre) {
  const indice = argumentos.indexOf(nombre);
  return indice === -1 ? undefined : argumentos[indice + 1];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argumentos = process.argv.slice(2);
  const resultado = comprobar({
    directorio: path.resolve(opcion(argumentos, '--dir') ?? CATALOGO_POR_DEFECTO),
    base: opcion(argumentos, '--base') ?? process.env.BASE_REF ?? 'origin/main',
    enCi: process.env.CI === 'true',
  });
  for (const linea of resultado.lineas) (resultado.error ? console.error : console.log)(linea);
  process.exitCode = resultado.codigo;
}
