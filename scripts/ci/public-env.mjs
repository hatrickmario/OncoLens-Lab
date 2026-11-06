#!/usr/bin/env node
/**
 * Lista permitida de variables públicas de `web` (US-216 AC-4, design D5). Solo las variables `NEXT_PUBLIC_*` de
 * `config/public-env.allowlist.json` pueden llegar al bundle del navegador. Falla (código 1) si encuentra otra en
 * `apps/web/**` (.ts, .tsx, .mjs, .js), en `apps/web/.env*` o en `infra/docker/*.env*`, y nombra la variable y el
 * archivo, nunca su valor (RN-14).
 *
 * Uso: node scripts/ci/public-env.mjs [--raiz <carpeta>]
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const VARIABLE_PUBLICA = /NEXT_PUBLIC_[A-Z0-9_]+/g;
const EXTENSIONES_DE_CODIGO = new Set(['.ts', '.tsx', '.mjs', '.js']);
const CARPETAS_IGNORADAS = new Set(['node_modules', '.next']);
const LISTA_PERMITIDA = 'config/public-env.allowlist.json';

/** Archivos de código de `apps/web`, sin `node_modules` ni `.next`. */
function archivosDeCodigo(carpeta) {
  if (!existsSync(carpeta)) return [];
  return readdirSync(carpeta, { withFileTypes: true }).flatMap((entrada) => {
    if (CARPETAS_IGNORADAS.has(entrada.name)) return [];
    const ruta = path.join(carpeta, entrada.name);
    if (entrada.isDirectory()) return archivosDeCodigo(ruta);
    return EXTENSIONES_DE_CODIGO.has(path.extname(entrada.name)) ? [ruta] : [];
  });
}

/** Archivos `.env*` directos de una carpeta (`.env`, `.env.local`, `web.env.example`...). */
function archivosEnv(carpeta, patron) {
  if (!existsSync(carpeta)) return [];
  return readdirSync(carpeta)
    .filter((nombre) => patron.test(nombre))
    .map((nombre) => path.join(carpeta, nombre))
    .filter((ruta) => statSync(ruta).isFile());
}

export function leerListaPermitida(raiz) {
  const ruta = path.join(raiz, LISTA_PERMITIDA);
  if (!existsSync(ruta)) throw new Error(`Falta ${LISTA_PERMITIDA}`);
  const { variables } = JSON.parse(readFileSync(ruta, 'utf8'));
  return new Set(variables.map((v) => v.nombre));
}

/** Variables `NEXT_PUBLIC_*` fuera de la lista: `{ variable, archivo }` por cada par, sin valores. */
export function variablesNoPermitidas(raiz) {
  const permitidas = leerListaPermitida(raiz);
  const archivos = [
    ...archivosDeCodigo(path.join(raiz, 'apps/web')),
    ...archivosEnv(path.join(raiz, 'apps/web'), /^\.env/),
    ...archivosEnv(path.join(raiz, 'infra/docker'), /\.env/),
  ];
  return archivos.flatMap((archivo) => {
    const encontradas = new Set(readFileSync(archivo, 'utf8').match(VARIABLE_PUBLICA) ?? []);
    return [...encontradas]
      .filter((variable) => !permitidas.has(variable))
      .map((variable) => ({ variable, archivo: path.relative(raiz, archivo) }));
  });
}

export function main({ raiz }) {
  const fuera = variablesNoPermitidas(raiz);
  fuera.forEach(({ variable, archivo }) => {
    console.error(`${archivo} — ${variable} no está en ${LISTA_PERMITIDA}`);
  });
  if (fuera.length === 0) console.log('public-env — ninguna variable NEXT_PUBLIC_ fuera de la lista permitida');
  return fuera.length === 0 ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const i = process.argv.indexOf('--raiz');
  const raiz = i > -1 ? path.resolve(process.argv[i + 1]) : process.cwd();
  process.exitCode = main({ raiz });
}
