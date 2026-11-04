import { describe, expect, it } from 'vitest';
import { comprobarE2e } from '../g-demo/e2e.mjs';
import { cargarExcepciones, declararValidacionClinica } from '../g-demo/excepciones.mjs';
import { ESTADOS, cargarMetas, evaluarMetricas, validarReporte } from '../g-demo/metricas.mjs';
import { evaluarP95 } from '../g-demo/p95.mjs';
import { textoDelP95 } from '../g-demo/registro.mjs';
import {
  MODOS,
  RESULTADOS,
  codigoDeSalida,
  decidirResultado,
  rutaDelRegistro,
} from '../g-demo/resultado.mjs';
import { verificarSoloSintetico } from '../g-demo/solo-sintetico.mjs';

// Las metas de estos tests son de juguete (distintas de las reales): el módulo las lee de lo que se le pasa (RN-22).
const CONFIGURACIONES = ['s5-opciones-local'];
const DEFINICIONES = [
  {
    id: 'M-10.1',
    etiqueta: 'Opciones con cita y soporte',
    obligatoria: true,
    metaFija: { minimo: 1 },
    rutas: [['metricas', 'm_10_1', 'porcentaje']],
  },
  {
    id: 'M-10.2',
    etiqueta: 'Campos con términos prohibidos',
    obligatoria: true,
    metaFija: { maximo: 0 },
    rutas: [['metricas', 'm_10_2', 'campos_con_termino']],
  },
  {
    id: 'fidelidad',
    etiqueta: 'Fidelidad',
    claveMeta: 'fidelidad_proxy',
    rutas: [['metricas', 'fidelidad', 'nli', 'fidelidad']],
  },
  {
    id: 'recall@10',
    etiqueta: 'recall@10',
    claveMeta: 'recall_at_10',
    rutas: [['metricas', 'recuperacion', 'recall_at_10']],
  },
];

function metas() {
  return cargarMetas(
    [
      'metas:',
      '  fidelidad_proxy: {etiqueta: f, minimo: 0.5}',
      '  recall_at_10: {etiqueta: r, minimo: 0.5}',
      '  p95_evidence_analyses_s: {etiqueta: p, maximo: 7}',
    ].join('\n'),
  );
}
const metaP95 = () => ({
  clave: 'p95_evidence_analyses_s',
  maximo: metas().p95_evidence_analyses_s.maximo,
});

const VALIDACION = { preguntas_validadas: 3, preguntas_no_validadas: 2, rotulo: 'x' };

function reporteEnMeta(cambios = {}) {
  return {
    configuracion: { nombre: 's5-opciones-local' },
    metricas: {
      m_10_1: { porcentaje: 1, validacion: VALIDACION },
      m_10_2: { campos_con_termino: 0, validacion: VALIDACION },
      fidelidad: { nli: { fidelidad: 0.9 }, validacion: VALIDACION },
      recuperacion: { recall_at_10: 0.9, validacion: VALIDACION },
      ...cambios,
    },
  };
}

const SINTETICO = { sintetico: 4, real_anonimizado: 0, real_identificado: 0 };
const SIN_BANDERAS = { REAL_ANONYMIZED_ENABLED: false, REAL_IDENTIFIED_ENABLED: false };
const E2E_REAL = {
  modoLlm: 'real',
  generadoEn: '2026-11-05T10:00:00Z',
  pasos: [{ paso: 'login', resultado: 'ok' }],
};
const EXCEPCION = { id: 'CAP-07', descripcion: 'd', feature: 'FEAT-X', destino: 'S6', motivo: 'm' };

function comprobacionesEnVerde(cambios = {}) {
  return {
    e2e: comprobarE2e(E2E_REAL, 'real'),
    reporte: validarReporte([reporteEnMeta()], CONFIGURACIONES),
    soloSintetico: verificarSoloSintetico(SINTETICO, SIN_BANDERAS),
    excepciones: cargarExcepciones([EXCEPCION]),
    procedencia: { faltantes: [], motivos: [] },
    metricas: evaluarMetricas([reporteEnMeta()], DEFINICIONES, metas(), CONFIGURACIONES),
    p95: evaluarP95(5, metaP95(), 'real'),
    ...cambios,
  };
}

describe('verificarSoloSintetico', () => {
  it('falla con datos no sintéticos y solo muestra el conteo agregado [US-142 AC-3]', () => {
    const r = verificarSoloSintetico(
      { sintetico: 4, real_anonimizado: 1, real_identificado: 0 },
      SIN_BANDERAS,
    );

    expect(r.ok).toBe(false);
    expect(r.motivos).toContain('datos no sintéticos');
    expect(r.conteo).toEqual({ sintetico: 4, real_anonimizado: 1, real_identificado: 0 });
    expect(Object.keys(r.conteo).sort()).toEqual([
      'real_anonimizado',
      'real_identificado',
      'sintetico',
    ]);
  });

  it('falla y nombra la variable cuando REAL_ANONYMIZED_ENABLED es true [US-142 AC-3]', () => {
    const r = verificarSoloSintetico(SINTETICO, { ...SIN_BANDERAS, REAL_ANONYMIZED_ENABLED: true });

    expect(r.ok).toBe(false);
    expect(r.motivos.join(' ')).toContain('REAL_ANONYMIZED_ENABLED');
    expect(r.motivos.join(' ')).not.toContain('REAL_IDENTIFIED_ENABLED');
  });

  it('declara solo sintético cuando todo es sintético y las dos variables están apagadas [US-142 AC-3]', () => {
    const r = verificarSoloSintetico(SINTETICO, SIN_BANDERAS);

    expect(r).toMatchObject({ ok: true, motivos: [], banderas: SIN_BANDERAS });
  });

  it('no da por superado el origen cuando el conteo no se pudo obtener [US-142 AC-3]', () => {
    const r = verificarSoloSintetico(null, SIN_BANDERAS);

    expect(r.ok).toBe(false);
    expect(r.motivos).toContain('no se pudo verificar el origen de los datos');
  });

  it.each([
    ['vacío', {}],
    ['sin pacientes', { sintetico: 0, real_anonimizado: 0, real_identificado: 0 }],
    ['con un valor que no es número', { sintetico: 4, real_identificado: 'x' }],
    ['con un valor negativo', { sintetico: 4, real_anonimizado: -1 }],
  ])('no es verificable cuando el conteo es %s [US-142 AC-3]', (_, conteo) => {
    const r = verificarSoloSintetico(conteo, SIN_BANDERAS);

    expect(r).toMatchObject({ ok: false, verificable: false });
    expect(r.motivos).toContain('no se pudo verificar el origen de los datos');
  });

  it('falla con datos no sintéticos cuando aparece un origen nuevo con pacientes [US-142 AC-3]', () => {
    const r = verificarSoloSintetico({ sintetico: 14, real_nuevo: 1 }, SIN_BANDERAS);

    expect(r.ok).toBe(false);
    expect(r.motivos).toContain('datos no sintéticos');
  });
});

describe('evaluarMetricas', () => {
  it('no supera el gate y nombra la métrica fuera de meta [US-142 AC-2]', () => {
    const metricas = evaluarMetricas(
      [reporteEnMeta({ m_10_1: { porcentaje: 0.96, validacion: VALIDACION } })],
      DEFINICIONES,
      metas(),
      CONFIGURACIONES,
    );

    expect(metricas.mediciones.find((m) => m.id === 'M-10.1')).toMatchObject({
      estado: ESTADOS.FUERA_DE_META,
      valor: 0.96,
    });
    const r = decidirResultado(comprobacionesEnVerde({ metricas }), 'real');
    expect(r.resultado).toBe(RESULTADOS.NO_SUPERADO);
    expect(r.motivos.join(' ')).toContain('M-10.1');
  });

  it('declara en meta con su origen y los casos validados y no validados [US-142 AC-2]', () => {
    const { mediciones } = evaluarMetricas(
      [reporteEnMeta()],
      DEFINICIONES,
      metas(),
      CONFIGURACIONES,
    );

    expect(mediciones.find((m) => m.id === 'fidelidad')).toMatchObject({
      estado: ESTADOS.EN_META,
      meta: { minimo: 0.5 },
      origen: 'metas-iniciales.yaml',
      validadas: 3,
      noValidadas: 2,
    });
  });

  it('declara no medida una métrica ausente salvo M-10.1 y M-10.2 [US-142 AC-2]', () => {
    const a = evaluarMetricas(
      [reporteEnMeta({ recuperacion: {} })],
      DEFINICIONES,
      metas(),
      CONFIGURACIONES,
    );
    expect(a.mediciones.find((m) => m.id === 'recall@10')).toMatchObject({
      estado: ESTADOS.NO_MEDIDA,
    });
    expect(decidirResultado(comprobacionesEnVerde({ metricas: a }), 'real').resultado).toBe(
      RESULTADOS.SUPERADO,
    );

    const b = evaluarMetricas(
      [reporteEnMeta({ m_10_1: {} })],
      DEFINICIONES,
      metas(),
      CONFIGURACIONES,
    );
    const r = decidirResultado(comprobacionesEnVerde({ metricas: b }), 'real');
    expect(r.resultado).toBe(RESULTADOS.NO_SUPERADO);
    expect(r.motivos.join(' ')).toContain('M-10.1');
  });

  it('lanza cuando una meta no declara minimo ni maximo [US-142 AC-2]', () => {
    const metasMalas = cargarMetas('metas:\n  fidelidad_proxy: {etiqueta: f, min: 0.8}\n');

    expect(() =>
      evaluarMetricas([reporteEnMeta()], DEFINICIONES.slice(2, 3), metasMalas, CONFIGURACIONES),
    ).toThrow(/fidelidad_proxy/);
  });
});

describe('validarReporte', () => {
  it('rechaza el reporte ausente o de otra configuración [US-142 AC-2]', () => {
    expect(validarReporte([], CONFIGURACIONES).ok).toBe(false);
    expect(
      validarReporte([{ configuracion: { nombre: 'opciones-fake' } }], CONFIGURACIONES).ok,
    ).toBe(false);
    expect(validarReporte([reporteEnMeta()], CONFIGURACIONES)).toMatchObject({
      ok: true,
      motivos: [],
    });
  });

  it('rechaza una configuración que solo empieza como la aceptada [US-142 AC-2]', () => {
    const r = validarReporte([{ configuracion: { nombre: 's5-calibracion' } }], CONFIGURACIONES);

    expect(r.ok).toBe(false);
    expect(r.motivos).toContain('reporte de evaluate ausente o de otra configuración');
  });
});

describe('cargarExcepciones', () => {
  it('lista las excepciones sin contarlas como fallo y falla con una sin destino [US-142 AC-4]', () => {
    const sinDestino = {
      id: 'CAP-09',
      descripcion: 'd',
      feature: 'FEAT-Y',
      destino: '',
      motivo: 'm',
    };

    const buena = cargarExcepciones([EXCEPCION]);
    expect(buena).toMatchObject({ incompletas: [], motivos: [] });
    expect(decidirResultado(comprobacionesEnVerde({ excepciones: buena }), 'real').resultado).toBe(
      RESULTADOS.SUPERADO,
    );

    const mala = cargarExcepciones([EXCEPCION, sinDestino]);
    expect(mala.incompletas).toEqual(['CAP-09']);
    const r = decidirResultado(comprobacionesEnVerde({ excepciones: mala }), 'real');
    expect(r.resultado).toBe(RESULTADOS.NO_SUPERADO);
    expect(r.motivos.join(' ')).toContain('CAP-09');
  });
});

describe('declararValidacionClinica', () => {
  it('declara la validación clínica como se mide en el piloto [US-142 AC-5]', () => {
    const excepciones = cargarExcepciones([
      {
        id: 'VM-1',
        tipo: 'se_mide_en_el_piloto',
        descripcion: 'd',
        feature: 'FEAT-T5d',
        destino: 'S6',
        motivo: 'm',
      },
      EXCEPCION,
    ]);

    const validacion = declararValidacionClinica(excepciones);

    expect(validacion.map((v) => v.id)).toEqual(['VM-1']);
    expect(validacion[0].estado).toBe('se mide en el piloto');
    expect(decidirResultado(comprobacionesEnVerde({ excepciones }), 'real').resultado).toBe(
      RESULTADOS.SUPERADO,
    );
  });
});

describe('evaluarP95', () => {
  it('marca el p95 fuera de meta como insumo de ADR-42 sin bloquear [US-142 AC-7]', () => {
    const p95 = evaluarP95(22, metaP95(), 'real');

    expect(p95).toMatchObject({
      estado: ESTADOS.INSUMO_ADR42,
      valor: 22,
      clave: 'p95_evidence_analyses_s',
      meta: { maximo: 7 },
    });
    expect(decidirResultado(comprobacionesEnVerde({ p95 }), 'real').resultado).toBe(
      RESULTADOS.SUPERADO,
    );
  });

  it('declara no medida el p95 ausente sin bloquear [US-142 AC-7]', () => {
    const p95 = evaluarP95(null, metaP95(), 'real');

    expect(p95.estado).toBe(ESTADOS.NO_MEDIDA);
    expect(decidirResultado(comprobacionesEnVerde({ p95 }), 'real').resultado).toBe(
      RESULTADOS.SUPERADO,
    );
  });

  it('declara no medida el p95 en modo fingido aunque llegue un valor [US-142 AC-7]', () => {
    const p95 = evaluarP95(3, metaP95(), 'fingido');

    expect(p95).toMatchObject({ estado: ESTADOS.NO_MEDIDA, valor: null });
  });

  it('usa la misma forma de meta que las métricas [US-142 AC-7]', () => {
    const p95 = evaluarP95(3, metaP95(), 'real');
    const { mediciones } = evaluarMetricas(
      [reporteEnMeta()],
      DEFINICIONES,
      metas(),
      CONFIGURACIONES,
    );

    expect(p95.meta).toEqual({ maximo: 7 });
    expect(Object.keys(mediciones[0].meta)).toHaveLength(1);
  });
});

describe('textoDelP95', () => {
  it('lanza ante un estado desconocido [US-142 AC-7]', () => {
    expect(() =>
      textoDelP95({ estado: 'raro', clave: 'k', meta: { maximo: 1 }, valor: 2 }, { fuente: 'f' }),
    ).toThrow(/estado/);
  });
});

describe('comprobarE2e', () => {
  it('compara el modo del E2E con el modo pedido [US-142 AC-6]', () => {
    expect(comprobarE2e(E2E_REAL, 'real')).toMatchObject({ ok: true, motivos: [] });

    const r = comprobarE2e({ ...E2E_REAL, modoLlm: 'fingido' }, 'real');
    expect(r.ok).toBe(false);
    expect(r.motivos.join(' ')).toContain('modo');
    expect(decidirResultado(comprobacionesEnVerde({ e2e: r }), 'real').resultado).toBe(
      RESULTADOS.NO_SUPERADO,
    );
  });

  it('no supera el gate cuando el E2E no declara su modo o su fecha [US-142 AC-6]', () => {
    const { modoLlm: _m, ...sinModo } = E2E_REAL;
    const { generadoEn: _g, ...sinFecha } = E2E_REAL;

    expect(comprobarE2e(sinModo, 'real').ok).toBe(false);
    expect(comprobarE2e(sinFecha, 'real').ok).toBe(false);
    expect(comprobarE2e(null, 'real').ok).toBe(false);
  });

  it('nombra el paso fallido [US-142 AC-1]', () => {
    const r = comprobarE2e(
      { ...E2E_REAL, pasos: [{ paso: 'vista de caso', resultado: 'fallo' }] },
      'real',
    );

    expect(r.ok).toBe(false);
    expect(r.motivos.join(' ')).toContain('paso fallido: vista de caso');
  });
});

describe('decidirResultado', () => {
  it('declara G-Demo superado en modo real cuando todo está en verde [US-142 AC-6]', () => {
    const r = decidirResultado(comprobacionesEnVerde(), 'real');

    expect(r).toMatchObject({
      resultado: RESULTADOS.SUPERADO,
      titulo:
        'G-Demo superado (criterios técnicos del MVP sobre datos sintéticos; la utilidad clínica no se valida aquí)',
      motivos: [],
    });
  });

  it('el modo fingido nunca declara G-Demo [US-142 AC-6]', () => {
    const r = decidirResultado(
      comprobacionesEnVerde({ e2e: comprobarE2e({ ...E2E_REAL, modoLlm: 'fingido' }, 'fingido') }),
      'fingido',
    );

    expect(r.resultado).toBe(RESULTADOS.REGRESION_FINGIDA);
    expect(r.titulo).toBe(
      'Regresión del recorrido en verde (modo fingido); G-Demo se declara solo en modo real',
    );
  });

  it('el modo fingido con un fallo es no superado [US-142 AC-1]', () => {
    const e2e = comprobarE2e(
      { ...E2E_REAL, modoLlm: 'fingido', pasos: [{ paso: 'vista de caso', resultado: 'fallo' }] },
      'fingido',
    );

    const r = decidirResultado(comprobacionesEnVerde({ e2e }), 'fingido');

    expect(r.resultado).toBe(RESULTADOS.NO_SUPERADO);
    expect(r.motivos.join(' ')).toContain('vista de caso');
  });

  it('procedencia incompleta no supera el gate [US-142 AC-6]', () => {
    const r = decidirResultado(
      comprobacionesEnVerde({
        procedencia: { faltantes: ['corpusRelease'], motivos: ['procedencia incompleta'] },
      }),
      'real',
    );

    expect(r.resultado).toBe(RESULTADOS.NO_SUPERADO);
    expect(r.titulo).toContain('procedencia incompleta');
  });

  it('solo concatena los motivos de cada comprobación en un orden fijo [US-142 AC-6]', () => {
    const r = decidirResultado(
      comprobacionesEnVerde({
        e2e: { ok: false, motivos: ['uno'] },
        reporte: { ok: false, motivos: ['dos'] },
        soloSintetico: { ok: false, motivos: ['tres'] },
        excepciones: { motivos: ['cuatro'] },
        procedencia: { motivos: ['cinco'] },
        metricas: { motivos: ['seis'] },
      }),
      'real',
    );

    expect(r.motivos).toEqual(['uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis']);
  });

  it('rechaza un modo desconocido', () => {
    expect(MODOS).toEqual(['fingido', 'real']);
    expect(() => decidirResultado(comprobacionesEnVerde(), 'otro')).toThrow(/modo/);
  });
});

describe('rutaDelRegistro y codigoDeSalida', () => {
  it('versiona solo el registro real superado y deja el resto en reports/gates [US-142 AC-6]', () => {
    expect(rutaDelRegistro(RESULTADOS.SUPERADO, 'real', '2026-11-05')).toBe(
      'docs/gates/G-Demo-2026-11-05.md',
    );
    expect(rutaDelRegistro(RESULTADOS.NO_SUPERADO, 'real', '2026-11-05')).toMatch(
      /^reports\/gates\/.*2026-11-05\.md$/,
    );
    expect(rutaDelRegistro(RESULTADOS.REGRESION_FINGIDA, 'fingido', '2026-11-05')).toBe(
      'reports/gates/G-Demo-fingido-2026-11-05.md',
    );
  });

  it('sale con 1 solo cuando el gate no se supera [US-142 AC-6]', () => {
    expect(codigoDeSalida(RESULTADOS.NO_SUPERADO)).toBe(1);
    expect(codigoDeSalida(RESULTADOS.SUPERADO)).toBe(0);
    expect(codigoDeSalida(RESULTADOS.REGRESION_FINGIDA)).toBe(0);
  });
});
