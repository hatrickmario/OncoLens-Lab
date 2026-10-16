import path from 'node:path';
import { ESLint } from 'eslint';
import { getFileInfo } from 'prettier';
import { describe, expect, it } from 'vitest';
import { GENERATED_ROOTS } from '../../../scripts/contracts/generated.mjs';
import { RAIZ, ejecutar, exigirRuff } from './soporte.mjs';

const CODIGO_PRETTIER = /\.(ts|tsx|js|jsx|mjs|cjs|css)$/;
const CODIGO_ESLINT = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const PYTHON = /\.py$/;

/** Archivos versionados de cada ruta generada (una ruta puede ser un archivo, como el extracto del readme). */
const archivosGenerados = () =>
  GENERATED_ROOTS.flatMap((ruta) =>
    ejecutar('git', ['ls-files', '--', ruta]).salida.split('\n').filter(Boolean),
  );

describe('lo generado queda fuera de Prettier, ESLint y Ruff', () => {
  const archivos = archivosGenerados();

  it('hay archivos generados que comprobar', () => {
    expect(archivos.length).toBeGreaterThan(0);
  });

  it('Prettier ignora todo archivo de código generado [US-215 AC-1]', async () => {
    const noIgnorados = [];
    for (const archivo of archivos.filter((a) => CODIGO_PRETTIER.test(a))) {
      const info = await getFileInfo(path.join(RAIZ, archivo), {
        ignorePath: path.join(RAIZ, '.prettierignore'),
      });
      if (!info.ignored) noIgnorados.push(archivo);
    }

    expect(noIgnorados).toEqual([]);
  });

  it('ESLint ignora todo archivo de código generado [US-215 AC-1]', async () => {
    const eslint = new ESLint({ cwd: RAIZ });
    const noIgnorados = [];
    for (const archivo of archivos.filter((a) => CODIGO_ESLINT.test(a))) {
      if (!(await eslint.isPathIgnored(path.join(RAIZ, archivo)))) noIgnorados.push(archivo);
    }

    expect(noIgnorados).toEqual([]);
  });

  it('Ruff excluye todo archivo Python generado (extend-exclude) [US-215 AC-1]', () => {
    exigirRuff();
    const cwd = path.join(RAIZ, 'apps/rag-orchestrator');
    const noExcluidos = archivos
      .filter((a) => PYTHON.test(a))
      .filter((a) => {
        const resultado = ejecutar('ruff', ['format', '--check', '--force-exclude', path.join(RAIZ, a)], { cwd });
        return resultado.salida.includes('Would reformat') || resultado.estado !== 0;
      });

    expect(noExcluidos).toEqual([]);
  });
});
