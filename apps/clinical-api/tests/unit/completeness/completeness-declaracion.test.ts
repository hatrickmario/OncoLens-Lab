import { describe, expect, it } from 'vitest';
import {
  calcularChecklist,
  declaracionQueCumple,
  cumplimientoDelItem,
} from '../../../src/modules/completeness/completeness.rules.js';
import { createCompletenessService } from '../../../src/modules/completeness/completeness.service.js';
import type {
  CatalogoDeDatosCriticos,
  ItemDeDatoCritico,
  RegistrosDeCompletitud,
  RegistroDeDato,
  RegistrosPorEntidad,
} from '../../../src/modules/completeness/ports.js';

const SIN_TRATAMIENTO = {
  entity: 'ClinicalAttribute',
  attribute_key: 'sin_tratamiento_previo',
  value: 'si',
} as const;

const tratamientosPrevios: ItemDeDatoCritico = {
  key: 'tratamientos_previos',
  label: 'Tratamientos previos',
  cancerType: 'mama',
  destination: { entity: 'PriorTreatment' },
  satisfiedBy: [SIN_TRATAMIENTO],
  minValues: 1,
};

const registro = (
  id: string,
  columnas: RegistroDeDato['columnas'],
  resto: Partial<RegistroDeDato> = {},
): RegistroDeDato => ({
  id,
  reviewStatus: 'verificado',
  fecha: '2026-11-05',
  creadoEn: '2026-11-05T10:00:00.000000Z',
  procedencia: { entryMethod: 'manual', sourceDocumentId: null, page: null },
  columnas,
  ...resto,
});

const declaracion = (id: string, resto: Partial<RegistroDeDato> = {}): RegistroDeDato =>
  registro(id, { attribute_key: 'sin_tratamiento_previo', value: 'si' }, resto);

const conDeclaraciones = (...declaraciones: RegistroDeDato[]): RegistrosPorEntidad => ({
  ClinicalAttribute: declaraciones,
  PriorTreatment: [],
});

describe('declaracionQueCumple', () => {
  it('devuelve undefined cuando el ítem no declara satisfiedBy', () => {
    const sinCatalogo = { ...tratamientosPrevios, satisfiedBy: undefined };

    expect(declaracionQueCumple(sinCatalogo, conDeclaraciones(declaracion('d-1')))).toBeUndefined();
  });

  it('devuelve la declaración vigente cuando coinciden la entidad, la clave y el valor', () => {
    const vigente = declaracion('d-1');

    expect(declaracionQueCumple(tratamientosPrevios, conDeclaraciones(vigente))).toBe(vigente);
  });

  it.each(['reemplazado', 'rechazado'])(
    'devuelve undefined cuando la única declaración está %s [RN-07]',
    (reviewStatus) => {
      const descartada = declaracion('d-1', { reviewStatus });

      expect(
        declaracionQueCumple(tratamientosPrevios, conDeclaraciones(descartada)),
      ).toBeUndefined();
    },
  );

  it.each([
    ['otra clave', { attribute_key: 'estado_menopausico', value: 'si' }],
    ['otro valor', { attribute_key: 'sin_tratamiento_previo', value: 'no' }],
  ])('devuelve undefined cuando el registro tiene %s', (_caso, columnas) => {
    expect(
      declaracionQueCumple(tratamientosPrevios, conDeclaraciones(registro('d-1', columnas))),
    ).toBeUndefined();
  });

  it('devuelve undefined cuando la entidad de la declaración no se leyó', () => {
    expect(declaracionQueCumple(tratamientosPrevios, { PriorTreatment: [] })).toBeUndefined();
  });

  it('devuelve la declaración más reciente cuando hay varias vigentes', () => {
    const antigua = declaracion('d-1', { fecha: '2026-10-01' });
    const reciente = declaracion('d-2', { fecha: '2026-11-05' });

    expect(declaracionQueCumple(tratamientosPrevios, conDeclaraciones(antigua, reciente))).toBe(
      reciente,
    );
  });
});

describe('cumplimientoDelItem', () => {
  const tratamiento = registro('t-1', { regimen_name: 'Régimen sintético' });

  it('resuelve por registro cuando el destino alcanza minValues aunque haya una declaración vigente', () => {
    const registros = { ClinicalAttribute: [declaracion('d-1')], PriorTreatment: [tratamiento] };

    expect(cumplimientoDelItem(tratamientosPrevios, registros)).toEqual({
      registro: tratamiento,
      resolvedBy: 'registro',
    });
  });

  it('resuelve por declaración_de_ausencia cuando el destino no tiene filas vigentes', () => {
    const vigente = declaracion('d-1');

    expect(cumplimientoDelItem(tratamientosPrevios, conDeclaraciones(vigente))).toEqual({
      registro: vigente,
      resolvedBy: 'declaracion_de_ausencia',
    });
  });

  it('devuelve undefined cuando no hay tratamientos ni declaración vigente', () => {
    expect(cumplimientoDelItem(tratamientosPrevios, conDeclaraciones())).toBeUndefined();
  });
});

describe('calcularChecklist con satisfiedBy', () => {
  const calcular = (registros: RegistrosPorEntidad) =>
    calcularChecklist({
      cancerType: 'mama',
      items: [tratamientosPrevios],
      verifiedReviewStatuses: ['verificado', 'corregido'],
      registros,
    }).map((estado) => estado.status);

  it('marca presente_verificado cuando la declaración vigente está verificada', () => {
    expect(calcular(conDeclaraciones(declaracion('d-1')))).toEqual(['presente_verificado']);
  });

  it('marca presente_sin_verificar cuando la declaración vigente requiere revisión', () => {
    const pendiente = declaracion('d-1', { reviewStatus: 'requiere_revision' });

    expect(calcular(conDeclaraciones(pendiente))).toEqual(['presente_sin_verificar']);
  });

  it('marca faltante cuando la declaración fue reemplazada', () => {
    const reemplazada = declaracion('d-1', { reviewStatus: 'reemplazado' });

    expect(calcular(conDeclaraciones(reemplazada))).toEqual(['faltante']);
  });
});

describe('CompletenessService.calcularVarios con satisfiedBy', () => {
  const diagnostico = (tipo: string): RegistroDeDato =>
    registro(`dx-${tipo}`, { cancer_type: tipo, histology: 'x' });
  const catalogo: CatalogoDeDatosCriticos = {
    version: () => 'test-fake',
    deTipo: (tipo) =>
      tipo === 'mama'
        ? { verifiedReviewStatuses: ['verificado'], items: [tratamientosPrevios] }
        : undefined,
  };

  /** Fake que cumple el contrato del puerto: una anotación por llamada y una clave por cada entidad pedida. */
  function registrosFalsos(declaraciones: ReadonlySet<string>) {
    const pedidos: { ids: readonly string[]; entidades: readonly string[] }[] = [];
    const registros: RegistrosDeCompletitud = {
      existenPacientes: async (ids) => new Set(ids),
      registrosVariosSinFiltrarPorRevision: async (ids, entidades) => {
        pedidos.push({ ids, entidades });
        return new Map(
          ids.map((id): [string, RegistrosPorEntidad] => [
            id,
            Object.fromEntries(
              entidades.map((entidad) => [
                entidad,
                entidad === 'Diagnosis'
                  ? [diagnostico('mama')]
                  : entidad === 'ClinicalAttribute' && declaraciones.has(id)
                    ? [declaracion(`d-${id}`)]
                    : [],
              ]),
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

  it('lee la entidad de la declaración junto al destino cuando el catálogo declara satisfiedBy', async () => {
    const { registros, pedidos } = registrosFalsos(new Set(['p-1']));

    await servicioCon(registros).calcularVarios(['p-1']);

    expect(pedidos.map((pedido) => [...pedido.entidades].sort())).toEqual([
      ['Diagnosis'],
      ['ClinicalAttribute', 'PriorTreatment'],
    ]);
  });

  it('hace las mismas lecturas con 1 que con 50 pacientes cuando el catálogo declara satisfiedBy', async () => {
    const ids = Array.from({ length: 50 }, (_, i) => `p-${i}`);
    const uno = registrosFalsos(new Set());
    const muchos = registrosFalsos(new Set(ids));

    await servicioCon(uno.registros).calcularVarios(['p-0']);
    await servicioCon(muchos.registros).calcularVarios(ids);

    expect(muchos.pedidos).toHaveLength(uno.pedidos.length);
    expect(muchos.pedidos.map((pedido) => pedido.entidades)).toEqual(
      uno.pedidos.map((pedido) => pedido.entidades),
    );
  });

  it('cumple por declaración solo a los pacientes que la tienen cuando se calculan en lote', async () => {
    const { registros } = registrosFalsos(new Set(['p-1']));

    const lote = await servicioCon(registros).calcularVarios(['p-1', 'p-2']);

    const estado = (id: string) => {
      const resultado = lote.get(id);
      if (resultado?.estado !== 'ok') throw new Error('se esperaba ok');
      return resultado.checklist.items[0];
    };
    expect(estado('p-1')).toMatchObject({
      status: 'presente_verificado',
      resolvedBy: 'declaracion_de_ausencia',
    });
    expect(estado('p-2')).toMatchObject({ status: 'faltante' });
    expect(estado('p-2')).not.toHaveProperty('resolvedBy');
  });
});
