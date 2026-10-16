import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';
import { FIXTURES_FORMATO, RAIZ, copiarFixtures, ejecutar, prettier, ruff } from './soporte.mjs';

const ASTDE = 'import ast,sys;print(ast.dump(ast.parse(open(sys.argv[1]).read())))';
const astDe = (archivo) => ejecutar('python3', ['-I', '-c', ASTDE, archivo]).salida;

describe('formato de los fixtures', () => {
  it('format:check falla y nombra el archivo cuando un .ts/.tsx no está formateado [US-215 AC-4]', () => {
    const carpeta = copiarFixtures(['sin-formato.ts', 'sin-formato.tsx']);

    const resultado = prettier('--check', ['sin-formato.ts', 'sin-formato.tsx'], carpeta);

    expect(resultado.estado).toBe(1);
    expect(resultado.salida).toContain('sin-formato.ts');
    expect(resultado.salida).toContain('sin-formato.tsx');
  });

  it('format:check falla y nombra el archivo cuando un .py no está formateado [US-215 AC-4]', () => {
    const carpeta = copiarFixtures(['sin-formato.py']);

    const resultado = ruff(['--check'], ['sin-formato.py'], carpeta);

    expect(resultado.estado).toBe(1);
    expect(resultado.salida).toContain('sin-formato.py');
  });

  it('format corrige los .ts/.tsx y conserva el comportamiento de la función [US-215 AC-4]', async () => {
    const carpeta = copiarFixtures(['sin-formato.ts', 'sin-formato.tsx']);
    const antes = (await import(pathToFileURL(path.join(FIXTURES_FORMATO, 'sin-formato.ts')).href)).sumarTotales;

    expect(prettier('--write', ['sin-formato.ts', 'sin-formato.tsx'], carpeta).estado).toBe(0);
    const despues = (await import(pathToFileURL(path.join(carpeta, 'sin-formato.ts')).href)).sumarTotales;

    expect(prettier('--check', ['sin-formato.ts', 'sin-formato.tsx'], carpeta).estado).toBe(0);
    expect(despues([1, 2, 3])).toEqual(antes([1, 2, 3]));
    expect(readFileSync(path.join(carpeta, 'sin-formato.ts'), 'utf8')).toBe(
      readFileSync(path.join(FIXTURES_FORMATO, 'formateado.ts'), 'utf8'),
    );
  });

  it('format corrige el .py y conserva el mismo AST [US-215 AC-4]', () => {
    const carpeta = copiarFixtures(['sin-formato.py']);
    const astAntes = astDe(path.join(carpeta, 'sin-formato.py'));

    expect(ruff([], ['sin-formato.py'], carpeta).estado).toBe(0);

    expect(ruff(['--check'], ['sin-formato.py'], carpeta).estado).toBe(0);
    expect(astAntes).not.toBe('');
    expect(astDe(path.join(carpeta, 'sin-formato.py'))).toBe(astAntes);
  });

  it('ninguna regla de estilo marca un archivo formateado por Prettier [US-215 AC-5]', async () => {
    const eslint = new ESLint({ cwd: RAIZ, ignore: false });
    const archivos = ['formateado.ts', 'formateado.tsx'].map((n) => path.join(FIXTURES_FORMATO, n));

    const resultados = await eslint.lintFiles(archivos);

    expect(resultados.flatMap((r) => r.messages.map((m) => `${r.filePath}:${m.ruleId}`))).toEqual([]);
  });

  it('eslint-config-prettier no encuentra reglas en conflicto sobre un archivo formateado [US-215 AC-5]', () => {
    const resultado = ejecutar(path.join(RAIZ, 'node_modules/.bin/eslint-config-prettier'), [
      path.join(FIXTURES_FORMATO, 'formateado.ts'),
    ]);

    expect(resultado.estado, resultado.salida).toBe(0);
  });
});
