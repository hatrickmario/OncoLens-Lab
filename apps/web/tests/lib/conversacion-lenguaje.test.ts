import { describe, expect, it } from 'vitest';
import { checkProhibitedTerms } from '../../../../packages/clinical-language/src/check-prohibited-terms';
import { loadProhibitedTerms } from '../../../../packages/clinical-language/src/load-prohibited-terms';
import { mensajes } from '../../lib/mensajes';

function aplanar(valor: unknown): string[] {
  if (typeof valor === 'string') return [valor];
  return Object.values(valor as Record<string, unknown>).flatMap(aplanar);
}

describe('textos del panel conversacional', () => {
  it('no contiene términos prescriptivos en las claves conversacion.* [US-267 AC-2]', () => {
    const lista = loadProhibitedTerms();
    const fijos = aplanar(mensajes().conversacion);

    expect(fijos.length).toBeGreaterThan(20);
    for (const texto of fijos) {
      const hallazgos = checkProhibitedTerms(texto, lista, {
        niveles: ['A', 'B'],
        permitirFrases: true,
      });
      expect(hallazgos.map((h) => `${texto}: ${h.termino}`)).toEqual([]);
    }
  });
});
