import { describe, expect, it } from 'vitest';
import { createCompletenessService } from '../../../src/modules/completeness/completeness.service.js';
import type {
  CatalogoDeDatosCriticos,
  RegistroDeDato,
  RegistrosDeCompletitud,
} from '../../../src/modules/completeness/ports.js';
import { registrosDeCompletitudFalsos } from '../../support/registros-de-completitud-falsos.js';

const catalogo: CatalogoDeDatosCriticos = {
  version: () => 'test-fake',
  deTipo: () => ({
    verifiedReviewStatuses: ['verificado'],
    items: [
      {
        key: 'histologia',
        label: 'Histología',
        cancerType: 'mama',
        destination: { entity: 'Diagnosis', field: 'histology' },
        minValues: 1,
        sourceDocumentTypes: ['examen'],
      },
      {
        key: 'ki67',
        label: 'Ki-67',
        cancerType: 'mama',
        destination: { entity: 'Biomarker', field: 'value' },
        minValues: 1,
        sourceDocumentTypes: ['examen'],
      },
    ],
  }),
};

const diagnostico: RegistroDeDato = {
  id: 'd-1',
  reviewStatus: 'verificado',
  fecha: '2026-01-01',
  creadoEn: '2026-01-01T00:00:00.000000Z',
  procedencia: { entryMethod: 'seed', sourceDocumentId: null, page: null },
  columnas: { cancer_type: 'mama', histology: 'ductal' },
};

/** Registros que cuentan las lecturas del tipo de vacío y fallan si se piden: el lote no debe pedirlas. */
function registrosQueRompenAlClasificarVacio() {
  const lecturas: string[] = [];
  const registros: RegistrosDeCompletitud = {
    ...registrosDeCompletitudFalsos({ diagnosticos: [diagnostico] }),
    conflictosPendientes: () => {
      lecturas.push('conflictosPendientes');
      return Promise.reject(new Error('lectura rota'));
    },
    tiposDeDocumentoProcesados: () => {
      lecturas.push('tiposDeDocumentoProcesados');
      return Promise.reject(new Error('lectura rota'));
    },
  };
  return {
    lecturas,
    servicio: createCompletenessService({
      registros,
      catalogo,
      tiposHabilitados: { estaHabilitado: () => true },
    }),
  };
}

describe('tipo de vacío fuera del lote y del contador (US-263)', () => {
  it('no lee conflictos ni documentos y deja gapType null cuando el listado calcula varios pacientes', async () => {
    const { servicio, lecturas } = registrosQueRompenAlClasificarVacio();

    const resultado = (await servicio.calcularVarios(['p-1'])).get('p-1');

    expect(lecturas).toEqual([]);
    expect(resultado?.estado).toBe('ok');
    const items = resultado?.estado === 'ok' ? resultado.checklist.items : [];
    expect(items.map((i) => [i.key, i.status, i.gapType])).toEqual([
      ['histologia', 'presente_verificado', null],
      ['ki67', 'faltante', null],
    ]);
  });

  it('no lee conflictos ni documentos cuando se calcula un solo paciente sin tipo de vacío (contador de la ficha)', async () => {
    const { servicio, lecturas } = registrosQueRompenAlClasificarVacio();

    const checklist = await servicio.calcular('p-1');

    expect(lecturas).toEqual([]);
    expect(checklist.items.filter((i) => i.status === 'faltante')).toHaveLength(1);
  });

  it('lee conflictos y documentos y falla cuando se pide el tipo de vacío y esas lecturas se rompen', async () => {
    const { servicio, lecturas } = registrosQueRompenAlClasificarVacio();

    await expect(servicio.calcularConTiposDeVacio('p-1')).rejects.toThrow('lectura rota');
    expect(lecturas).toContain('conflictosPendientes');
  });
});
