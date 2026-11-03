#!/usr/bin/env node
/**
 * Detector de cambios de la CI (ARR-11, D-12.1; design.md D1). Decide si un PR solo cambia documentación y, si es así,
 * publica en `$GITHUB_OUTPUT` la lista de jobs que `ci-ok` acepta como omitidos (`omitibles`). Las reglas viven en
 * `scripts/ci/cambios-paths.yaml` (RN-22); los disparadores de `eval-required`, en `eval-trigger-paths.yaml` (no se duplican).
 *
 * Falla hacia «CI completa», nunca hacia omitir: evento distinto de `pull_request`, base vacía o `0000…`, sin merge-base
 * (historia superficial o base inexistente), diff vacío o cualquier ruta que no sea documentación pura. Una configuración
 * inválida sale con código 2 (el job `cambios` queda en rojo y `ci-ok` también).
 * Imprime rutas y motivos, nunca contenido de archivos (RN-14).
 * Uso: node scripts/ci/detectar-cambios.mjs --base <sha> [--root <dir>] [--reglas <archivo>] [--workflow <archivo>]
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import YAML from 'yaml';
import { cargarReglas, tocaDisparador } from './eval-trigger.mjs';
import { valorDeArgumento } from './lib/cli.mjs';
import { casaConGlob, validarGlob } from './lib/glob.mjs';

const RAIZ = path.resolve(import.meta.dirname, '../..');
const ARCHIVO_DE_REGLAS = path.join(import.meta.dirname, 'cambios-paths.yaml');
const ARCHIVO_DE_WORKFLOW = path.join(RAIZ, '.github/workflows/ci.yml');
const LISTAS_DE_GLOBS = ['documentacion', 'consumidos_por_codigo'];
const SIEMPRE_CORREN = ['cambios', 'ci-ok', 'secret-scan', 'data-scan', 'lint-lenguaje', 'higiene-proceso'];

/** Configuración inválida: el detector sale con código 2 nombrando la clave. */
export class ConfiguracionInvalida extends Error {}

const esListaDeCadenas = (valor) => Array.isArray(valor) && valor.every((elemento) => typeof elemento === 'string');
const primeraLinea = (error) => error.message.split('\n')[0];

/** Lee y valida `cambios-paths.yaml` contra los jobs reales de `ci.yml`. Lanza `ConfiguracionInvalida`. */
export function cargarReglasDeCambios({ archivo = ARCHIVO_DE_REGLAS, workflow = ARCHIVO_DE_WORKFLOW } = {}) {
  const nombre = path.basename(archivo);
  let reglas;
  try {
    reglas = YAML.parse(readFileSync(archivo, 'utf8'));
  } catch (error) {
    throw new ConfiguracionInvalida(`${nombre} ilegible: ${primeraLinea(error)}`);
  }
  for (const clave of [...LISTAS_DE_GLOBS, 'omitibles_en_documentacion']) {
    if (!esListaDeCadenas(reglas?.[clave])) throw new ConfiguracionInvalida(`${nombre}: «${clave}» debe ser una lista de cadenas`);
  }
  for (const glob of LISTAS_DE_GLOBS.flatMap((clave) => reglas[clave])) {
    const motivo = validarGlob(glob);
    if (motivo) throw new ConfiguracionInvalida(`${nombre}: glob inválido «${glob}» (${motivo})`);
  }
  validarOmitibles(reglas.omitibles_en_documentacion, jobsDelWorkflow(workflow));
  return reglas;
}

function jobsDelWorkflow(workflow) {
  try {
    return Object.keys(YAML.parse(readFileSync(workflow, 'utf8')).jobs);
  } catch (error) {
    throw new ConfiguracionInvalida(`${path.basename(workflow)} ilegible: ${primeraLinea(error)}`);
  }
}

function validarOmitibles(omitibles, jobs) {
  for (const nombre of omitibles) {
    if (!jobs.includes(nombre)) throw new ConfiguracionInvalida(`omitibles_en_documentacion: el job «${nombre}» no existe en ci.yml`);
    if (SIEMPRE_CORREN.includes(nombre)) throw new ConfiguracionInvalida(`omitibles_en_documentacion: «${nombre}» corre siempre y no puede ser omitible`);
  }
}

/**
 * ¿Todas las rutas son documentación pura? Una ruta no cuenta si no casa con `documentacion`, si la lee el código
 * (`consumidos_por_codigo`) o si es un disparador de `eval-required` (por ruta, o archivo de claves de modelo).
 * @returns {{ soloDocumentacion: boolean, excluidas: { ruta: string, motivo: string }[] }}
 */
export function esSoloDocumentacion(rutas, reglas, reglasDeEval) {
  const excluidas = rutas.flatMap((ruta) => {
    const motivo = motivoDeExclusion(ruta, reglas, reglasDeEval);
    return motivo ? [{ ruta, motivo }] : [];
  });
  return { soloDocumentacion: excluidas.length === 0, excluidas };
}

function motivoDeExclusion(ruta, reglas, reglasDeEval) {
  if (!reglas.documentacion.some((glob) => casaConGlob(ruta, glob))) return 'no es documentación (documentacion)';
  if (reglas.consumidos_por_codigo.some((glob) => casaConGlob(ruta, glob))) return 'lo lee el código (consumidos_por_codigo)';
  if (tocaDisparador([{ ruta, lineas: [] }], reglasDeEval).dispara) return 'disparador de eval-required (eval-trigger-paths.yaml)';
  if (reglasDeEval.claves.archivos.some((glob) => casaConGlob(ruta, glob))) return 'archivo de claves de eval-required (eval-trigger-paths.yaml)';
  return null;
}

const COMPLETA = (motivo, excluidas = []) => ({ documentacion: false, omitibles: [], motivo, excluidas });

/**
 * Decisión pura. `diff` es `null` si no hay merge-base, o la lista de rutas cambiadas contra él.
 * @returns {{ documentacion: boolean, omitibles: string[], motivo: string, excluidas: { ruta: string, motivo: string }[] }}
 */
export function clasificarCambios({ evento, base, diff, reglas, reglasDeEval }) {
  if (evento !== 'pull_request') return COMPLETA(`evento ${evento || '(desconocido)'}: la CI corre completa fuera de un pull_request`);
  if (!base || /^0+$/.test(base)) return COMPLETA('base vacía o 0000…: sin referencia para comparar');
  if (diff === null) return COMPLETA('sin merge-base con la base: no se compara con un diff de dos puntos');
  if (diff.length === 0) return COMPLETA('diff vacío');
  const { soloDocumentacion, excluidas } = esSoloDocumentacion(diff, reglas, reglasDeEval);
  if (!soloDocumentacion) return COMPLETA('el PR cambia archivos que no son solo documentación', excluidas);
  return { documentacion: true, omitibles: [...reglas.omitibles_en_documentacion], motivo: 'solo documentación', excluidas: [] };
}

const git = (raiz, ...parametros) => execFileSync('git', ['-C', raiz, ...parametros], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });

/**
 * Rutas cambiadas entre el merge-base y HEAD, sin detección de renombres (un `git mv` de código a `docs/*.md` lista el
 * borrado del código: no es documentación). `null` si no se puede calcular el merge-base.
 */
export function rutasDesdeMergeBase(raiz, base) {
  if (!base || base.startsWith('-')) return null;
  let ancestro;
  try {
    ancestro = git(raiz, 'merge-base', base, 'HEAD').trim();
  } catch {
    return null;
  }
  if (!ancestro) return null;
  const campos = git(raiz, 'diff', '--no-renames', '--name-status', '-z', ancestro, 'HEAD').split('\0').filter(Boolean);
  return campos.filter((_, indice) => indice % 2 === 1);
}

/** Detección completa con E/S de git y de configuración. Lanza `ConfiguracionInvalida`. */
export function detectarCambios({ raiz = RAIZ, base, evento, archivoDeReglas, archivoDeWorkflow } = {}) {
  const reglas = cargarReglasDeCambios({ archivo: archivoDeReglas, workflow: archivoDeWorkflow });
  const reglasDeEval = cargarReglas();
  const hayBase = evento === 'pull_request' && base && !/^0+$/.test(base);
  return clasificarCambios({ evento, base, diff: hayBase ? rutasDesdeMergeBase(raiz, base) : null, reglas, reglasDeEval });
}

function publicar(resultado) {
  console.log(`cambios — ${resultado.documentacion ? 'PR de documentación' : 'CI completa'}: ${resultado.motivo}`);
  resultado.excluidas.forEach(({ ruta, motivo }) => console.log(`  ${ruta}: ${motivo}`));
  if (resultado.documentacion) console.log(`  omitibles: ${resultado.omitibles.join(', ')}`);
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `documentacion=${resultado.documentacion}\nomitibles=${JSON.stringify(resultado.omitibles)}\n`);
  }
}

function main(argumentos) {
  try {
    publicar(
      detectarCambios({
        raiz: path.resolve(valorDeArgumento(argumentos, '--root') ?? RAIZ),
        base: valorDeArgumento(argumentos, '--base'),
        evento: process.env.GITHUB_EVENT_NAME,
        archivoDeReglas: valorDeArgumento(argumentos, '--reglas'),
        archivoDeWorkflow: valorDeArgumento(argumentos, '--workflow'),
      }),
    );
    return 0;
  } catch (error) {
    if (!(error instanceof ConfiguracionInvalida)) throw error;
    console.error(`cambios — configuración inválida: ${error.message}`);
    return 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
