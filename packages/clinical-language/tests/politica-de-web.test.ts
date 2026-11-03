import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadProhibitedTerms } from '../src/index.js';

/**
 * Decisión (Gate 2 de L1D-305, `sprint-S5`): `web` revisa solo el Nivel A (`texto-si-permitido.ts`, `niveles: ['A']`)
 * porque lo que recibe ya pasó el filtro de producción de Python (Nivel A + `salidaGenerada`). No se porta el subconjunto B
 * a web. Este test falla si `salidaGenerada` cambia sin revisar esa decisión, o si web empieza a usar otros niveles.
 * Unificar la política Node/Python es deuda propia.
 */
const RUTA_WEB = new URL('../../../apps/web/lib/evidence/texto-si-permitido.ts', import.meta.url);

describe('Política de la salida generada en web', () => {
  it('mantiene a web solo en el Nivel A mientras salidaGenerada sea el subconjunto decidido [US-249 AC-2]', () => {
    const fuente = readFileSync(RUTA_WEB, 'utf8');

    expect(fuente).toContain("niveles: ['A']");
    expect(loadProhibitedTerms().salidaGenerada.nivelB).toEqual([
      'b-recomend',
      'b-recomiend',
      'b-recommend',
    ]);
  });
});
