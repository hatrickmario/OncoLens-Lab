#!/usr/bin/env node
/**
 * Fixtures de PR de la CI (US-036, design.md D7): cada caso de `ci/tests/cases/<caso>/case.json` clona el repositorio
 * a un directorio temporal, aplica un cambio sintético y ejecuta el mismo comando que el job de `ci.yml`.
 * Compara código de salida, mensajes esperados (y ausentes) y, si se pide, que el valor sembrado no salga en el log.
 *
 * case.json: { ac, descripcion, esperado: "pasa" | "falla", comando: string | string[], aplicar?: "archivo.sh|.mjs",
 *              mensajes?: string[], ausentes?: string[], sinValor?: "ruta/relativa/al/clon",
 *              pendiente?: { motivo: string, hastaQueSeArchive: string[] } }
 *   - `comando` se ejecuta con `bash -c` en el clon y `BASE_REF` = el commit base del caso (antes de `aplicar`).
 *   - `aplicar` se ejecuta en el clon con CASE_DIR = la carpeta del caso; si deja cambios sin commitear se commitean.
 *   - `pendiente`: el caso depende de changes aún no mergeados; se lista como PENDIENTE (y falla con --estricto). Cuando alguno
 *     de `hastaQueSeArchive` aparece en openspec/changes/archive/ el caso deja de poder estar pendiente y cuenta como FALLA.
 * Uso: ci/tests/run-cases.sh [--estricto] [--lista] [--casos <dir>] [--archivo <dir>] [caso ...]
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ORIGEN = path.resolve(import.meta.dirname, '../..');
const IDENTIDAD_GIT = ['-c', 'user.name=ci-selftest', '-c', 'user.email=ci-selftest@example.com', '-c', 'commit.gpgsign=false'];

const argumentos = process.argv.slice(2);
const estricto = argumentos.includes('--estricto');
const soloLista = argumentos.includes('--lista');
const valorDe = (nombre) => (argumentos.includes(nombre) ? argumentos[argumentos.indexOf(nombre) + 1] : undefined);
const CASOS = path.resolve(valorDe('--casos') ?? path.join(ORIGEN, 'ci/tests/cases'));
const ARCHIVO = path.resolve(valorDe('--archivo') ?? path.join(ORIGEN, 'openspec/changes/archive'));
const CAMBIOS = path.resolve(valorDe('--changes') ?? path.join(ORIGEN, 'openspec/changes'));
const valoresDeBanderas = new Set(['--casos', '--archivo', '--changes'].map(valorDe).filter(Boolean));
const filtro = argumentos.filter((argumento) => !argumento.startsWith('--') && !valoresDeBanderas.has(argumento));

const git = (cwd, ...parametros) => execFileSync('git', [...IDENTIDAD_GIT, '-C', cwd, ...parametros], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

/** Rutas del árbol de trabajo del origen (versionadas y nuevas sin ignorar). */
const archivosDelOrigen = () => git(ORIGEN, 'ls-files', '-z', '--cached', '--others', '--exclude-standard').split('\0').filter(Boolean);

/** Clon local del origen con el árbol de trabajo encima como commit base: los fixtures prueban lo que hay, no solo lo commiteado. */
function clonar(destino) {
  git(ORIGEN, 'clone', '--local', '--quiet', ORIGEN, destino);
  const vigentes = new Set(archivosDelOrigen());
  for (const ruta of git(destino, 'ls-files', '-z').split('\0').filter(Boolean)) {
    if (!vigentes.has(ruta)) rmSync(path.join(destino, ruta), { force: true });
  }
  for (const ruta of vigentes) {
    mkdirSync(path.dirname(path.join(destino, ruta)), { recursive: true });
    cpSync(path.join(ORIGEN, ruta), path.join(destino, ruta), { dereference: false });
  }
  for (const enlazado of ['node_modules', '.venv-codegen']) {
    if (existsSync(path.join(ORIGEN, enlazado))) symlinkSync(path.join(ORIGEN, enlazado), path.join(destino, enlazado));
  }
  git(destino, 'add', '-A');
  git(destino, 'commit', '--quiet', '--allow-empty', '-m', 'base del fixture');
}

function entornoDelCaso(base) {
  const herramientas = path.join(ORIGEN, '.ci-tools');
  const entorno = { ...process.env, BASE_REF: base };
  if (existsSync(herramientas)) entorno.PATH = `${herramientas}${path.delimiter}${process.env.PATH}`;
  const venv = path.join(ORIGEN, '.venv-codegen/bin/python');
  if (!entorno.CODEGEN_PYTHON && existsSync(venv)) entorno.CODEGEN_PYTHON = venv;
  return entorno;
}

function aplicarCambio(caso, dirCaso, clon, entorno) {
  if (!caso.aplicar) return;
  const script = path.join(dirCaso, caso.aplicar);
  const interprete = script.endsWith('.mjs') ? 'node' : 'bash';
  const resultado = spawnSync(interprete, [script], { cwd: clon, env: { ...entorno, CASE_DIR: dirCaso }, encoding: 'utf8' });
  if (resultado.status !== 0) throw new Error(`no se pudo aplicar el cambio del caso: ${resultado.stderr || resultado.stdout}`);
  if (git(clon, 'status', '--porcelain').trim()) {
    git(clon, 'add', '-A');
    git(clon, 'commit', '--quiet', '-m', 'cambio del caso');
  }
}

function ejecutarComandos(comandos, clon, entorno) {
  return comandos.map((comando) => {
    const resultado = spawnSync('bash', ['-c', comando], { cwd: clon, env: entorno, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    return { comando, codigo: resultado.status, salida: `${resultado.stdout}${resultado.stderr}` };
  });
}

/** Razones por las que el resultado no es el esperado (vacío si el caso se cumple). */
function incumplimientos(caso, ejecuciones, clon) {
  const salida = ejecuciones.map((e) => e.salida).join('\n');
  const razones = [];
  const comoSePide = caso.esperado === 'pasa' ? (e) => e.codigo === 0 : (e) => e.codigo !== 0;
  ejecuciones.filter((e) => !comoSePide(e)).forEach((e) => razones.push(`"${e.comando}" terminó con código ${e.codigo}, se esperaba ${caso.esperado}`));
  (caso.mensajes ?? []).filter((mensaje) => !salida.includes(mensaje)).forEach((mensaje) => razones.push(`falta en la salida: ${mensaje}`));
  (caso.ausentes ?? []).filter((texto) => salida.includes(texto)).forEach((texto) => razones.push(`no debía aparecer en la salida: ${texto}`));
  if (caso.sinValor) {
    const lineas = readFileSync(path.join(clon, caso.sinValor), 'utf8').split('\n').filter((linea) => linea.trim().length >= 16);
    lineas.filter((linea) => salida.includes(linea.trim())).forEach(() => razones.push(`la salida repite una línea del valor sembrado en ${caso.sinValor}`));
  }
  return { razones, salida };
}

const carpetasDe = (directorio) => (existsSync(directorio) ? readdirSync(directorio) : []);

/** Nombre del change de una carpeta: las archivadas llevan el prefijo AAAA-MM-DD-. */
const nombreDelChange = (carpeta) => carpeta.replace(/^\d{4}-\d{2}-\d{2}-/, '');

/** Motivo por el que `pendiente` no es válido (forma o changes inexistentes), o `null`. */
function validarPendiente(caso) {
  const { pendiente } = caso;
  if (typeof pendiente !== 'object' || pendiente === null || typeof pendiente.motivo !== 'string' || !pendiente.motivo) {
    return 'pendiente debe ser { motivo, hastaQueSeArchive: [changes] }';
  }
  if (!Array.isArray(pendiente.hastaQueSeArchive) || pendiente.hastaQueSeArchive.length === 0) return 'pendiente.hastaQueSeArchive debe listar al menos un change';
  const conocidos = [...carpetasDe(CAMBIOS), ...carpetasDe(ARCHIVO)];
  const inexistentes = pendiente.hastaQueSeArchive.filter((change) => !conocidos.map(nombreDelChange).includes(change));
  return inexistentes.length > 0 ? `pendiente depende de un change que no existe en openspec/changes/ ni en el archivo: ${inexistentes.join(', ')}` : null;
}

/** Un caso pendiente deja de serlo cuando se archiva alguno de los changes de los que depende. */
function estadoDePendiente(nombre, caso) {
  const invalido = validarPendiente(caso);
  if (invalido) return { nombre, caso, estado: 'FALLA', detalle: invalido };
  const { motivo, hastaQueSeArchive } = caso.pendiente;
  const archivados = carpetasDe(ARCHIVO);
  const yaArchivados = hastaQueSeArchive.filter((change) => archivados.map(nombreDelChange).includes(change));
  if (yaArchivados.length > 0) {
    return { nombre, caso, estado: 'FALLA', detalle: `sigue pendiente pero ya se archivó ${yaArchivados.join(', ')}: quita pendiente y deja el caso en verde` };
  }
  return { nombre, caso, estado: 'PENDIENTE', detalle: motivo };
}

function correrCaso(nombre) {
  const dirCaso = path.join(CASOS, nombre);
  const caso = JSON.parse(readFileSync(path.join(dirCaso, 'case.json'), 'utf8'));
  if (caso.pendiente) return estadoDePendiente(nombre, caso);
  const temporal = mkdtempSync(path.join(os.tmpdir(), 'oncolens-caso-'));
  try {
    const clon = path.join(temporal, 'clon');
    clonar(clon);
    const base = git(clon, 'rev-parse', 'HEAD').trim();
    const entorno = entornoDelCaso(base);
    aplicarCambio(caso, dirCaso, clon, entorno);
    const ejecuciones = ejecutarComandos([].concat(caso.comando), clon, entorno);
    const { razones, salida } = incumplimientos(caso, ejecuciones, clon);
    return razones.length === 0 ? { nombre, caso, estado: 'OK' } : { nombre, caso, estado: 'FALLA', detalle: razones.join('\n    '), salida };
  } catch (error) {
    return { nombre, caso, estado: 'FALLA', detalle: error.message };
  } finally {
    rmSync(temporal, { recursive: true, force: true });
  }
}

const nombres = readdirSync(CASOS, { withFileTypes: true })
  .filter((entrada) => entrada.isDirectory() && (filtro.length === 0 || filtro.includes(entrada.name)))
  .map((entrada) => entrada.name)
  .sort();

if (soloLista) {
  nombres.forEach((nombre) => console.log(nombre));
  process.exit(0);
}

const resultados = nombres.map((nombre) => {
  const resultado = correrCaso(nombre);
  console.log(`${resultado.estado.padEnd(9)} ${nombre} [${resultado.caso.ac}]${resultado.detalle ? `\n    ${resultado.detalle}` : ''}`);
  if (resultado.estado === 'FALLA' && resultado.salida) console.log(resultado.salida.split('\n').slice(-15).map((linea) => `      | ${linea}`).join('\n'));
  return resultado;
});

const fallidos = resultados.filter((r) => r.estado === 'FALLA').length;
const pendientes = resultados.filter((r) => r.estado === 'PENDIENTE').length;
console.log(`\n${resultados.length - fallidos - pendientes} OK · ${fallidos} FALLA · ${pendientes} PENDIENTE`);
process.exit(fallidos > 0 || (estricto && pendientes > 0) ? 1 : 0);
