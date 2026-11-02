#!/usr/bin/env node
/**
 * Higiene de `tasks.md` en los PR de historia (retro S4, M4b). Regla de `openspec/config.yaml` (rules.tasks): una
 * tarea que no se hace en el PR se difiere nombrando su destino. Falla si el PR se titula `[L1D-nn] ...` y el
 * `tasks.md` del change `l1d-nn-*` conserva una tarea abierta (`- [ ]`) sin la palabra DIFERIDA/TRASLADADA/MOVIDA y un
 * ID destino (`D<n>-<nn>`, `H-<n>`, `US-<nnn>` o `L1D-<nn>` distinto del de la propia historia; o «entrega <n>»).
 *
 * Fuera de un PR, o si el título no empieza por `[L1D-nn]`, no comprueba nada (así el job nunca queda «omitido»).
 * Uso: PR_TITLE="[L1D-144] ..." node scripts/ci/tasks-destino.mjs [--raiz <carpeta>]
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const PALABRA_DE_TRASLADO = /\b(?:DIFERIDAS?|TRASLADADAS?|MOVIDAS?)\b/i;
const ID_DESTINO = /\b(?:D\d+-\d+|H-\d+|US-\d+[a-z]?|L1D-\d+)\b/g;
const ENTREGA_POSTERIOR = /\bentrega\s+\d/i;
const TAREA_ABIERTA = /^\s*- \[ \]/;

/** IDs `L1D-nn` que el título del PR declara entre corchetes iniciales: `[L1D-145][L1D-300] ...`. */
export function historiasDelTitulo(titulo) {
  const inicio = /^(?:\s*\[L1D-\d+\])+/.exec(titulo ?? '');
  return inicio ? [...inicio[0].matchAll(/\[L1D-(\d+)\]/g)].map((m) => `L1D-${m[1]}`) : [];
}

/** Tareas abiertas sin traslado nombrado. `propias` son los L1D-nn del PR, que no valen como destino. */
export function tareasSinDestino(texto, propias = []) {
  const propiasSet = new Set(propias);
  return texto
    .split('\n')
    .map((linea, i) => ({ numero: i + 1, linea }))
    .filter(({ linea }) => TAREA_ABIERTA.test(linea))
    .filter(({ linea }) => {
      if (!PALABRA_DE_TRASLADO.test(linea)) return true;
      if (ENTREGA_POSTERIOR.test(linea)) return false;
      const destinos = (linea.match(ID_DESTINO) ?? []).filter((id) => !propiasSet.has(id));
      return destinos.length === 0;
    });
}

/** Rutas de `tasks.md` de los changes activos (no archivados) de las historias dadas. */
export function tasksDeLasHistorias(raiz, historias) {
  const carpeta = path.join(raiz, 'openspec', 'changes');
  if (!existsSync(carpeta)) return [];
  const prefijos = historias.map((id) => `${id.toLowerCase()}-`);
  return readdirSync(carpeta, { withFileTypes: true })
    .filter(
      (d) => d.isDirectory() && d.name !== 'archive' && prefijos.some((p) => d.name.startsWith(p)),
    )
    .map((d) => path.join(carpeta, d.name, 'tasks.md'))
    .filter((ruta) => existsSync(ruta));
}

export function main({ titulo, raiz }) {
  const historias = historiasDelTitulo(titulo);
  if (historias.length === 0) {
    console.log(
      'tasks-destino — el título no empieza por [L1D-nn]: no es un PR de historia, nada que comprobar',
    );
    return 0;
  }
  let fallos = 0;
  for (const ruta of tasksDeLasHistorias(raiz, historias)) {
    const sinDestino = tareasSinDestino(readFileSync(ruta, 'utf8'), historias);
    sinDestino.forEach(({ numero, linea }) => {
      fallos += 1;
      const relativa = path.relative(raiz, ruta);
      console.error(
        `${relativa}:${numero} — tarea abierta sin DIFERIDA/TRASLADADA y un ID destino: ${linea.trim().slice(0, 120)}`,
      );
    });
  }
  if (fallos === 0)
    console.log(`tasks-destino — ${historias.join(', ')}: ninguna tarea abierta sin destino`);
  return fallos === 0 ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const i = process.argv.indexOf('--raiz');
  const raiz = i > -1 ? path.resolve(process.argv[i + 1]) : process.cwd();
  const esPr = !process.env.GITHUB_EVENT_NAME || process.env.GITHUB_EVENT_NAME === 'pull_request';
  process.exitCode = esPr ? main({ titulo: process.env.PR_TITLE ?? '', raiz }) : 0;
}
