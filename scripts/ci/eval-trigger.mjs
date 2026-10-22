#!/usr/bin/env node
/**
 * Detección de los PR que cambian modelo, prompt, umbral, catálogo o corpus (US-074, L1D-237, design.md D1).
 * Las reglas viven en `scripts/ci/eval-trigger-paths.yaml` (RN-22). Se lee el diff contra la base del PR en vez de usar
 * `paths:` del workflow: los `paths:` no ven claves dentro de un archivo y dejan el check requerido en «pendiente».
 * Uso: node scripts/ci/eval-trigger.mjs --base <sha> [--root <dir>]   (imprime los motivos; siempre sale con 0)
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import YAML from 'yaml';
import { valorDeArgumento } from './lib/cli.mjs';
import { casaConGlob } from './lib/glob.mjs';

const RAIZ = path.resolve(import.meta.dirname, '../..');
const ARCHIVO_DE_REGLAS = path.join(import.meta.dirname, 'eval-trigger-paths.yaml');
const ESPECIALES = /[.*+?^${}()|[\]\\]/g;

export function cargarReglas(archivo = ARCHIVO_DE_REGLAS) {
  return YAML.parse(readFileSync(archivo, 'utf8'));
}

/** Expresión que reconoce la clave como palabra completa, sin distinguir mayúsculas (`LLM_MODEL` ≠ `LLM_MODEL_X`). */
function patronDeClaves({ nombres = [], prefijos = [] }) {
  const alternativas = [
    ...nombres.map((nombre) => `${nombre.replace(ESPECIALES, '\\$&')}(?![A-Za-z0-9_])`),
    ...prefijos.map((prefijo) => `${prefijo.replace(ESPECIALES, '\\$&')}[A-Za-z0-9_]*`),
  ];
  return new RegExp(`(?<![A-Za-z0-9_])(?:${alternativas.join('|')})`, 'i');
}

const motivoDeCambio = ({ ruta, lineas }, reglas, nombraClave) => {
  if (reglas.rutas.some((glob) => casaConGlob(ruta, glob))) return 'ruta';
  const esArchivoDeClaves = reglas.claves.archivos.some((glob) => casaConGlob(ruta, glob));
  return esArchivoDeClaves && lineas.some((linea) => nombraClave.test(linea)) ? 'clave' : null;
};

/**
 * ¿Algún cambio toca un disparador?
 * @param {{ ruta: string, lineas: string[] }[]} cambios archivos del diff y sus líneas añadidas o borradas (sin el signo)
 * @param {{ rutas: string[], claves: { archivos: string[], nombres?: string[], prefijos?: string[] } }} reglas
 * @returns {{ dispara: boolean, motivos: { ruta: string, motivo: 'ruta' | 'clave' }[] }}
 */
export function tocaDisparador(cambios, reglas) {
  const nombraClave = patronDeClaves(reglas.claves);
  const motivos = cambios
    .map((cambio) => ({ ruta: cambio.ruta, motivo: motivoDeCambio(cambio, reglas, nombraClave) }))
    .filter(({ motivo }) => motivo !== null);
  return { dispara: motivos.length > 0, motivos };
}

const git = (raiz, ...parametros) => execFileSync('git', ['-C', raiz, ...parametros], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });

/** Líneas con contenido de un diff -U0 por archivo: `+texto` y `-texto`; la cabecera termina en el primer `@@`. */
export function lineasCambiadas(diff) {
  const lineas = diff.split('\n');
  return lineas
    .slice(lineas.findIndex((linea) => linea.startsWith('@@')) + 1 || lineas.length)
    .filter((linea) => /^[+-]/.test(linea))
    .map((linea) => linea.slice(1));
}

/** Archivos que cambian entre la base y HEAD, con sus líneas cambiadas. Lanza si la base no existe en el clon. */
export function cambiosDesdeBase(raiz, base) {
  const rutas = git(raiz, 'diff', '--name-only', '-z', '--no-renames', base, 'HEAD').split('\0').filter(Boolean);
  return rutas.map((ruta) => ({ ruta, lineas: lineasCambiadas(git(raiz, 'diff', '-U0', '--no-renames', base, 'HEAD', '--', ruta)) }));
}

/**
 * Detección completa. Solo una base ausente o ilegible falla hacia ejecutar la suite (nunca se omite por error);
 * un error de las reglas (glob inválido, forma incorrecta) se propaga con su mensaje.
 */
export function detectar({ raiz = RAIZ, base, reglas = cargarReglas() }) {
  const cambios = cambiosDeLaBase(raiz, base);
  if (cambios === null) return { dispara: true, motivos: [{ ruta: '(diff completo)', motivo: 'base-desconocida' }] };
  return tocaDisparador(cambios, reglas);
}

/** Cambios del diff, o `null` si la base no se puede resolver en este clon. */
function cambiosDeLaBase(raiz, base) {
  if (!base || base.startsWith('-')) return null;
  try {
    return cambiosDesdeBase(raiz, base);
  } catch {
    return null;
  }
}

function main(argumentos) {
  const { dispara, motivos } = detectar({ raiz: path.resolve(valorDeArgumento(argumentos, '--root') ?? RAIZ), base: valorDeArgumento(argumentos, '--base') });
  console.log(`eval-trigger — ${dispara ? 'dispara la suite' : 'ningún disparador en el diff'}`);
  motivos.forEach(({ ruta, motivo }) => console.log(`  ${motivo}: ${ruta}`));
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
