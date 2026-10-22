import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  cargarCorpusPiiMini,
  CorpusInvalidoError,
  type EjecutarProceso,
} from '../../../src/evaluacion/pii/corpus.js';

const CORPUS_MINIMO = JSON.stringify([
  { id: 'a', contexto: 'nota', texto: 'texto', etiquetas: [], controles: [] },
]);

describe('cargarCorpusPiiMini', () => {
  let raiz: string;

  const escribirManifiesto = (manifiesto: unknown): void => {
    writeFileSync(
      path.join(raiz, 'data', 'eval', 'pii-mini', 'manifest.json'),
      JSON.stringify(manifiesto),
    );
  };
  const entrega =
    (salida: string): EjecutarProceso =>
    async () => ({ stdout: salida });
  const opciones = (ejecutar: EjecutarProceso) => ({
    raizDelRepo: raiz,
    python: 'py',
    rutaDeBinarios: '/usr/bin',
    ejecutar,
  });

  beforeAll(() => {
    raiz = mkdtempSync(path.join(tmpdir(), 'corpus-pii-'));
    mkdirSync(path.join(raiz, 'data', 'eval', 'pii-mini'), { recursive: true });
  });
  afterAll(() => {
    rmSync(raiz, { recursive: true, force: true });
  });

  it('devuelve los textos y los tipos directos del manifiesto cuando el generador entrega un corpus válido', async () => {
    escribirManifiesto({ tipos_directos: ['nombre', 'correo'] });

    const corpus = await cargarCorpusPiiMini(opciones(entrega(CORPUS_MINIMO)));

    expect(corpus.tiposDirectos).toEqual(['nombre', 'correo']);
    expect(corpus.textos).toHaveLength(1);
  });

  it('lanza CorpusInvalidoError cuando el manifiesto no declara tipos_directos', async () => {
    escribirManifiesto({ clase: 'sintetico' });

    await expect(cargarCorpusPiiMini(opciones(entrega(CORPUS_MINIMO)))).rejects.toBeInstanceOf(
      CorpusInvalidoError,
    );
  });

  it('lanza CorpusInvalidoError sin citar la salida cuando el generador no entrega JSON', async () => {
    escribirManifiesto({ tipos_directos: ['nombre'] });

    const error = await cargarCorpusPiiMini(opciones(entrega('no-es-json-secreto'))).catch(
      (e: unknown) => e as Error,
    );

    expect(error).toBeInstanceOf(CorpusInvalidoError);
    expect((error as Error).message).not.toContain('secreto');
  });

  it('entrega al proceso hijo solo PATH y LANG como entorno', async () => {
    escribirManifiesto({ tipos_directos: ['nombre'] });
    let recibido: Record<string, string> = {};

    await cargarCorpusPiiMini(
      opciones(async (_programa, _argumentos, entorno) => {
        recibido = entorno;
        return { stdout: CORPUS_MINIMO };
      }),
    );

    expect(recibido).toEqual({ PATH: '/usr/bin', LANG: 'C.UTF-8' });
  });
});
