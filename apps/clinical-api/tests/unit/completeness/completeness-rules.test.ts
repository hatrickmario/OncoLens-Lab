import { describe, expect, it } from 'vitest';
import {
  CatalogoInconsistenteError,
  calcularChecklist,
  estadoDeVerificacion,
  evaluarCondicion,
  itemsDelTipoActivo,
  registroQueCuenta,
  registrosDelDestino,
  registrosVigentes,
  tipoDeCancerActivo,
} from '../../../src/modules/completeness/completeness.rules.js';
import type {
  CondicionDeItem,
  ItemDeDatoCritico,
  RegistroDeDato,
  ValorDeColumna,
} from '../../../src/modules/completeness/ports.js';

const VERIFICADOS = ['verificado', 'corregido'];

function registro(resto: {
  id?: string;
  reviewStatus?: string;
  fecha?: string | null;
  creadoEn?: string;
  columnas?: Record<string, ValorDeColumna>;
}): RegistroDeDato {
  return {
    id: resto.id ?? 'r-1',
    reviewStatus: resto.reviewStatus ?? 'verificado',
    fecha: resto.fecha === undefined ? '2026-01-01' : resto.fecha,
    creadoEn: resto.creadoEn ?? '2026-01-01T00:00:00.000000Z',
    columnas: resto.columnas ?? {},
  };
}

function item(clave: string, resto: Partial<ItemDeDatoCritico> = {}): ItemDeDatoCritico {
  return {
    key: clave,
    cancerType: 'mama',
    destination: { entity: 'PriorTreatment' },
    minValues: 1,
    ...resto,
  };
}

describe('registrosVigentes (RN-07)', () => {
  it('excluye los registros rechazados y reemplazados cuando se filtran', () => {
    const registros = [
      registro({ id: 'a', reviewStatus: 'rechazado' }),
      registro({ id: 'b', reviewStatus: 'reemplazado' }),
      registro({ id: 'c', reviewStatus: 'requiere_revision' }),
      registro({ id: 'd', reviewStatus: 'auto_aceptado' }),
    ];

    expect(registrosVigentes(registros).map((r) => r.id)).toEqual(['c', 'd']);
  });
});

describe('tipoDeCancerActivo', () => {
  it('devuelve null cuando no hay diagnóstico activo vigente', () => {
    expect(tipoDeCancerActivo([])).toBeNull();
    expect(
      tipoDeCancerActivo([
        registro({ reviewStatus: 'rechazado', columnas: { cancer_type: 'mama' } }),
      ]),
    ).toBeNull();
  });

  it('devuelve el tipo de cáncer del diagnóstico activo cuando existe', () => {
    expect(tipoDeCancerActivo([registro({ columnas: { cancer_type: 'prostata' } })])).toBe(
      'prostata',
    );
  });
});

describe('itemsDelTipoActivo', () => {
  it('conserva solo los ítems del tipo de cáncer activo y su orden cuando el catálogo mezcla tipos', () => {
    const items = [
      item('a', { cancerType: 'mama' }),
      item('b', { cancerType: 'prostata' }),
      item('c', { cancerType: 'mama' }),
    ];

    expect(itemsDelTipoActivo(items, 'mama').map((i) => i.key)).toEqual(['a', 'c']);
  });
});

describe('registrosDelDestino', () => {
  it('filtra por las columnas de match del destino cuando el destino las declara', () => {
    const registros = [
      registro({ id: 'ihq', columnas: { name: 'HER2', 'exam.exam_type': 'IHQ', value: '3+' } }),
      registro({ id: 'ish', columnas: { name: 'HER2', 'exam.exam_type': 'ISH', value: 'amp' } }),
    ];

    const coinciden = registrosDelDestino(
      {
        entity: 'Biomarker',
        field: 'value',
        match: { name: 'HER2', 'exam.exam_type': 'ISH' },
      },
      registros,
    );

    expect(coinciden.map((r) => r.id)).toEqual(['ish']);
  });

  it('descarta los registros sin valor en el campo de destino cuando el destino declara campo', () => {
    const registros = [
      registro({ id: 'sin', columnas: { grade: null } }),
      registro({ id: 'con', columnas: { grade: '2' } }),
    ];

    const coinciden = registrosDelDestino({ entity: 'Diagnosis', field: 'grade' }, registros);

    expect(coinciden.map((r) => r.id)).toEqual(['con']);
  });
});

describe('registroQueCuenta', () => {
  it('devuelve undefined cuando no hay registros', () => {
    expect(registroQueCuenta([])).toBeUndefined();
  });

  it('elige el de fecha más reciente cuando hay varios', () => {
    const registros = [
      registro({ id: 'viejo', fecha: '2026-01-01' }),
      registro({ id: 'nuevo', fecha: '2026-03-01' }),
    ];

    expect(registroQueCuenta(registros)?.id).toBe('nuevo');
  });

  it('trata el registro sin fecha como más antiguo que cualquiera fechado', () => {
    const registros = [
      registro({ id: 'sin-fecha', fecha: null, creadoEn: '2030-01-01T00:00:00.000000Z' }),
      registro({ id: 'fechado', fecha: '1999-01-01' }),
    ];

    expect(registroQueCuenta(registros)?.id).toBe('fechado');
  });

  it('desempata por el creado más tarde cuando la fecha es igual', () => {
    const registros = [
      registro({ id: 'a', creadoEn: '2026-05-01T00:00:00.000000Z' }),
      registro({ id: 'b', creadoEn: '2026-06-01T00:00:00.000000Z' }),
    ];

    expect(registroQueCuenta(registros)?.id).toBe('b');
  });

  it('desempata por id y es independiente del orden de entrada cuando fecha y creación son iguales', () => {
    const a = registro({ id: 'a' });
    const b = registro({ id: 'b' });

    expect(registroQueCuenta([a, b])?.id).toBe('b');
    expect(registroQueCuenta([b, a])?.id).toBe('b');
  });
});

describe('estadoDeVerificacion', () => {
  it('devuelve presente_verificado cuando el estado está en verifiedReviewStatuses', () => {
    expect(estadoDeVerificacion(registro({ reviewStatus: 'corregido' }), VERIFICADOS)).toBe(
      'presente_verificado',
    );
  });

  it('devuelve presente_sin_verificar cuando el estado no está, incluido requiere_revision', () => {
    expect(estadoDeVerificacion(registro({ reviewStatus: 'requiere_revision' }), VERIFICADOS)).toBe(
      'presente_sin_verificar',
    );
    expect(estadoDeVerificacion(registro({ reviewStatus: 'auto_aceptado' }), VERIFICADOS)).toBe(
      'presente_sin_verificar',
    );
  });
});

describe('evaluarCondicion', () => {
  const prefijo = (...values: string[]): CondicionDeItem => ({
    item: 'x',
    operator: 'prefijo',
    values,
  });

  it('devuelve no_evaluable cuando el valor referenciado es null', () => {
    expect(evaluarCondicion(prefijo('2+'), null)).toBe('no_evaluable');
  });

  it('devuelve cumple con el operador prefijo cuando el valor empieza por el prefijo', () => {
    expect(evaluarCondicion(prefijo('2+'), '2+ (IHQ)')).toBe('cumple');
  });

  it('devuelve no_cumple con el operador prefijo cuando el valor no empieza por el prefijo', () => {
    expect(evaluarCondicion(prefijo('2+'), '3+ (IHQ)')).toBe('no_cumple');
  });

  it('distingue mayúsculas y espacios cuando evalúa el prefijo', () => {
    expect(evaluarCondicion(prefijo('iv'), 'IV')).toBe('no_cumple');
    expect(evaluarCondicion(prefijo('2+'), ' 2+ (IHQ)')).toBe('no_cumple');
  });

  it('devuelve cumple con pertenencia cuando el valor es uno de los valores', () => {
    const condicion: CondicionDeItem = { item: 'x', operator: 'pertenencia', values: ['a', 'b'] };

    expect(evaluarCondicion(condicion, 'b')).toBe('cumple');
    expect(evaluarCondicion(condicion, 'c')).toBe('no_cumple');
  });

  it('compara el valor entero con igualdad cuando el operador es igualdad', () => {
    const condicion: CondicionDeItem = { item: 'x', operator: 'igualdad', values: ['IV'] };

    expect(evaluarCondicion(condicion, 'IV')).toBe('cumple');
    expect(evaluarCondicion(condicion, 'IVA')).toBe('no_cumple');
  });

  it('compara solo con el primer valor cuando igualdad trae varios values (para varios valores, pertenencia)', () => {
    const condicion: CondicionDeItem = { item: 'x', operator: 'igualdad', values: ['IV', 'V'] };

    expect(evaluarCondicion(condicion, 'IV')).toBe('cumple');
    expect(evaluarCondicion(condicion, 'V')).toBe('no_cumple');
  });

  it('lanza CatalogoInconsistenteError cuando el operador no existe', () => {
    const condicion = { item: 'x', operator: 'regex', values: ['a'] } as unknown as CondicionDeItem;

    expect(() => evaluarCondicion(condicion, 'a')).toThrow(CatalogoInconsistenteError);
  });
});

describe('calcularChecklist', () => {
  const tratamiento = (reviewStatus = 'verificado') => registro({ reviewStatus });

  it('devuelve faltante cuando hay menos registros vigentes que minValues', () => {
    const items = [item('psa', { minValues: 2 })];

    const checklist = calcularChecklist({
      cancerType: 'mama',
      items,
      verifiedReviewStatuses: VERIFICADOS,
      registros: { PriorTreatment: [tratamiento()] },
    });

    expect(checklist).toEqual([{ key: 'psa', status: 'faltante' }]);
  });

  it('no cuenta los registros rechazados ni reemplazados cuando comprueba minValues [RN-07]', () => {
    const checklist = calcularChecklist({
      cancerType: 'mama',
      items: [item('t')],
      verifiedReviewStatuses: VERIFICADOS,
      registros: { PriorTreatment: [tratamiento('rechazado'), tratamiento('reemplazado')] },
    });

    expect(checklist).toEqual([{ key: 't', status: 'faltante' }]);
  });

  it('cuenta un no_mapeado como presente sin verificar solo si su name coincide con el catálogo [RN-27]', () => {
    const ki67 = item('ki67', {
      destination: { entity: 'Biomarker', field: 'value', match: { name: 'Ki-67' } },
    });
    const sinMapear = (name: string) =>
      registro({
        reviewStatus: 'requiere_revision',
        columnas: { name, value: '30%', mapping_status: 'no_mapeado' },
      });
    const conNombre = (name: string) =>
      calcularChecklist({
        cancerType: 'mama',
        items: [ki67, item('t')],
        verifiedReviewStatuses: VERIFICADOS,
        registros: {
          Biomarker: [sinMapear(name)],
          PriorTreatment: [registro({ columnas: { mapping_status: 'no_mapeado' } })],
        },
      });

    expect(conNombre('Ki-67')).toEqual([
      { key: 'ki67', status: 'presente_sin_verificar' },
      { key: 't', status: 'presente_verificado' },
    ]);
    expect(conNombre('Ki67 índice')[0]).toEqual({ key: 'ki67', status: 'faltante' });
  });

  it('devuelve faltante cuando la entidad del destino no aparece en los registros', () => {
    const checklist = calcularChecklist({
      cancerType: 'mama',
      items: [item('t')],
      verifiedReviewStatuses: VERIFICADOS,
      registros: {},
    });

    expect(checklist).toEqual([{ key: 't', status: 'faltante' }]);
  });

  it('devuelve solo los ítems del tipo activo y conserva el orden del catálogo', () => {
    const checklist = calcularChecklist({
      cancerType: 'mama',
      items: [item('b'), item('otro', { cancerType: 'prostata' }), item('a')],
      verifiedReviewStatuses: VERIFICADOS,
      registros: { PriorTreatment: [tratamiento()] },
    });

    expect(checklist.map((i) => i.key)).toEqual(['b', 'a']);
  });

  const diagnosticoConTnm = (stage: string | null) =>
    registro({ columnas: { stage_value: stage } });
  const itemTnm = item('tnm', { destination: { entity: 'Diagnosis', field: 'stage_value' } });
  const itemCondicionado = (cuandoNoSePuede: 'faltante' | 'no_aplica') =>
    item('dependiente', {
      condition: { item: 'tnm', operator: 'prefijo', values: ['IV'] },
      whenConditionUnknown: cuandoNoSePuede,
    });

  it('devuelve no_aplica cuando la condición no se cumple', () => {
    const checklist = calcularChecklist({
      cancerType: 'mama',
      items: [itemTnm, itemCondicionado('faltante')],
      verifiedReviewStatuses: VERIFICADOS,
      registros: { Diagnosis: [diagnosticoConTnm('IIA')], PriorTreatment: [tratamiento()] },
    });

    expect(checklist[1]).toEqual({ key: 'dependiente', status: 'no_aplica' });
  });

  it('evalúa el estado propio del ítem cuando la condición se cumple', () => {
    const checklist = calcularChecklist({
      cancerType: 'mama',
      items: [itemTnm, itemCondicionado('no_aplica')],
      verifiedReviewStatuses: VERIFICADOS,
      registros: {
        Diagnosis: [diagnosticoConTnm('IV')],
        PriorTreatment: [tratamiento('requiere_revision')],
      },
    });

    expect(checklist[1]).toEqual({ key: 'dependiente', status: 'presente_sin_verificar' });
  });

  it('aplica el whenConditionUnknown de cada ítem cuando el dato condicionante falta', () => {
    const datos = { Diagnosis: [diagnosticoConTnm(null)], PriorTreatment: [tratamiento()] };
    const resultadoCon = (cuando: 'faltante' | 'no_aplica') =>
      calcularChecklist({
        cancerType: 'mama',
        items: [itemTnm, itemCondicionado(cuando)],
        verifiedReviewStatuses: VERIFICADOS,
        registros: datos,
      })[1];

    expect(resultadoCon('faltante')).toEqual({ key: 'dependiente', status: 'faltante' });
    expect(resultadoCon('no_aplica')).toEqual({ key: 'dependiente', status: 'no_aplica' });
  });

  it('evalúa la condición sobre el registro más reciente aunque no esté verificado', () => {
    const diagnosticos = [
      registro({ id: 'viejo', fecha: '2026-01-01', columnas: { stage_value: 'IV' } }),
      registro({
        id: 'nuevo',
        fecha: '2026-06-01',
        reviewStatus: 'requiere_revision',
        columnas: { stage_value: 'IIA' },
      }),
    ];

    const checklist = calcularChecklist({
      cancerType: 'mama',
      items: [itemTnm, itemCondicionado('faltante')],
      verifiedReviewStatuses: VERIFICADOS,
      registros: { Diagnosis: diagnosticos, PriorTreatment: [tratamiento()] },
    });

    expect(checklist[1]).toEqual({ key: 'dependiente', status: 'no_aplica' });
  });

  it('lanza CatalogoInconsistenteError cuando la condición referencia un ítem que no existe', () => {
    expect(() =>
      calcularChecklist({
        cancerType: 'mama',
        items: [itemCondicionado('faltante')],
        verifiedReviewStatuses: VERIFICADOS,
        registros: {},
      }),
    ).toThrow(CatalogoInconsistenteError);
  });

  it('lanza CatalogoInconsistenteError cuando la condición no es evaluable y el ítem no declara whenConditionUnknown', () => {
    const sinPolitica = item('dependiente', {
      condition: { item: 'tnm', operator: 'prefijo', values: ['IV'] },
    });

    expect(() =>
      calcularChecklist({
        cancerType: 'mama',
        items: [itemTnm, sinPolitica],
        verifiedReviewStatuses: VERIFICADOS,
        registros: { Diagnosis: [diagnosticoConTnm(null)] },
      }),
    ).toThrow(CatalogoInconsistenteError);
  });

  it('aplica el whenConditionUnknown cuando el ítem condicionante no declara campo de destino', () => {
    const sinCampo = item('referenciado', { destination: { entity: 'PriorTreatment' } });
    const dependiente = item('dependiente', {
      destination: { entity: 'ClinicalAttribute' },
      condition: { item: 'referenciado', operator: 'prefijo', values: ['x'] },
      whenConditionUnknown: 'no_aplica',
    });

    const checklist = calcularChecklist({
      cancerType: 'mama',
      items: [sinCampo, dependiente],
      verifiedReviewStatuses: VERIFICADOS,
      registros: { PriorTreatment: [tratamiento()], ClinicalAttribute: [registro({})] },
    });

    expect(checklist[1]).toEqual({ key: 'dependiente', status: 'no_aplica' });
  });
});
