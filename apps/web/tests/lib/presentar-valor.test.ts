import { describe, expect, it } from 'vitest';
import type { CitedSource } from '../../../../packages/api-contracts/src/types/clinical-api';
import { presentarValor } from '../../lib/evidence/presentar-valor';

const citas = [
  { chunkId: 'c1', publishedAt: '2024-03-15', sampleSize: null },
  { chunkId: 'c2', publishedAt: null, sampleSize: 120 },
] as unknown as CitedSource[];
const SIN_DATOS = { conDatosDelFragmento: false, conAlcance: false };

describe('presentarValor', () => {
  it('numera el fragmento por su posición entre las citas de la tarjeta', () => {
    const valor = { value: 'positivo', chunkId: 'c2', scope: 'elegibilidad' as const };

    expect(presentarValor(valor, citas, SIN_DATOS).texto).toBe('positivo · Fragmento [2]');
  });

  it('omite el fragmento cuando el valor no tiene fragmento citado', () => {
    const valor = { value: 'positivo', chunkId: null, scope: 'elegibilidad' as const };

    expect(presentarValor(valor, citas, SIN_DATOS).texto).toBe('positivo');
  });

  it('antepone el alcance cuando el valor es de contexto y se pide', () => {
    const valor = { value: 'TNBC', chunkId: 'c1', scope: 'subgrupo' as const };

    expect(presentarValor(valor, citas, { ...SIN_DATOS, conAlcance: true }).texto).toBe(
      'subgrupo «TNBC» · Fragmento [1]',
    );
  });

  it('añade fecha y tamaño de muestra solo si constan en el fragmento cuando se piden', () => {
    const conDatos = { ...SIN_DATOS, conDatosDelFragmento: true };
    const primero = { value: 'a', chunkId: 'c1', scope: 'elegibilidad' as const };
    const segundo = { value: 'b', chunkId: 'c2', scope: 'elegibilidad' as const };

    expect(presentarValor(primero, citas, conDatos).texto).toBe(
      'a · Fragmento [1] · Publicado: 2024-03-15',
    );
    expect(presentarValor(segundo, citas, conDatos).texto).toBe(
      'b · Fragmento [2] · Tamaño de muestra: 120',
    );
  });
});
