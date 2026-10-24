import { describe, expect, it } from 'vitest';
import { createCompletenessService } from '../../../src/modules/completeness/completeness.service.js';
import type {
  CatalogoDeDatosCriticos,
  RegistroDeDato,
  RegistrosDeCompletitud,
} from '../../../src/modules/completeness/ports.js';

const catalogo: CatalogoDeDatosCriticos = {
  version: () => 'test-fake',
  deTipo: (tipo) =>
    tipo === 'mama'
      ? {
          verifiedReviewStatuses: ['verificado'],
          items: [
            {
              key: 'histologia',
              cancerType: 'mama',
              destination: { entity: 'Diagnosis', field: 'histology' },
              minValues: 1,
            },
          ],
        }
      : undefined,
};

const diagnostico = (tipo: string): RegistroDeDato => ({
  id: 'd-1',
  reviewStatus: 'verificado',
  fecha: null,
  creadoEn: '2026-01-01T00:00:00.000000Z',
  columnas: { cancer_type: tipo, histology: 'x' },
});

const registrosCon = (diagnosticos: RegistroDeDato[]): RegistrosDeCompletitud => ({
  registrosSinFiltrarPorRevision: async () => ({ Diagnosis: diagnosticos }),
});

describe('CompletenessService', () => {
  it('devuelve items vacíos con la catalogVersion cuando el paciente no tiene diagnóstico activo', async () => {
    const servicio = createCompletenessService({ registros: registrosCon([]), catalogo });

    expect(await servicio.calcular('p-1')).toEqual({ catalogVersion: 'test-fake', items: [] });
  });

  it('devuelve items vacíos cuando el tipo del diagnóstico no está en el catálogo', async () => {
    const servicio = createCompletenessService({
      registros: registrosCon([diagnostico('leucemia')]),
      catalogo,
    });

    expect(await servicio.calcular('p-1')).toEqual({ catalogVersion: 'test-fake', items: [] });
  });

  it('calcula los ítems del tipo activo cuando el diagnóstico está en el catálogo', async () => {
    const servicio = createCompletenessService({
      registros: registrosCon([diagnostico('mama')]),
      catalogo,
    });

    expect(await servicio.calcular('p-1')).toEqual({
      catalogVersion: 'test-fake',
      items: [{ key: 'histologia', status: 'presente_verificado' }],
    });
  });
});
