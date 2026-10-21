import { describe, expect, it } from 'vitest';
import { compararConBaseline, tablaMarkdown } from '../comparar-baseline.mjs';

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

describe('tablaMarkdown', () => {
  it('muestra la marca «validada / no validada» de cada métrica y marca la regresión [US-074 AC-6]', () => {
    const comparacion = compararConBaseline(reporteCon({ recall: 0.5 }), reporteCon(), { tolerancia: 0 });

    const tabla = tablaMarkdown(comparacion);

    expect(tabla).toContain('| completa.recuperacion.total.recall_at_10 | 1 | 0.5 | no validada | regresión |');
    expect(tabla).toContain('| completa.sin_evidencia.exactitud | 1 | 1 | validada | igual |');
  });
});
