import { describe, expect, it } from 'vitest';
import { casaConGlob, globARegExp, validarGlob } from '../lib/glob.mjs';

describe('casaConGlob', () => {
  it.each([
    ['**/package-lock.json', 'package-lock.json', true],
    ['**/package-lock.json', 'apps/web/package-lock.json', true],
    ['**/package-lock.json', 'apps/web/otro.json', false],
    ['docs/*.md', 'docs/a.md', true],
    ['docs/*.md', 'docs/sub/a.md', false],
    ['ci/tests/cases/ac4-allowlist/**', 'ci/tests/cases/ac4-allowlist/a/b.md', true],
    ['ci/tests/cases/ac4-allowlist/**', 'ci/tests/cases/ac5/a.md', false],
    ['apps/clinical-api/test/**/deidentification/**', 'apps/clinical-api/test/unit/x/deidentification/a.ts', true],
    ['apps/clinical-api/test/**/deidentification/**', 'apps/clinical-api/test/deidentification/a.ts', true],
    ['openspec/changes/*-desidentificacion-*/**', 'openspec/changes/l1d-203-desidentificacion-contexto-ia/tasks.md', true],
    ['**/*.{png,jpg,pdf}', 'data/eval/a.pdf', true],
    ['**/*.{png,jpg,pdf}', 'data/eval/a.md', false],
    ['a.b', 'axb', false],
  ])('evalúa el glob %s contra %s', (glob, ruta, esperado) => {
    expect(casaConGlob(ruta, glob)).toBe(esperado);
  });
});

describe('validarGlob', () => {
  it('rechaza una llave sin cerrar en vez de quedarse en un bucle [US-036 AC-4]', () => {
    expect(validarGlob('docs/{a,b')).toBe('llave { sin cerrar');
    expect(() => globARegExp('docs/{a,b')).toThrow('glob inválido');
  });

  it('acepta un glob con llaves balanceadas [US-036 AC-4]', () => {
    expect(validarGlob('**/*.{png,jpg}')).toBeNull();
  });
});
