import { describe, expect, it } from 'vitest';
import { PacienteNoEncontradoError } from '../../../src/modules/compartido/pacientes.errores.js';
import { registrosDeCompletitudFalsos } from '../../support/registros-de-completitud-falsos.js';
import { createCompletenessService } from '../../../src/modules/completeness/completeness.service.js';
import type {
  CatalogoDeDatosCriticos,
  RegistroDeDato,
  RegistrosDeCompletitud,
  RegistrosPorEntidad,
} from '../../../src/modules/completeness/ports.js';

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
              sourceDocumentTypes: ['examen'],
            },
            {
              key: tipo === 'mama' ? 're' : 'psa',
              label: 'Marcador',
              cancerType: tipo,
              destination: { entity: tipo === 'mama' ? 'Biomarker' : 'ClinicalAttribute' },
              minValues: 1,
              sourceDocumentTypes: ['examen'],
            },
          ],
        }
      : undefined,
};

const diagnostico = (tipo: string): RegistroDeDato => ({
  id: `d-${tipo}`,
  reviewStatus: 'verificado',
  fecha: null,
  creadoEn: '2026-01-01T00:00:00.000000Z',
  procedencia: { entryMethod: 'seed', sourceDocumentId: null, page: null },
  columnas: { cancer_type: tipo, histology: 'x' },
});

interface Pedido {
  readonly ids: readonly string[];
  readonly entidades: readonly string[];
}

/** Registros en memoria por paciente; cada llamada del puerto queda anotada y `fallanEntidades` simula un fallo de lectura. */
function registrosDe(
  diagnosticos: Record<string, RegistroDeDato[]>,
  opciones: { fallanEntidades?: string; existen?: string[] } = {},
) {
  const pedidos: Pedido[] = [];
  const registros: RegistrosDeCompletitud = {
    existenPacientes: async (ids) => new Set(ids.filter((id) => opciones.existen?.includes(id))),
    conflictosPendientes: async (ids) => new Map(ids.map((id) => [id, {}])),
    tiposDeDocumentoProcesados: async (ids) => new Map(ids.map((id) => [id, new Set<string>()])),
    registrosVariosSinFiltrarPorRevision: async (ids, entidades) => {
      pedidos.push({ ids, entidades });
      if (opciones.fallanEntidades !== undefined && entidades.includes(opciones.fallanEntidades)) {
        throw new Error('lectura rota');
      }
      return new Map(
        ids.map((id): [string, RegistrosPorEntidad] => [
          id,
          Object.fromEntries(
            entidades.map((e) => [e, e === 'Diagnosis' ? (diagnosticos[id] ?? []) : []]),
          ),
        ]),
      );
    },
  };
  return { registros, pedidos };
}

const servicioCon = (registros: RegistrosDeCompletitud) =>
  createCompletenessService({
    registros,
    catalogo,
    tiposHabilitados: { estaHabilitado: () => true },
  });

describe('CompletenessService.calcularVarios', () => {
  it('devuelve un mapa vacío sin leer nada cuando la lista de pacientes está vacía', async () => {
    const { registros, pedidos } = registrosDe({});

    const resultado = await servicioCon(registros).calcularVarios([]);

    expect(resultado.size).toBe(0);
    expect(pedidos).toEqual([]);
  });

  it('devuelve para un paciente el mismo checklist que calcular', async () => {
    const { registros } = registrosDe({ 'p-1': [diagnostico('mama')] });
    const servicio = servicioCon(registros);

    const lote = await servicio.calcularVarios(['p-1']);

    expect(lote.get('p-1')).toEqual({
      estado: 'ok',
      checklist: await servicio.calcular('p-1'),
    });
  });

  it('lee Diagnosis una vez y las demás entidades una vez por tipo de cáncer cuando los pacientes son de dos tipos', async () => {
    const { registros, pedidos } = registrosDe({
      'p-1': [diagnostico('mama')],
      'p-2': [diagnostico('prostata')],
      'p-3': [diagnostico('mama')],
    });

    const lote = await servicioCon(registros).calcularVarios(['p-1', 'p-2', 'p-3']);

    expect(pedidos).toEqual([
      { ids: ['p-1', 'p-2', 'p-3'], entidades: ['Diagnosis'] },
      { ids: ['p-1', 'p-3'], entidades: ['Biomarker'] },
      { ids: ['p-2'], entidades: ['ClinicalAttribute'] },
    ]);
    expect([...lote.keys()]).toEqual(['p-1', 'p-2', 'p-3']);
  });

  it('devuelve una sola entrada cuando el mismo paciente se pide dos veces', async () => {
    const { registros, pedidos } = registrosDe({ 'p-1': [diagnostico('mama')] });

    const lote = await servicioCon(registros).calcularVarios(['p-1', 'p-1']);

    expect(lote.size).toBe(1);
    expect(pedidos[0]?.ids).toEqual(['p-1']);
  });

  it('marca no_disponible con PacienteNoEncontradoError al paciente inexistente y deja ok a los demás', async () => {
    const { registros } = registrosDe(
      { 'p-1': [diagnostico('mama')] },
      { existen: ['p-sin-diagnostico'] },
    );

    const lote = await servicioCon(registros).calcularVarios([
      'p-1',
      'p-sin-diagnostico',
      'p-fantasma',
    ]);

    expect(lote.get('p-1')?.estado).toBe('ok');
    expect(lote.get('p-sin-diagnostico')).toEqual({
      estado: 'ok',
      checklist: { catalogVersion: 'test-fake', cancerTypeEnabled: false, items: [] },
    });
    const inexistente = lote.get('p-fantasma');
    expect(inexistente?.estado).toBe('no_disponible');
    expect(inexistente?.estado === 'no_disponible' && inexistente.error).toBeInstanceOf(
      PacienteNoEncontradoError,
    );
  });

  it('marca no_disponible solo a los pacientes del tipo cuya lectura falla y deja ok a los de otro tipo', async () => {
    const { registros } = registrosDe(
      { 'p-1': [diagnostico('mama')], 'p-2': [diagnostico('prostata')] },
      { fallanEntidades: 'ClinicalAttribute' },
    );

    const lote = await servicioCon(registros).calcularVarios(['p-1', 'p-2']);

    expect(lote.get('p-1')?.estado).toBe('ok');
    expect(lote.get('p-2')?.estado).toBe('no_disponible');
  });

  it('rechaza el lote entero cuando falla la lectura de los diagnósticos', async () => {
    const { registros } = registrosDe({}, { fallanEntidades: 'Diagnosis' });

    await expect(servicioCon(registros).calcularVarios(['p-1'])).rejects.toThrow('lectura rota');
  });
});

describe('CompletenessService.calcularVarios con el fake del puerto', () => {
  it('devuelve checklists distintos cuando dos pacientes tienen diagnósticos de distinto tipo', async () => {
    const registros = registrosDeCompletitudFalsos({
      diagnosticos: { 'p-1': [diagnostico('mama')], 'p-2': [diagnostico('prostata')] },
    });

    const lote = await servicioCon(registros).calcularVarios(['p-1', 'p-2']);

    const clavesDe = (id: string) => {
      const resultado = lote.get(id);
      return resultado?.estado === 'ok' ? resultado.checklist.items.map((i) => i.key) : [];
    };
    expect(clavesDe('p-1')).toEqual(['histologia', 're']);
    expect(clavesDe('p-2')).toEqual(['histologia', 'psa']);
  });
});

describe('CompletenessService.calcular sobre el lote', () => {
  it('relanza el error original cuando el cálculo del paciente falla', async () => {
    const { registros } = registrosDe(
      { 'p-1': [diagnostico('mama')] },
      { fallanEntidades: 'Biomarker' },
    );

    await expect(servicioCon(registros).calcular('p-1')).rejects.toThrow('lectura rota');
  });

  it('lanza PacienteNoEncontradoError cuando el paciente no existe', async () => {
    const { registros } = registrosDe({});

    await expect(servicioCon(registros).calcular('p-fantasma')).rejects.toBeInstanceOf(
      PacienteNoEncontradoError,
    );
  });
});
