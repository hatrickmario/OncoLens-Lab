import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SMOKE = resolve(import.meta.dirname, '../compose-smoke.sh');

describe('compose-smoke.sh', () => {
  it.each(['AI_DISCLAIMER_TEXT', 'ANALYSIS_BASIS_S1_ASSUMPTION_TEXT'])(
    'exporta un valor sintético de %s porque clinical-api no arranca sin él [L1D-104]',
    (variable) => {
      const patron = new RegExp(`^export ${variable}="\\$\\{${variable}:-[^}]+\\}"$`, 'm');
      expect(readFileSync(SMOKE, 'utf8')).toMatch(patron);
    },
  );
});
