import { describe, expect, it } from 'vitest';
import type { CitedSource } from '../../../../packages/api-contracts/src/types/clinical-api';
import { numeroONoDisponible, valorONoDisponible } from '../../lib/evidence/procedencia';
import { presentarValor } from '../../lib/evidence/presentar-valor';

const citas = [
  {
    chunkId: 'c1',
    sourceName: 'NCI PDQ',
    externalId: 'doc-1',
    publishedAt: '2024-03-15',
    sampleSize: null,
  },
  { chunkId: 'c2', sourceName: 'NCI PDQ', externalId: 'doc-1', publishedAt: null, sampleSize: 120 },
] as unknown as CitedSource[];
const SIN_DATOS = { conDatosDelFragmento: false };

describe('presentarValor', () => {
  it('numera el fragmento por su posición y nombra la fuente cuando el valor cita un fragmento de la opción', () => {
    const valor = { value: 'positivo', chunkId: 'c2', scope: 'elegibilidad' as const };

    expect(presentarValor(valor, citas, SIN_DATOS).texto).toBe(
      'positivo · Fragmento [2] · según NCI PDQ · doc-1',
    );
  });

  it('rotula fragmento no disponible cuando el valor no tiene fragmento citado', () => {
    const valor = { value: 'positivo', chunkId: null, scope: 'elegibilidad' as const };

    expect(presentarValor(valor, citas, SIN_DATOS).texto).toBe(
      'positivo · valor extraído por IA; fragmento no disponible',
    );
  });

  it('antepone el alcance cuando el valor no es de elegibilidad', () => {
    const valor = { value: 'TNBC', chunkId: 'c1', scope: 'subgrupo' as const };

    expect(presentarValor(valor, citas, SIN_DATOS).texto).toBe(
      'subgrupo «TNBC» · Fragmento [1] · según NCI PDQ · doc-1',
    );
  });

  it('añade fecha en es-ES y tamaño de muestra del estudio, o No disponible, cuando se piden los datos del fragmento', () => {
    const conDatos = { conDatosDelFragmento: true };
    const primero = { value: 'a', chunkId: 'c1', scope: 'elegibilidad' as const };
    const segundo = { value: 'b', chunkId: 'c2', scope: 'elegibilidad' as const };

    expect(presentarValor(primero, citas, conDatos).texto).toBe(
      'a · Fragmento [1] · según NCI PDQ · doc-1 · Publicado: 15/03/2024 · Tamaño de muestra del estudio: No disponible',
    );
    expect(presentarValor(segundo, citas, conDatos).texto).toBe(
      'b · Fragmento [2] · según NCI PDQ · doc-1 · Publicado: No disponible · Tamaño de muestra del estudio: 120',
    );
  });

  it.each([
    ['publishedAt null', null, 0],
    ['publishedAt cadena vacía', '', 0],
    ['publishedAt en blanco', '   ', 0],
    ['publishedAt ausente y sampleSize null', null, null],
  ])(
    'trata el metadato ausente como procedencia cuando %s (RN-25)',
    (_caso, publishedAt, sampleSize) => {
      const cita = { ...citas[0], publishedAt, sampleSize } as unknown as CitedSource;
      const valor = { value: 'a', chunkId: 'c1', scope: 'elegibilidad' as const };

      const { texto } = presentarValor(valor, [cita], { conDatosDelFragmento: true });

      expect(texto).toContain(`Publicado: ${valorONoDisponible(publishedAt)}`);
      expect(texto).toContain(`Tamaño de muestra del estudio: ${numeroONoDisponible(sampleSize)}`);
      expect(valorONoDisponible(publishedAt)).toBe('No disponible');
    },
  );

  it('muestra 0 como tamaño de muestra y no No disponible cuando sampleSize es 0, igual que procedencia', () => {
    const cita = { ...citas[0], sampleSize: 0 } as unknown as CitedSource;
    const valor = { value: 'a', chunkId: 'c1', scope: 'elegibilidad' as const };

    expect(presentarValor(valor, [cita], { conDatosDelFragmento: true }).texto).toContain(
      'Tamaño de muestra del estudio: 0',
    );
  });
});
