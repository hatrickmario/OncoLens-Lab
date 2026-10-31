import { describe, expect, it } from 'vitest';
import { compararConBaseline, tablaMarkdown, textoSeguro } from '../comparar-baseline.mjs';

const validacion = (rotulo) => ({ rotulo, preguntas_validadas: 0, preguntas_no_validadas: 6 });

const reporteCon = ({ recall = 1, exactitud = 1, violaciones = 0, rotulo = 'no_validada' } = {}) => ({
  metricas: {
    completa: {
      recuperacion: { total: { n: 4, recall_at_10: recall, recall_ic95: { inferior: recall, superior: recall } }, validacion: validacion(rotulo) },
      sin_evidencia: { n: 6, exactitud, violaciones_rn02: violaciones, validacion: validacion('validada') },
    },
    revisada: { recuperacion: { total: { n: 0, recall_at_10: null } } },
  },
});

describe('compararConBaseline', () => {
  it('no reporta regresiones cuando el reporte es idéntico al baseline [US-074 AC-5]', () => {
    const resultado = compararConBaseline(reporteCon(), reporteCon(), { tolerancia: 0 });

    expect(resultado.regresiones).toEqual([]);
  });

  it('nombra la métrica cuando cae por debajo del baseline más que la tolerancia [US-074 AC-5]', () => {
    const resultado = compararConBaseline(reporteCon({ recall: 0.5 }), reporteCon(), { tolerancia: 0 });

    expect(resultado.regresiones.map((r) => r.metrica)).toEqual(['completa.recuperacion.total.recall_at_10']);
    expect(resultado.regresiones[0]).toMatchObject({ baseline: 1, actual: 0.5 });
  });

  it('tolera una caída menor o igual a la tolerancia configurada [US-074 AC-5]', () => {
    const resultado = compararConBaseline(reporteCon({ recall: 0.95 }), reporteCon(), { tolerancia: 0.05 });

    expect(resultado.regresiones).toEqual([]);
  });

  it('trata una métrica donde menos es mejor como regresión cuando sube [US-074 AC-5]', () => {
    const resultado = compararConBaseline(reporteCon({ violaciones: 1 }), reporteCon(), { tolerancia: 0 });

    expect(resultado.regresiones.map((r) => r.metrica)).toEqual(['completa.sin_evidencia.violaciones_rn02']);
  });

  it('no tolera ningún aumento de violaciones aunque la tolerancia sea mayor [US-074 AC-5]', () => {
    const resultado = compararConBaseline(reporteCon({ violaciones: 1 }), reporteCon(), { tolerancia: 1 });

    expect(resultado.regresiones.map((r) => r.metrica)).toEqual(['completa.sin_evidencia.violaciones_rn02']);
  });

  it('no cuenta una mejora como regresión [US-074 AC-5]', () => {
    const resultado = compararConBaseline(reporteCon({ exactitud: 1 }), reporteCon({ exactitud: 0.8 }), { tolerancia: 0 });

    expect(resultado.regresiones).toEqual([]);
    expect(resultado.filas.find((f) => f.metrica.endsWith('exactitud')).estado).toBe('mejora');
  });

  it('cuenta como regresión una métrica del baseline que el reporte ya no trae o trae sin valor [US-074 AC-5]', () => {
    const sinRecall = reporteCon();
    sinRecall.metricas.completa.recuperacion.total.recall_at_10 = null;

    const resultado = compararConBaseline(sinRecall, reporteCon(), { tolerancia: 0 });

    expect(resultado.regresiones.map((r) => r.metrica)).toEqual(['completa.recuperacion.total.recall_at_10']);
  });

  it('ignora los conteos, los intervalos de confianza y las métricas sin valor en el baseline [US-074 AC-5]', () => {
    const metricas = compararConBaseline(reporteCon(), reporteCon(), { tolerancia: 0 }).filas.map((f) => f.metrica);

    expect(metricas).toEqual(['completa.recuperacion.total.recall_at_10', 'completa.sin_evidencia.exactitud', 'completa.sin_evidencia.violaciones_rn02']);
  });

  it('rotula cada métrica con la marca de validación de su sección [US-074 AC-6]', () => {
    const filas = compararConBaseline(reporteCon(), reporteCon(), { tolerancia: 0 }).filas;

    expect(filas.map((f) => f.rotulo)).toEqual(['no_validada', 'validada', 'validada']);
  });
});

describe('compararConBaseline con las métricas de privacidad y lenguaje (L1D-235b)', () => {
  const informe = ({ salida = 0, cruda = 3, efectivas = 0, nube = 0, casos = 6, afirmaciones = 10, soportadas = 8 } = {}) => ({
    metricas: {
      completa: {
        terminos_prohibidos: { salida_mostrada: salida, propuesta_cruda: cruda, casos },
        inyeccion: { efectivas, casos },
        privacidad: { llamadas_nube_datos_reales: nube },
        generacion: { afirmaciones, soportadas },
      },
    },
  });
  const regresiones = (actual, baseline = informe(), tolerancia = 0) => compararConBaseline(actual, baseline, { tolerancia }).regresiones.map((r) => r.metrica);

  it.each([
    ['terminos_prohibidos.salida_mostrada', { salida: 1 }],
    ['inyeccion.efectivas', { efectivas: 1 }],
    ['privacidad.llamadas_nube_datos_reales', { nube: 1 }],
  ])('cuenta como regresión que %s pase de 0 a más, aunque la tolerancia sea mayor [US-074 AC-5]', (metrica, cambio) => {
    expect(regresiones(informe(cambio), informe(), 1)).toEqual([`completa.${metrica}`]);
  });

  it('trata terminos_prohibidos.propuesta_cruda como informativa y nunca como regresión [US-074 AC-5]', () => {
    const comparacion = compararConBaseline(informe({ cruda: 40 }), informe({ cruda: 3 }), { tolerancia: 0 });

    expect(comparacion.regresiones).toEqual([]);
    expect(comparacion.filas.find((f) => f.metrica.endsWith('propuesta_cruda')).estado).toBe('informativa');
  });

  it('bloquea el nivel A de lo mostrado y deja el nivel B como seguimiento informativo [L1D-298 AC-2]', () => {
    const conNiveles = ({ a = 0, b = 0 } = {}) => ({
      metricas: { completa: { terminos_prohibidos: { salida_mostrada_nivel_a: a, salida_mostrada_nivel_b: b, salida_mostrada_por_nivel: { A: a, B: b } } } },
    });

    expect(regresiones(conNiveles({ a: 1 }), conNiveles(), 1)).toEqual([
      'completa.terminos_prohibidos.salida_mostrada_nivel_a',
      'completa.terminos_prohibidos.salida_mostrada_por_nivel.A',
    ]);
    const conB = compararConBaseline(conNiveles({ b: 3 }), conNiveles(), { tolerancia: 0 });
    expect(conB.regresiones).toEqual([]);
    expect(conB.filas.filter((f) => f.estado === 'informativa').map((f) => f.metrica)).toEqual([
      'completa.terminos_prohibidos.salida_mostrada_nivel_b',
      'completa.terminos_prohibidos.salida_mostrada_por_nivel.B',
    ]);
  });

  it('con la forma completa del reporte, salida_mostrada 1 (A+B) con nivel A 0 y nivel B 1 es regresión: hoy el comparador bloquea A+B [L1D-298 AC-2]', () => {
    const completo = ({ mostrada = 0, a = 0, b = 0 } = {}) => ({
      metricas: {
        completa: {
          terminos_prohibidos: {
            salida_mostrada: mostrada,
            salida_mostrada_nivel_a: a,
            salida_mostrada_nivel_b: b,
            salida_mostrada_por_nivel: { A: a, B: b },
          },
        },
      },
    });

    expect(regresiones(completo({ mostrada: 1, a: 0, b: 1 }), completo(), 1)).toEqual(['completa.terminos_prohibidos.salida_mostrada']);
  });

  it('no trata casos, afirmaciones ni soportadas como métricas de calidad [US-074 AC-5]', () => {
    const comparacion = compararConBaseline(informe({ casos: 1, afirmaciones: 1, soportadas: 0 }), informe(), { tolerancia: 0 });

    expect(comparacion.regresiones).toEqual([]);
    expect(comparacion.filas.map((f) => f.metrica)).not.toEqual(expect.arrayContaining([expect.stringMatching(/\.(casos|afirmaciones|soportadas)$/)]));
  });
});

describe('tablaMarkdown y textoSeguro', () => {
  it('escapa barras, saltos de línea, comillas invertidas y ángulos del nombre y del rótulo [US-074 AC-6]', () => {
    const fila = { metrica: 'a|b\n`c`<x>', baseline: 1, actual: 1, rotulo: 'no<va>lida', estado: 'igual' };

    const tabla = tablaMarkdown({ filas: [fila] });

    expect(tabla.split('\n')).toHaveLength(3);
    expect(tabla).not.toMatch(/[`<>]/);
    expect(tabla.split('\n')[2].split('|')).toHaveLength(7);
  });

  it('textoSeguro reemplaza cada carácter especial por ? [US-074 AC-6]', () => {
    expect(textoSeguro('a|b\r\n`c`<d>')).toBe('a?b???c??d?');
  });
});

describe('tablaMarkdown', () => {
  it('muestra la marca «validada / no validada» de cada métrica y marca la regresión [US-074 AC-6]', () => {
    const comparacion = compararConBaseline(reporteCon({ recall: 0.5 }), reporteCon(), { tolerancia: 0 });

    const tabla = tablaMarkdown(comparacion);

    expect(tabla).toContain('| completa.recuperacion.total.recall_at_10 | 1 | 0.5 | no validada | regresión |');
    expect(tabla).toContain('| completa.sin_evidencia.exactitud | 1 | 1 | validada | igual |');
  });
});
