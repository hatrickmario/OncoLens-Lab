import { describe, expect, it } from 'vitest';
import { checkProhibitedTerms } from '../../../../packages/clinical-language/src/check-prohibited-terms';
import { loadProhibitedTerms } from '../../../../packages/clinical-language/src/load-prohibited-terms';
import { mensajes } from '../../lib/mensajes';

function aplanar(valor: unknown): string[] {
  if (typeof valor === 'string') return [valor];
  return Object.values(valor as Record<string, unknown>).flatMap(aplanar);
}

describe('textos de la vista de caso', () => {
  it('no contiene términos prohibidos en las claves caso.* [RN-23]', () => {
    const lista = loadProhibitedTerms();
    const textos = aplanar(mensajes().caso);
    expect(textos.length).toBeGreaterThan(10);
    for (const texto of textos) {
      const hallazgos = checkProhibitedTerms(texto, lista, {
        niveles: ['A', 'B'],
        permitirFrases: true,
      });
      expect(hallazgos.map((h) => `${texto}: ${h.termino}`)).toEqual([]);
    }
  });
});
