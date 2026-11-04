import { describe, expect, it } from 'vitest';
import { checkProhibitedTerms } from '../../../../packages/clinical-language/src/check-prohibited-terms';
import { loadProhibitedTerms } from '../../../../packages/clinical-language/src/load-prohibited-terms';
import { mensajes } from '../../lib/mensajes';

function aplanar(valor: unknown): string[] {
  if (typeof valor === 'string') return [valor];
  if (valor === null || typeof valor !== 'object') return [];
  return Object.values(valor).flatMap(aplanar);
}

describe('textos de la columna «Datos críticos»', () => {
  it('no contiene términos prohibidos en datosCriticos.* ni en faltantes.enElCaso [RN-23]', () => {
    const lista = loadProhibitedTerms();
    const { datosCriticos, faltantes } = mensajes();
    const textos = [...aplanar(datosCriticos), faltantes.enElCaso];

    expect(textos.length).toBeGreaterThan(8);
    for (const texto of textos) {
      const hallazgos = checkProhibitedTerms(texto, lista, {
        niveles: ['A', 'B'],
        permitirFrases: true,
      });
      expect(hallazgos.map((h) => `${texto}: ${h.termino}`)).toEqual([]);
    }
  });
});
