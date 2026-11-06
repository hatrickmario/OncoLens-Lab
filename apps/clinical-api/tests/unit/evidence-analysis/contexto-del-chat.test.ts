import { describe, expect, it } from 'vitest';
import {
  compararBiomarcadores,
  construirContextoDelChat,
  construirContextoPermitido,
} from '../../../src/modules/evidence-analysis/clinical-context.builder.js';
import { AHORA_DE_EJEMPLO, biomarcadorDeEjemplo, casoDeEjemplo } from './casos.js';

const serie = [
  biomarcadorDeEjemplo({ id: 'b3', value: '28', performedAt: '2026-04-10' }),
  biomarcadorDeEjemplo({ id: 'b1', value: '22', performedAt: '2026-02-09' }),
  biomarcadorDeEjemplo({ id: 'b2', value: '25', performedAt: '2026-03-11' }),
];

describe('compararBiomarcadores', () => {
  it('ordena por fecha del examen cuando las fechas difieren', () => {
    const [a, b] = [serie[1]!, serie[0]!];

    expect(compararBiomarcadores(a, b)).toBeLessThan(0);
    expect(compararBiomarcadores(b, a)).toBeGreaterThan(0);
  });

  it('desempata por la creación del registro cuando el examen es de la misma fecha', () => {
    const antes = biomarcadorDeEjemplo({ id: 'x1', createdAt: '2026-04-10T08:00:00.000Z' });
    const despues = biomarcadorDeEjemplo({ id: 'x2', createdAt: '2026-04-10T09:00:00.000Z' });

    expect(compararBiomarcadores(antes, despues)).toBeLessThan(0);
    expect(compararBiomarcadores(despues, antes)).toBeGreaterThan(0);
    expect(compararBiomarcadores(antes, antes)).toBe(0);
  });
});

describe('construirContextoDelChat', () => {
  const caso = casoDeEjemplo({ biomarcadores: serie });

  it('conserva toda la serie vigente de cada biomarcador en orden cronológico', () => {
    const { contexto } = construirContextoDelChat(caso, AHORA_DE_EJEMPLO, []);

    expect(contexto.biomarkers.map((b) => b.value)).toEqual(['22', '25', '28']);
  });

  it('deja al contexto del análisis con solo el último valor de cada biomarcador', () => {
    const { contexto } = construirContextoPermitido(caso, AHORA_DE_EJEMPLO, []);

    expect(contexto.biomarkers.map((b) => b.value)).toEqual(['28']);
  });
});
