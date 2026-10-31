#!/usr/bin/env node
/**
 * `npm run catalog:version-guard [-- --dir <ruta>] [--base <ref>]` (L1D-126, decisión del usuario 2026-10-24):
 * una versión publicada del catálogo no cambia de contenido. Para cada archivo versionado compara la huella del
 * ARCHIVO ENTERO (sin `version` ni `validation`) del árbol actual con la de la base (`git show <base>:<archivo>`):
 *
 * - cambió y la versión es igual a la de la base: `contenido_cambiado_sin_subir_version`;
 * - cambió y la versión no es estrictamente mayor (ignorando el prefijo `test-…`): `version_no_sube`;
 * - la base no se pudo leer (error de git o JSON ilegible): `base_ilegible`; falla cerrado con `CI=true`;
 * - sin base (primera vez, rama sin `origin/main`): `base_no_disponible`; falla cerrado con `CI=true`.
 *
 * Excepción: archivo ausente en la base o con sus listas de contenido vacías = primera publicación.
 * La versión que gobierna es `manifest.version`, salvo en los archivos con versión propia (`lenguaje/…`).
 * La salida nombra tipo y archivo, nunca la ruta ni valores del catálogo (RN-10, RN-14).
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { jsonCanonico } from '../../packages/clinical-catalogs/validator/index.mjs';
import { nombrable } from '../../packages/clinical-catalogs/validator/nombrable.mjs';

const RAIZ = path.resolve(import.meta.dirname, '../..');
const CATALOGO_POR_DEFECTO = path.join(RAIZ, 'packages/clinical-catalogs');
const FORMA_DE_TIPO = /^[a-z]+$/;
const FORMA_DE_VERSION = /^(?:test-(?:[a-z]+-)?)?(\d+)\.(\d+)\.(\d+)$/;
const MAXIMO_DE_LECTURA = 16 * 1024 * 1024;

/**
 * Registro EXPLÍCITO de lo que vigila el guardián (no se deriva del validador: vigila también lo que este no lee).
 * `manifest.version` gobierna los archivos de raíz y por tipo; los `propios` llevan su versión.
 */
const POR_TIPO = [
  'datos-criticos',
  'aplicabilidad',
  'codigos',
  'tendencias',
  'plantillas',
  'sinonimos',
  'poblacion-reglas',
];
const DE_RAIZ = ['manifest', 'atributos', 'poblacion'];
const CON_VERSION_PROPIA = ['lenguaje/terminos-prohibidos'];
/** Listas de contenido: un archivo cuyas listas están todas vacías (y tiene alguna) aún no se publicó. */
const LISTAS_DE_CONTENIDO = ['items', 'keys', 'entradas'];

const esObjeto = (valor) => valor !== null && typeof valor === 'object' && !Array.isArray(valor);

/** Copia del archivo sin las claves de primer nivel indicadas (sin desestructurar: no deja variables sin uso). */
const sinClaves = (archivo, claves) =>
  Object.fromEntries(Object.entries(archivo).filter(([clave]) => !claves.includes(clave)));

const huellaDeLasClaves = (archivo, omitidas) =>
  esObjeto(archivo)
    ? createHash('sha256')
        .update(jsonCanonico(sinClaves(archivo, omitidas)))
        .digest('hex')
    : 'ausente';

/** Huella del archivo entero sin `version` ni `validation`: entra cualquier campo de primer nivel, hoy o futuro. */
const huellaDe = (archivo) => huellaDeLasClaves(archivo, ['version', 'validation']);

/** Huella de todo salvo las listas de contenido: lo único que la primera publicación puede cambiar. */
const huellaSinListas = (archivo) =>
  huellaDeLasClaves(archivo, ['version', 'validation', ...LISTAS_DE_CONTENIDO]);

function sinPublicar(archivo) {
  if (!esObjeto(archivo)) return true;
  const listas = LISTAS_DE_CONTENIDO.filter((clave) => Array.isArray(archivo[clave]));
  return listas.length > 0 && listas.every((clave) => archivo[clave].length === 0);
}

const partesDe = (version) => {
  const partes = FORMA_DE_VERSION.exec(typeof version === 'string' ? version : '');
  return partes === null ? null : partes.slice(1).map(Number);
};

/** -1, 0 o 1; `null` si alguna versión no tiene forma de semver. */
function compararVersiones(actual, base) {
  const a = partesDe(actual);
  const b = partesDe(base);
  if (a === null || b === null) return null;
  const diferencia = a.map((parte, i) => parte - b[i]).find((resta) => resta !== 0) ?? 0;
  return Math.sign(diferencia);
}

const versionQueGobierna = (nombre, lectura) =>
  CON_VERSION_PROPIA.includes(nombre)
    ? lectura.archivos[nombre]?.contenido?.version
    : lectura.version;

/**
 * @param {{ actual: Lectura, base: Lectura }} entrada
 *   `Lectura` = `{ version, archivos: { [nombre]: { estado: 'ok' | 'ausente' | 'error', contenido } } }`
 * @returns {{ codigo: string, archivo: string }[]}
 */
export function violacionesDeVersion({ actual, base }) {
  return Object.keys({ ...actual.archivos, ...base.archivos }).flatMap((nombre) => {
    const delActual = actual.archivos[nombre]?.contenido ?? null;
    const delaBase = base.archivos[nombre];
    if (delaBase?.estado === 'error') return [{ codigo: 'base_ilegible', archivo: nombre }];
    if (delaBase === undefined || delaBase.estado !== 'ok') return [];
    const previo = delaBase.contenido;
    const primeraPublicacion =
      sinPublicar(previo) && huellaSinListas(delActual) === huellaSinListas(previo);
    if (primeraPublicacion || huellaDe(delActual) === huellaDe(previo)) return [];
    const orden = compararVersiones(
      versionQueGobierna(nombre, actual),
      versionQueGobierna(nombre, base),
    );
    if (orden === 0) return [{ codigo: 'contenido_cambiado_sin_subir_version', archivo: nombre }];
    return orden === 1 ? [] : [{ codigo: 'version_no_sube', archivo: nombre }];
  });
}

const mensajeDe = ({ codigo, archivo }) =>
  `${codigo} ${archivo
    .split('/')
    .map((segmento) => nombrable(segmento))
    .join('/')}`;

const versionNombrable = (version) => (partesDe(version) === null ? '?' : version);

function leerJsonActual(directorio, nombre) {
  try {
    return {
      estado: 'ok',
      contenido: JSON.parse(readFileSync(path.join(directorio, `${nombre}.json`), 'utf8')),
    };
  } catch {
    return { estado: 'ausente', contenido: null };
  }
}

/** La base existe como commit en el repositorio que contiene `directorio`. */
const baseDisponible = (directorio, base) =>
  spawnSync('git', ['rev-parse', '--verify', '--quiet', `${base}^{commit}`], { cwd: directorio })
    .status === 0;

/** Lee un archivo de la base: `ausente` solo si la ruta no existe en el árbol de la base; cualquier otro fallo es `error`. */
function leerDeLaBase(directorio, base, nombre) {
  const opciones = { cwd: directorio, encoding: 'utf8', maxBuffer: MAXIMO_DE_LECTURA };
  const enElArbol = spawnSync(
    'git',
    ['ls-tree', '--name-only', base, '--', `${nombre}.json`],
    opciones,
  );
  if (enElArbol.error || enElArbol.status !== 0) return { estado: 'error', contenido: null };
  if (enElArbol.stdout.trim() === '') return { estado: 'ausente', contenido: null };
  const leido = spawnSync('git', ['show', `${base}:./${nombre}.json`], opciones);
  if (leido.error || leido.status !== 0) return { estado: 'error', contenido: null };
  try {
    return { estado: 'ok', contenido: JSON.parse(leido.stdout) };
  } catch {
    return { estado: 'error', contenido: null };
  }
}

const tiposDe = (manifiesto) =>
  Array.isArray(manifiesto?.cancerTypes)
    ? manifiesto.cancerTypes.filter((tipo) => typeof tipo === 'string' && FORMA_DE_TIPO.test(tipo))
    : [];

/** Archivos vigilados: los de raíz y propios y, por tipo, la unión de los tipos del manifiesto actual y del de la base. */
const archivosVigilados = (tipos) => [
  ...DE_RAIZ,
  ...CON_VERSION_PROPIA,
  ...tipos.flatMap((tipo) => POR_TIPO.map((nombre) => `${tipo}/${nombre}`)),
];

/** Ejecuta la comprobación: código de salida y líneas a imprimir. */
export function comprobar({ directorio, base, enCi }) {
  if (!baseDisponible(directorio, base)) {
    return avisoOFallo('base_no_disponible', enCi);
  }
  const manifiestoDeLaBase = leerDeLaBase(directorio, base, 'manifest');
  const versionDeLaBase = manifiestoDeLaBase.contenido?.version;
  const manifiestoActual = leerJsonActual(directorio, 'manifest').contenido;
  const tipos = [
    ...new Set([...tiposDe(manifiestoActual), ...tiposDe(manifiestoDeLaBase.contenido)]),
  ];
  const nombres = archivosVigilados(tipos);
  const actual = {
    version: manifiestoActual?.version,
    archivos: Object.fromEntries(nombres.map((n) => [n, leerJsonActual(directorio, n)])),
  };
  const delaBase = {
    version: versionDeLaBase,
    archivos: Object.fromEntries(nombres.map((n) => [n, leerDeLaBase(directorio, base, n)])),
  };
  const ilegibles = nombres.filter((n) => delaBase.archivos[n].estado === 'error');
  if (ilegibles.length > 0) {
    return avisoOFallo('base_ilegible', enCi, ilegibles);
  }
  const violaciones = violacionesDeVersion({ actual, base: delaBase });
  if (violaciones.length > 0) return { codigo: 1, lineas: violaciones.map(mensajeDe), error: true };
  return {
    codigo: 0,
    lineas: [`catalog:version-guard OK catalogVersion=${versionNombrable(actual.version)}`],
  };
}

/** Sin base legible: falla cerrado en CI y avisa en local. */
function avisoOFallo(codigo, enCi, archivos) {
  const lineas =
    archivos === undefined ? [codigo] : archivos.map((archivo) => mensajeDe({ codigo, archivo }));
  return enCi
    ? { codigo: 1, lineas, error: true }
    : {
        codigo: 0,
        lineas: lineas.map((l) => `${l} (aviso local: no se comparó contra la base)`),
        error: true,
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
