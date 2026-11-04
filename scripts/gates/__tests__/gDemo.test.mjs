import { describe, expect, it } from 'vitest';
import { cargarExcepciones, declararValidacionClinica } from '../g-demo/excepciones.mjs';
import { cargarMetas, evaluarMetricas, validarReporte } from '../g-demo/metricas.mjs';
import { evaluarP95 } from '../g-demo/p95.mjs';
import { decidirResultado } from '../g-demo/resultado.mjs';
import { verificarSoloSintetico } from '../g-demo/solo-sintetico.mjs';

// Las metas de estos tests son de juguete: el módulo las lee de lo que se le pasa (RN-22), nunca las trae escritas.
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
    ].join('\n'),
  );
}

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

function comprobacionesEnVerde(cambios = {}) {
  const metricas = evaluarMetricas([reporteEnMeta()], DEFINICIONES, metas());
  return {
    e2e: { ok: true, pasoFallido: null },
    reporte: validarReporte([reporteEnMeta()]),
    metricas,
    soloSintetico: verificarSoloSintetico(SINTETICO, SIN_BANDERAS),
    excepciones: cargarExcepciones([
      { id: 'CAP-07', descripcion: 'd', feature: 'FEAT-X', destino: 'S6', motivo: 'm' },
    ]),
    procedencia: { faltantes: [] },
    p95: evaluarP95(8, { clave: 'p95_evidence_analyses_s', maximo: 15 }),
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
});

describe('evaluarMetricas', () => {
  it('no supera el gate y nombra la métrica fuera de meta [US-142 AC-2]', () => {
    const metricas = evaluarMetricas(
      [reporteEnMeta({ m_10_1: { porcentaje: 0.96, validacion: VALIDACION } })],
      DEFINICIONES,
      metas(),
    );

    expect(metricas.find((m) => m.id === 'M-10.1')).toMatchObject({
      estado: 'fuera_de_meta',
      valor: 0.96,
    });
    const r = decidirResultado(comprobacionesEnVerde({ metricas }), 'real');
    expect(r.resultado).toBe('no_superado');
    expect(r.motivos.join(' ')).toContain('M-10.1');
  });

  it('declara en meta con su origen y los casos validados y no validados [US-142 AC-2]', () => {
    const metricas = evaluarMetricas([reporteEnMeta()], DEFINICIONES, metas());

    expect(metricas.find((m) => m.id === 'fidelidad')).toMatchObject({
      estado: 'en_meta',
      meta: { minimo: 0.5 },
      origen: 'metas-iniciales.yaml',
      validadas: 3,
      noValidadas: 2,
    });
  });

  it('declara no medida una métrica ausente salvo M-10.1 y M-10.2 [US-142 AC-2]', () => {
    const sinRecall = reporteEnMeta({ recuperacion: {} });
    const sinM101 = reporteEnMeta({ m_10_1: {} });

    const a = evaluarMetricas([sinRecall], DEFINICIONES, metas());
    expect(a.find((m) => m.id === 'recall@10')).toMatchObject({ estado: 'no_medida' });
    expect(decidirResultado(comprobacionesEnVerde({ metricas: a }), 'real').resultado).toBe(
      'superado',
    );

    const b = evaluarMetricas([sinM101], DEFINICIONES, metas());
    const r = decidirResultado(comprobacionesEnVerde({ metricas: b }), 'real');
    expect(r.resultado).toBe('no_superado');
    expect(r.motivos.join(' ')).toContain('M-10.1');
  });

  it('rechaza el reporte ausente o de otra configuración [US-142 AC-2]', () => {
    expect(validarReporte([]).ok).toBe(false);
    expect(validarReporte([{ configuracion: { nombre: 'opciones-fake' } }]).ok).toBe(false);
    expect(validarReporte([reporteEnMeta()]).ok).toBe(true);
  });
});

describe('cargarExcepciones', () => {
  it('lista las excepciones sin contarlas como fallo y falla con una sin destino [US-142 AC-4]', () => {
    const completa = {
      id: 'CAP-07',
      descripcion: 'd',
      feature: 'FEAT-X',
      destino: 'S6',
      motivo: 'm',
    };
    const sinDestino = {
      id: 'CAP-09',
      descripcion: 'd',
      feature: 'FEAT-Y',
      destino: '',
      motivo: 'm',
    };

    const buena = cargarExcepciones([completa]);
    expect(buena.incompletas).toEqual([]);
    expect(decidirResultado(comprobacionesEnVerde({ excepciones: buena }), 'real').resultado).toBe(
      'superado',
    );

    const mala = cargarExcepciones([completa, sinDestino]);
    expect(mala.incompletas).toEqual(['CAP-09']);
    const r = decidirResultado(comprobacionesEnVerde({ excepciones: mala }), 'real');
    expect(r.resultado).toBe('no_superado');
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
      { id: 'CAP-07', descripcion: 'd', feature: 'FEAT-X', destino: 'S6', motivo: 'm' },
    ]);

    const validacion = declararValidacionClinica(excepciones);

    expect(validacion.map((v) => v.id)).toEqual(['VM-1']);
    expect(validacion[0].estado).toBe('se mide en el piloto');
    expect(decidirResultado(comprobacionesEnVerde({ excepciones }), 'real').resultado).toBe(
      'superado',
    );
  });
});

describe('evaluarP95', () => {
  it('marca el p95 fuera de meta como insumo de ADR-42 sin bloquear [US-142 AC-7]', () => {
    const p95 = evaluarP95(22, { clave: 'p95_evidence_analyses_s', maximo: 15 });

    expect(p95).toMatchObject({
      estado: 'insumo_adr42',
      valor: 22,
      clave: 'p95_evidence_analyses_s',
    });
    expect(decidirResultado(comprobacionesEnVerde({ p95 }), 'real').resultado).toBe('superado');
  });

  it('declara no medido el p95 ausente sin bloquear [US-142 AC-7]', () => {
    const p95 = evaluarP95(null, { clave: 'p95_evidence_analyses_s', maximo: 15 });

    expect(p95.estado).toBe('no_medido');
    expect(decidirResultado(comprobacionesEnVerde({ p95 }), 'real').resultado).toBe('superado');
  });
});

describe('decidirResultado', () => {
  it('declara G-Demo superado en modo real cuando todo está en verde [US-142 AC-6]', () => {
    const r = decidirResultado(comprobacionesEnVerde(), 'real');

    expect(r).toMatchObject({ resultado: 'superado', titulo: 'G-Demo superado', motivos: [] });
  });

  it('el modo fingido nunca declara G-Demo [US-142 AC-6]', () => {
    const r = decidirResultado(comprobacionesEnVerde(), 'fingido');

    expect(r.resultado).toBe('regresion_fingida');
    expect(r.titulo).toBe(
      'Regresión del recorrido en verde (modo fingido); G-Demo se declara solo en modo real',
    );
  });

  it('el modo fingido con un fallo es no superado [US-142 AC-1]', () => {
    const r = decidirResultado(
      comprobacionesEnVerde({ e2e: { ok: false, pasoFallido: 'vista de caso' } }),
      'fingido',
    );

    expect(r.resultado).toBe('no_superado');
    expect(r.motivos.join(' ')).toContain('vista de caso');
  });

  it('procedencia incompleta no supera el gate [US-142 AC-6]', () => {
    const r = decidirResultado(
      comprobacionesEnVerde({ procedencia: { faltantes: ['corpusRelease'] } }),
      'real',
    );

    expect(r.resultado).toBe('no_superado');
    expect(r.titulo).toContain('procedencia incompleta');
  });

  it('rechaza un modo desconocido', () => {
    expect(() => decidirResultado(comprobacionesEnVerde(), 'otro')).toThrow(/modo/);
  });
});
