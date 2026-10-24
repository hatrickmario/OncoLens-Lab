import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// L1D-285 tarea 4.3 (carrera detectada en el PR #195): `integracionRag.test.mjs` escribía un archivo sin versionar en el
// árbol REAL mientras `evalRequired.test.mjs` lo copiaba (ENOENT, flaky). Ningún test de scripts/ci puede dejar archivos
// en el árbol real, ni por un instante: el árbol compartido es el recurso que otros tests leen en paralelo.
const RAIZ = path.resolve(import.meta.dirname, '../../..');
const VITEST = path.join(RAIZ, 'node_modules/.bin/vitest');
const CARPETAS_VIGILADAS = ['apps/rag-orchestrator/tests', 'apps/rag-orchestrator', 'scripts/ci', 'packages'];
const INTERVALO_DE_SONDEO_MS = 2;
const RONDAS = 3;
const TIEMPO_MAXIMO_MS = 120_000;

const listar = () => Object.fromEntries(CARPETAS_VIGILADAS.map((carpeta) => [carpeta, new Set(readdirSync(path.join(RAIZ, carpeta)))]));

/** Ejecuta un archivo de test en un proceso hijo y devuelve su código; mientras corre, sondea el árbol real. */
function correrVigilandoElArbol(archivo, nombre, base) {
  return new Promise((resolver, rechazar) => {
    const intento = { visto: [] };
    const hijo = spawn(VITEST, ['run', archivo, '-t', nombre], { cwd: RAIZ, stdio: 'ignore' });
    const sondeo = setInterval(() => {
      const ahora = listar();
      for (const carpeta of CARPETAS_VIGILADAS) {
        for (const entrada of ahora[carpeta]) {
          if (!base[carpeta].has(entrada)) intento.visto.push(`${carpeta}/${entrada}`);
        }
      }
    }, INTERVALO_DE_SONDEO_MS);
    hijo.on('error', rechazar);
    hijo.on('close', (codigo) => {
      clearInterval(sondeo);
      resolver({ codigo, nuevos: [...new Set(intento.visto)] });
    });
  });
}

describe('tests de scripts/ci que preparan archivos sin versionar', () => {
  it(
    'no crean ningún archivo en el árbol real mientras corren, ni siquiera de forma transitoria [US-213 AC-13]',
    async () => {
      const base = listar();
      for (let ronda = 0; ronda < RONDAS; ronda += 1) {
        const resultado = await correrVigilandoElArbol(
          'scripts/ci/__tests__/integracionRag.test.mjs',
          'no copia un archivo sin versionar',
          base,
        );

        expect(resultado.nuevos).toEqual([]);
        expect(resultado.codigo).toBe(0);
      }
    },
    TIEMPO_MAXIMO_MS,
  );
});
