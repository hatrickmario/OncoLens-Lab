import { describe, expect, it } from 'vitest';
import { ValorFueraDeCatalogoError } from '../../../src/modules/compartido/errores-de-registro.js';
import {
  CorreccionInvalidaError,
  DatoNoVigenteError,
} from '../../../src/modules/corrections/corrections.errores.js';
import {
  examenDeLaCorreccion,
  exigirCorreccionValidaDeBiomarcador,
  exigirCorreccionValidaDeNota,
  exigirDatoVigente,
  exigirFechaNoFutura,
  exigirTextoDeNotaValido,
  exigirValorDelFormatoDelResultado,
  fechaDeHoy,
  hayCambioRealDeBiomarcador,
  hayCambioRealDeNota,
  planDeCorreccionDeBiomarcador,
  planDeCorreccionDeNota,
  type ContextoDeCorreccion,
} from '../../../src/modules/corrections/corrections.reglas.js';
import type { BiomarcadorActual, NotaActual } from '../../../src/modules/corrections/ports.js';
import type { DecisionDeNormalizacion } from '../../../src/modules/reconciliation/ports.js';

const AHORA = new Date('2026-10-16T12:00:00.000Z');

function contexto(): ContextoDeCorreccion {
  let n = 0;
  return {
    patientId: 'paciente-1',
    userId: 'usuario-1',
    ahora: AHORA,
    generarId: () => `id-${++n}`,
  };
}

const KI67: BiomarcadorActual = {
  id: 'bio-1',
  examId: 'examen-1',
  episodeId: 'episodio-1',
  examType: 'registro_manual',
  performedAt: '2026-09-10',
  name: 'Ki-67',
  originalName: 'ki 67',
  value: '20',
  unit: '%',
  referenceRange: '',
  resultType: 'cuantitativo',
  reviewStatus: 'verificado',
};

const NOTA: NotaActual = {
  id: 'nota-1',
  episodeId: 'episodio-1',
  noteType: 'comorbilidad',
  content: 'Hipertensión arterial en tratamiento.',
  recordedAt: '2026-09-01',
  reviewStatus: 'verificado',
};

const DECISION: DecisionDeNormalizacion = {
  entidad: 'Biomarker',
  name: 'Ki-67',
  originalName: 'ki 67',
  mappingStatus: 'mapeado',
  icd10Code: null,
  loincCode: 'LOINC-T-KI67',
  cupsCode: null,
  atcCodes: [],
  catalogVersion: 'test',
};

describe('hayCambioRealDeBiomarcador', () => {
  it('es falso cuando el valor y la unidad enviados son los del biomarcador vigente', () => {
    expect(hayCambioRealDeBiomarcador(KI67, { value: '20', unit: '%' })).toBe(false);
  });

  it('es falso cuando solo se omiten los campos opcionales y el valor es el mismo', () => {
    expect(hayCambioRealDeBiomarcador(KI67, { value: '20' })).toBe(false);
  });

  it.each([
    ['el valor', { value: '25' }],
    ['la unidad', { value: '20', unit: 'ng/mL' }],
    ['la unidad a nula', { value: '20', unit: null }],
    ['el rango de referencia', { value: '20', referenceRange: '<14' }],
    ['la fecha del examen', { value: '20', performedAt: '2026-09-11' }],
  ])('es verdadero cuando cambia %s', (_campo, cambios) => {
    expect(hayCambioRealDeBiomarcador(KI67, cambios)).toBe(true);
  });

  it('es falso cuando el rango enviado nulo equivale al rango vacío registrado', () => {
    expect(hayCambioRealDeBiomarcador(KI67, { value: '20', referenceRange: null })).toBe(false);
  });
});

describe('hayCambioRealDeNota', () => {
  it('es falso cuando el texto y el tipo enviados son los de la nota vigente', () => {
    expect(hayCambioRealDeNota(NOTA, { content: NOTA.content, noteType: 'comorbilidad' })).toBe(
      false,
    );
  });

  it('es verdadero cuando cambia solo el tipo', () => {
    expect(hayCambioRealDeNota(NOTA, { noteType: 'antecedente' })).toBe(true);
  });

  it('es verdadero cuando cambia solo el texto', () => {
    expect(hayCambioRealDeNota(NOTA, { content: 'Otro texto.' })).toBe(true);
  });
});

describe('examenDeLaCorreccion', () => {
  it('reemplaza al examen anterior cuando el biomarcador corregido era su único dato vigente', () => {
    const examen = examenDeLaCorreccion(KI67, undefined, 0, contexto());

    expect(examen).toMatchObject({
      entryMethod: 'manual_correction',
      supersedesId: 'examen-1',
      performedAt: '2026-09-10',
      episodeId: 'episodio-1',
      examType: 'registro_manual',
      createdAt: AHORA,
    });
  });

  it('deja vigente el examen anterior cuando conserva otros biomarcadores vigentes', () => {
    expect(examenDeLaCorreccion(KI67, undefined, 2, contexto()).supersedesId).toBeNull();
  });

  it('usa la fecha enviada cuando la corrección cambia el día del examen', () => {
    expect(examenDeLaCorreccion(KI67, '2026-09-20', 0, contexto()).performedAt).toBe('2026-09-20');
  });
});

describe('planDeCorreccionDeBiomarcador', () => {
  it('crea el biomarcador verificado con supersedes_id, originalName conservado y la decisión de normalización', () => {
    const plan = planDeCorreccionDeBiomarcador(KI67, { value: '25' }, DECISION, 0, contexto());

    expect(plan.biomarcadorAReemplazar).toBe('bio-1');
    expect(plan.examen.supersedesId).toBe('examen-1');
    expect(plan.biomarcador).toMatchObject({
      examId: plan.examen.id,
      name: 'Ki-67',
      originalName: 'ki 67',
      loincCode: 'LOINC-T-KI67',
      mappingStatus: 'mapeado',
      value: '25',
      unit: '%',
      reviewStatus: 'verificado',
      extractionConfidence: 'n_a',
      supersedesId: 'bio-1',
      reviewedBy: 'usuario-1',
      reviewedAt: AHORA,
    });
  });

  it('deja no_mapeado el biomarcador cuando la decisión no lo mapea', () => {
    const decision = { ...DECISION, mappingStatus: 'no_mapeado', loincCode: null } as const;

    const plan = planDeCorreccionDeBiomarcador(KI67, { value: '25' }, decision, 0, contexto());

    expect(plan.biomarcador).toMatchObject({ mappingStatus: 'no_mapeado', loincCode: null });
  });

  it('usa los ids del generador inyectado, el examen primero y el biomarcador después', () => {
    const plan = planDeCorreccionDeBiomarcador(KI67, { value: '25' }, DECISION, 0, contexto());

    expect([plan.examen.id, plan.biomarcador.id]).toEqual(['id-1', 'id-2']);
  });

  it('conserva la unidad y el rango anteriores cuando el cuerpo no los envía y los reemplaza cuando sí', () => {
    const conservados = planDeCorreccionDeBiomarcador(
      KI67,
      { value: '25' },
      DECISION,
      0,
      contexto(),
    );
    const nuevos = planDeCorreccionDeBiomarcador(
      KI67,
      { value: '25', unit: null, referenceRange: '<14' },
      DECISION,
      0,
      contexto(),
    );

    expect(conservados.biomarcador).toMatchObject({ unit: '%', referenceRange: '' });
    expect(nuevos.biomarcador).toMatchObject({ unit: null, referenceRange: '<14' });
  });
});

describe('planDeCorreccionDeNota', () => {
  it('crea la versión nueva activa y verificada con la fecha de la anterior y enlace a ella', () => {
    const plan = planDeCorreccionDeNota(
      NOTA,
      { content: 'Hipertensión controlada.', noteType: 'antecedente' },
      contexto(),
    );

    expect(plan.notaAReemplazar).toBe('nota-1');
    expect(plan.nota).toMatchObject({
      id: 'id-1',
      patientId: 'paciente-1',
      createdBy: 'usuario-1',
      noteType: 'antecedente',
      content: 'Hipertensión controlada.',
      recordedAt: '2026-09-01',
      isActive: true,
      entryMethod: 'manual_correction',
      reviewStatus: 'verificado',
      supersedesId: 'nota-1',
    });
  });

  it('conserva el tipo anterior cuando solo cambia el texto', () => {
    const plan = planDeCorreccionDeNota(NOTA, { content: 'Otro texto.' }, contexto());

    expect(plan.nota.noteType).toBe('comorbilidad');
  });
});

describe('validaciones de la corrección', () => {
  it('lanza DatoNoVigenteError cuando el dato ya fue reemplazado o rechazado', () => {
    expect(() => exigirDatoVigente('reemplazado')).toThrow(DatoNoVigenteError);
    expect(() => exigirDatoVigente('rechazado')).toThrow(DatoNoVigenteError);
    expect(() => exigirDatoVigente('verificado')).not.toThrow();
  });

  it('toma la fecha de hoy del reloj inyectado', () => {
    expect(fechaDeHoy(AHORA)).toBe('2026-10-16');
  });

  it('rechaza con field performedAt una fecha posterior a hoy y acepta hoy y el pasado', () => {
    expect(() => exigirFechaNoFutura('2026-10-17', '2026-10-16')).toThrow(
      expect.objectContaining({ campo: 'performedAt' }) as Error,
    );
    expect(() => exigirFechaNoFutura('2026-10-16', '2026-10-16')).not.toThrow();
    expect(() => exigirFechaNoFutura(undefined, '2026-10-16')).not.toThrow();
  });

  it.each(['20', '20,5', '<1', '≥ 30', '25 %', '-3.2'])(
    'acepta %s como valor de un resultado cuantitativo',
    (valor) => {
      expect(() => exigirValorDelFormatoDelResultado('cuantitativo', valor)).not.toThrow();
    },
  );

  it.each(['7+x', 'alto', '2+ (IHQ)', ''])(
    'rechaza %s como valor de un resultado cuantitativo con field value',
    (valor) => {
      expect(() => exigirValorDelFormatoDelResultado('cuantitativo', valor)).toThrow(
        ValorFueraDeCatalogoError,
      );
    },
  );

  it('no exige formato numérico a un resultado cualitativo', () => {
    expect(() => exigirValorDelFormatoDelResultado('cualitativo', '2+ (IHQ)')).not.toThrow();
  });

  it.each([
    ['vacío', ''],
    ['solo espacios', '   '],
    ['largo', 'x'.repeat(11)],
  ])('rechaza con field content un texto de nota %s', (_caso, texto) => {
    expect(() => exigirTextoDeNotaValido(texto, 10)).toThrow(CorreccionInvalidaError);
  });

  it('acepta un texto de nota de exactamente el máximo y la ausencia de texto', () => {
    expect(() => exigirTextoDeNotaValido('x'.repeat(10), 10)).not.toThrow();
    expect(() => exigirTextoDeNotaValido(undefined, 10)).not.toThrow();
  });
});

describe('exigirCorreccionValidaDeBiomarcador', () => {
  it('acepta un valor nuevo numérico con una fecha de hoy', () => {
    expect(() =>
      exigirCorreccionValidaDeBiomarcador(
        KI67,
        { value: '25', performedAt: '2026-10-16' },
        '2026-10-16',
      ),
    ).not.toThrow();
  });

  it('rechaza con field performedAt una fecha futura antes de mirar el valor', () => {
    expect(() =>
      exigirCorreccionValidaDeBiomarcador(
        KI67,
        { value: 'x', performedAt: '2026-10-17' },
        '2026-10-16',
      ),
    ).toThrow(expect.objectContaining({ campo: 'performedAt' }) as Error);
  });

  it('rechaza sin field una corrección que deja todo igual', () => {
    expect(() =>
      exigirCorreccionValidaDeBiomarcador(KI67, { value: '20', unit: '%' }, '2026-10-16'),
    ).toThrow(expect.objectContaining({ campo: undefined }) as Error);
  });
});

describe('exigirCorreccionValidaDeNota', () => {
  it('acepta un texto nuevo dentro del máximo', () => {
    expect(() => exigirCorreccionValidaDeNota(NOTA, { content: 'Otro texto.' }, 50)).not.toThrow();
  });

  it('rechaza con field content un texto mayor que el máximo', () => {
    expect(() => exigirCorreccionValidaDeNota(NOTA, { content: 'x'.repeat(51) }, 50)).toThrow(
      expect.objectContaining({ campo: 'content' }) as Error,
    );
  });

  it('rechaza sin field una corrección sin cambios', () => {
    expect(() => exigirCorreccionValidaDeNota(NOTA, { noteType: 'comorbilidad' }, 50)).toThrow(
      CorreccionInvalidaError,
    );
  });
});
