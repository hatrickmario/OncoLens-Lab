import { describe, expect, it } from 'vitest';
import { createCompletenessService } from '../../../src/modules/completeness/completeness.service.js';
import type {
  CatalogoDeDatosCriticos,
  RegistroDeDato,
  RegistrosDeCompletitud,
} from '../../../src/modules/completeness/ports.js';
import { PacienteNoEncontradoError } from '../../../src/modules/patients/patients.errores.js';

const catalogo: CatalogoDeDatosCriticos = {
  version: () => 'test-fake',
  deTipo: (tipo) =>
    tipo === 'mama' || tipo === 'prostata'
      ? {
          verifiedReviewStatuses: ['verificado'],
          items: [
            {
              key: 'histologia',
              label: 'Histología',
              cancerType: tipo,
              destination: { entity: 'Diagnosis', field: 'histology' },
              minValues: 1,
            },
          ],
        }
      : undefined,
};

const habilitados = (...tipos: string[]) => ({
  estaHabilitado: (tipo: string) => tipos.includes(tipo),
});

const diagnostico = (tipo: string): RegistroDeDato => ({
  id: 'd-1',
  reviewStatus: 'verificado',
  fecha: null,
  creadoEn: '2026-01-01T00:00:00.000000Z',
  procedencia: { entryMethod: 'seed', sourceDocumentId: null, page: null },
  columnas: { cancer_type: tipo, histology: 'x' },
});

/** Cumple el contrato del puerto: una clave por cada entidad pedida (`[]` si no hay filas), nada más. */
const registrosCon = (
  diagnosticos: RegistroDeDato[],
  existe = true,
  pedidos: (readonly string[])[] = [],
): RegistrosDeCompletitud => ({
  existePaciente: async () => existe,
  registrosSinFiltrarPorRevision: async (_patientId, entidades) => {
    pedidos.push(entidades);
    return Object.fromEntries(
      [...new Set(entidades)].map((entidad) => [
        entidad,
        entidad === 'Diagnosis' ? diagnosticos : [],
      ]),
    );
  },
});

const servicioCon = (
  diagnosticos: RegistroDeDato[],
  tipos: string[] = ['mama', 'prostata'],
  existe = true,
) =>
  createCompletenessService({
    registros: registrosCon(diagnosticos, existe),
    catalogo,
    tiposHabilitados: habilitados(...tipos),
  });

describe('CompletenessService', () => {
  it('devuelve items vacíos y cancerTypeEnabled false con la catalogVersion cuando el paciente no tiene diagnóstico activo', async () => {
    expect(await servicioCon([]).calcular('p-1')).toEqual({
      catalogVersion: 'test-fake',
      cancerTypeEnabled: false,
      items: [],
    });
  });

  it('devuelve items vacíos y cancerTypeEnabled false cuando el tipo del diagnóstico no está en el catálogo', async () => {
    expect(await servicioCon([diagnostico('leucemia')]).calcular('p-1')).toEqual({
      catalogVersion: 'test-fake',
      cancerTypeEnabled: false,
      items: [],
    });
  });

  it('devuelve items vacíos y cancerTypeEnabled false cuando el tipo está en el catálogo pero no en ENABLED_CANCER_TYPES', async () => {
    const servicio = servicioCon([diagnostico('mama')], ['prostata']);

    expect(await servicio.calcular('p-1')).toEqual({
      catalogVersion: 'test-fake',
      cancerTypeEnabled: false,
      items: [],
    });
  });

  it('calcula los ítems del tipo activo con etiqueta y procedencia cuando el diagnóstico está habilitado', async () => {
    expect(await servicioCon([diagnostico('mama')]).calcular('p-1')).toEqual({
      catalogVersion: 'test-fake',
      cancerTypeEnabled: true,
      items: [
        {
          key: 'histologia',
          label: 'Histología',
          status: 'presente_verificado',
          origin: 'seed',
          provenance: {
            entryMethod: 'seed',
            reviewStatus: 'verificado',
            sourceDocumentId: null,
          },
          destination: { entity: 'Diagnosis', field: 'histology' },
          condition: null,
        },
      ],
    });
  });

  it('lanza PacienteNoEncontradoError cuando no hay diagnóstico y el paciente no existe', async () => {
    await expect(servicioCon([], ['mama'], false).calcular('p-1')).rejects.toBeInstanceOf(
      PacienteNoEncontradoError,
    );
  });

  it('no consulta la existencia del paciente cuando ya leyó un diagnóstico suyo', async () => {
    let consultas = 0;
    const registros: RegistrosDeCompletitud = {
      existePaciente: async () => {
        consultas += 1;
        return true;
      },
      registrosSinFiltrarPorRevision: async () => ({ Diagnosis: [diagnostico('mama')] }),
    };
    const servicio = createCompletenessService({
      registros,
      catalogo,
      tiposHabilitados: habilitados('mama'),
    });

    await servicio.calcular('p-1');

    expect(consultas).toBe(0);
  });
});
