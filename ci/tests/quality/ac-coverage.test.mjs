import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { armarReporte } from '../../../scripts/quality/normalizar.mjs';
import { historiaDelChange, verificarCoberturaDeAc } from '../../../scripts/quality/check-ac-coverage.mjs';
import { validarUmbrales } from '../../../scripts/quality/umbrales.mjs';

// L1D-285 (test después): fixtures con un change activo US-900 (AC-1 y AC-2) bajo ci/tests/quality/fixtures/ac-coverage/.
const FIXTURES = path.join(import.meta.dirname, 'fixtures/ac-coverage');
const UMBRALES = validarUmbrales({
  maxLinesPerFunction: 40,
  complexity: 10,
  c901MaxComplexity: 10,
  plr0915MaxStatements: 50,
  web: { componentLinesWarn: 100, componentLinesError: 150 },
  coverage: { changedLinesWarn: 80, alertPaths: ['apps/clinical-api/src/**/*.service.ts'] },
});
const simbolos = (caso) => verificarCoberturaDeAc(path.join(FIXTURES, caso)).map((h) => h.symbol);

describe('check-ac-coverage', () => {
  it('alerta solo por US-900 AC-2 y nombra el change cuando AC-1 tiene un test tagueado [US-213 AC-9]', () => {
    const hallazgos = verificarCoberturaDeAc(path.join(FIXTURES, 'vitest'));

    expect(hallazgos).toEqual([
      expect.objectContaining({
        tool: 'check-ac-coverage',
        rule: 'ac-sin-test-de-aceptacion',
        file: 'openspec/changes/us-900-fixture/proposal.md',
        symbol: 'US-900 AC-2 (change us-900-fixture)',
        severity: 'warn',
      }),
    ]);
  });

  it('cuenta @pytest.mark.ac como test de aceptación y no alerta por US-900 AC-1 [US-213 AC-9]', () => {
    expect(simbolos('pytest')).toEqual(['US-900 AC-2 (change us-900-fixture)']);
  });

  it('cuenta un test de aceptación que vive en infra/**/__tests__ [US-213 AC-9]', () => {
    expect(simbolos('infra')).toEqual([]);
  });

  it('respeta el rango de AC de una historia partida y no alerta por los AC fuera de él [US-213 AC-9]', () => {
    expect(simbolos('partida')).toEqual(['US-900 AC-2 (change us-900-fixture)']);
  });

  it('no alerta por un change archivado ni por los tests sin tag [US-213 AC-9]', () => {
    const cambios = verificarCoberturaDeAc(path.join(FIXTURES, 'vitest')).map((h) => h.file);

    expect(cambios.some((archivo) => archivo.includes('archive'))).toBe(false);
  });

  it('deja el reporte sin errores y con una alerta, de modo que el job termina con código 0 [US-213 AC-9]', () => {
    const hallazgos = verificarCoberturaDeAc(path.join(FIXTURES, 'vitest'));

    const reporte = armarReporte(UMBRALES, hallazgos, { ahora: new Date('2026-10-24T00:00:00Z'), commit: null });

    expect(reporte.resumen).toEqual({ errores: 0, alertas: 1 });
  });
});

describe('historiaDelChange', () => {
  it.each([
    ['L1D-285 · **US-213b** (AC-8…AC-13) · FEAT-PL1', { historia: 'US-213', rango: [8, 13] }],
    ['L1D-202 · US-048 · FEAT-T4a (L1D-40)', { historia: 'US-048', rango: null }],
    ['US-117b · FEAT-06c', { historia: 'US-117', rango: null }],
  ])('lee la historia y el rango de «%s»', (linea, esperado) => {
    expect(historiaDelChange(`# P\n\n## Trazabilidad\n\n${linea}\n`)).toEqual(esperado);
  });

  it('devuelve null cuando la Trazabilidad no abre con una historia', () => {
    expect(historiaDelChange('# P\n\n## Trazabilidad\n\nADR-39 · FEAT-06a\n')).toBeNull();
  });
});
