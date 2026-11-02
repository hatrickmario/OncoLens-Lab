#!/usr/bin/env node
/**
 * Higiene de commits del PR (retro S4, M5). Dos comprobaciones sobre `git log <base>..HEAD` (sin merges):
 *  1. ERROR: un commit que escribe `Test-Removal:` lo deja donde `git interpret-trailers --parse` lo ve (en el último
 *     párrafo, junto a `Co-Authored-By`). En el S4, 7 de 12 trailers quedaron en otro párrafo y eran invisibles.
 *  2. AVISO (no falla): por historia/tarea, el orden de los commits es `contract` → `test` → `feat`.
 *
 * Fuera de un PR (GITHUB_EVENT_NAME distinto de pull_request) no comprueba nada.
 * Uso: node scripts/ci/verificar-commits-tdd.mjs --base <sha|ref>
 */
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const TIPOS = ['contract', 'test', 'feat'];
const ALCANCE = /^(contract|test|feat)\(([^)]+)\)/;

/** ¿Hay un `Test-Removal:` en el mensaje? Y si lo hay, ¿lo ve `git interpret-trailers --parse`? */
export function evaluarTestRemoval(mensaje, interpretar = interpretarTrailers) {
  if (!/^Test-Removal:/m.test(mensaje)) return { declarado: false, visible: true };
  return { declarado: true, visible: /^Test-Removal:/m.test(interpretar(mensaje)) };
}

function interpretarTrailers(mensaje) {
  const r = spawnSync('git', ['interpret-trailers', '--parse'], {
    input: mensaje,
    encoding: 'utf8',
  });
  return r.status === 0 ? r.stdout : '';
}

/** Avisos de orden. `asuntos` va del commit más antiguo al más reciente. */
export function avisosDeOrden(asuntos) {
  const primero = new Map();
  asuntos.forEach((asunto, indice) => {
    const m = ALCANCE.exec(asunto);
    if (!m) return;
    const [, tipo, clave] = m;
    const posiciones = primero.get(clave) ?? {};
    if (posiciones[tipo] === undefined) posiciones[tipo] = indice;
    primero.set(clave, posiciones);
  });
  const avisos = [];
  for (const [clave, p] of primero) {
    for (let i = 0; i < TIPOS.length; i += 1) {
      for (let j = i + 1; j < TIPOS.length; j += 1) {
        const antes = TIPOS[i];
        const despues = TIPOS[j];
        if (p[antes] !== undefined && p[despues] !== undefined && p[despues] < p[antes]) {
          avisos.push(
            `${clave}: el primer commit ${despues}(${clave}) va antes que el primero ${antes}(${clave}); el orden esperado es contract → test → feat`,
          );
        }
      }
    }
  }
  return avisos;
}

function commitsDelPr(base) {
  const r = spawnSync(
    'git',
    ['log', '--reverse', '--no-merges', '--format=%H%x1f%B%x1e', `${base}..HEAD`],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  if (r.status !== 0) throw new Error(`git log ${base}..HEAD falló: ${r.stderr.trim()}`);
  return r.stdout
    .split('\x1e')
    .map((bloque) => bloque.replace(/^\n/, ''))
    .filter(Boolean)
    .map((bloque) => {
      const [hash, mensaje] = bloque.split('\x1f');
      return { hash, mensaje: mensaje.replace(/\n+$/, '\n'), asunto: mensaje.split('\n')[0] };
    });
}

export function main({ base }) {
  const commits = commitsDelPr(base);
  let errores = 0;
  for (const { hash, mensaje, asunto } of commits) {
    const { declarado, visible } = evaluarTestRemoval(mensaje);
    if (declarado && !visible) {
      errores += 1;
      console.error(
        `${hash.slice(0, 8)} «${asunto.slice(0, 70)}» — Test-Removal: no es un trailer válido: ponlo en el último párrafo, junto a Co-Authored-By`,
      );
    }
  }
  avisosDeOrden(commits.map((c) => c.asunto)).forEach((aviso) =>
    console.log(`::warning::verificar-commits-tdd — ${aviso}`),
  );
  if (errores === 0)
    console.log(
      `verificar-commits-tdd — ${commits.length} commits revisados, trailers Test-Removal correctos`,
    );
  return errores === 0 ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const i = process.argv.indexOf('--base');
  const base = i > -1 ? process.argv[i + 1] : '';
  const esPr = !process.env.GITHUB_EVENT_NAME || process.env.GITHUB_EVENT_NAME === 'pull_request';
  if (!esPr) process.exitCode = 0;
  else if (!base) {
    console.error('verificar-commits-tdd — falta --base');
    process.exitCode = 2;
  } else process.exitCode = main({ base });
}
