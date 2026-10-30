import { describe, expect, it } from 'vitest';
import { createCompletenessService } from '../../../src/modules/completeness/completeness.service.js';
import type {
  CatalogoDeDatosCriticos,
  ItemDeDatoCritico,
  RegistroDeDato,
  RegistrosDeCompletitud,
} from '../../../src/modules/completeness/ports.js';

const item = (key: string, entity: string): ItemDeDatoCritico => ({
  key,
  label: key,
  cancerType: 'mama',
  destination: { entity, field: 'value' },
  minValues: 1,
});

const catalogo: CatalogoDeDatosCriticos = {
  version: () => 'test-fake',
  deTipo: () => ({
    verifiedReviewStatuses: ['verificado'],
    items: [
      item('histologia', 'Diagnosis'),
      item('re', 'Biomarker'),
      item('rp', 'Biomarker'),
      item('menopausia', 'ClinicalAttribute'),
    ],
  }),
};

const registro = (id: string, fecha: string, tipo: string): RegistroDeDato => ({
  id,
  reviewStatus: 'verificado',
  fecha,
  creadoEn: '2026-01-01T00:00:00.000000Z',
  procedencia: { entryMethod: 'seed', sourceDocumentId: null, page: null },
  columnas: { cancer_type: tipo, value: 'x' },
});

function servicioQueAnota(diagnosticos: RegistroDeDato[]) {
  const pedidos: (readonly string[])[] = [];
  const registros: RegistrosDeCompletitud = {
    existePaciente: async () => true,
    registrosSinFiltrarPorRevision: async (_patientId, entidades) => {
      pedidos.push(entidades);
      return Object.fromEntries(
        [...new Set(entidades)].map((entidad) => [
          entidad,
          entidad === 'Diagnosis' ? diagnosticos : [],
        ]),
      );
    },
  };
  const servicio = createCompletenessService({
    registros,
    catalogo,
    tiposHabilitados: { estaHabilitado: () => true },
  });
  return { servicio, pedidos };
}

describe('lecturas del CompletenessService', () => {
  it('pide primero Diagnosis y después solo las entidades de destino distintas de Diagnosis, sin repetirlas', async () => {
    const { servicio, pedidos } = servicioQueAnota([registro('d-1', '2026-01-01', 'mama')]);

    await servicio.calcular('p-1');

    expect(pedidos).toEqual([['Diagnosis'], ['Biomarker', 'ClinicalAttribute']]);
  });

  it('marca faltante a los ítems de una entidad sin filas cuando el puerto devuelve [] para ella', async () => {
    const { servicio } = servicioQueAnota([registro('d-1', '2026-01-01', 'mama')]);

    const { items } = await servicio.calcular('p-1');

    expect(items.map((i) => [i.key, i.status])).toEqual([
      ['histologia', 'presente_verificado'],
      ['re', 'faltante'],
      ['rp', 'faltante'],
      ['menopausia', 'faltante'],
    ]);
  });
});
