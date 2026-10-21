import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SMOKE = resolve(import.meta.dirname, '../compose-smoke.sh');

describe('compose-smoke.sh', () => {
  it.each(['AI_DISCLAIMER_TEXT'])(
    'exporta un valor sintético de %s porque clinical-api no arranca sin él [L1D-104]',
    (variable) => {
      const patron = new RegExp(`^export ${variable}="\\$\\{${variable}:-[^}]+\\}"$`, 'm');
      expect(readFileSync(SMOKE, 'utf8')).toMatch(patron);
    },
  );

  it('exporta un AI_DISCLAIMER_TEXT sin la etiqueta de uso académico cuando no lo define el llamador [US-069 AC-2]', () => {
    const linea = readFileSync(SMOKE, 'utf8')
      .split('\n')
      .find((texto) => texto.startsWith('export AI_DISCLAIMER_TEXT='));
    expect(linea).toBeDefined();
    expect(linea).not.toContain('Uso académico');
  });
});
