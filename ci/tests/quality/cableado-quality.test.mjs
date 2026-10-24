import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { hallazgosPropios } from '../../../scripts/quality/quality.mjs';
import { leerUmbrales } from '../../../scripts/quality/umbrales.mjs';

// L1D-285, Gate 2 #3 y #9: `quality` cablea de verdad sus chequeos propios. Se ejecuta con una raíz de fixture (no el texto
// fuente del script): quitar una llamada de `hallazgosPropios` hace fallar estos casos.
const RAIZ_FIXTURE = path.join(import.meta.dirname, 'fixtures/cableado');
const UMBRALES = leerUmbrales();
const TIEMPO_MAXIMO_MS = 60_000;
const MEDIDAS = [
  { archivo: 'apps/clinical-api/src/modules/x/x.service.ts', lineasCambiadas: 10, lineasCubiertas: 5, porcentaje: 50 },
];

const hallazgos = () => hallazgosPropios(RAIZ_FIXTURE, UMBRALES, MEDIDAS);
const por = (regla) => hallazgos().filter((h) => h.rule === regla);

describe('hallazgosPropios de quality', () => {
  it('marca como error un eslint-disable de vitest/no-disabled-tests aunque haya un it.skip debajo [US-213 AC-8]', () => {
    expect(por('sin-eslint-disable-de-higiene-de-tests')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: 'apps/clinical-api/tests/apaga-no-disabled.fixture.ts',
          line: 3,
          severity: 'error',
        }),
      ]),
    );
  }, TIEMPO_MAXIMO_MS);

  it('marca como error un eslint-disable de oncolens/mock-solo-en-bordes [US-213 AC-10]', () => {
    expect(por('sin-eslint-disable-de-higiene-de-tests').map((h) => h.file)).toContain(
      'apps/clinical-api/tests/apaga-mock.fixture.ts',
    );
  }, TIEMPO_MAXIMO_MS);

  it('invoca check-ac-coverage y alerta por el AC sin test de la raíz [US-213 AC-9]', () => {
    expect(por('ac-sin-test-de-aceptacion').map((h) => h.symbol)).toEqual(['US-900 AC-1 (change us-900-fixture)']);
  }, TIEMPO_MAXIMO_MS);

  it('invoca el estilo de Pytest (Ruff PT) con el pyproject de la raíz y el hallazgo llega como error [US-213 AC-8]', () => {
    expect(por('PT003')).toEqual([
      expect.objectContaining({
        file: 'apps/rag-orchestrator/tests/test_estilo.py',
        line: 4,
        severity: 'error',
        tool: 'ruff',
      }),
    ]);
  }, TIEMPO_MAXIMO_MS);

  it('invoca alertasDeCobertura con el umbral de la configuración cuando hay medidas [US-213 AC-11]', () => {
    expect(por('cobertura-de-lineas-cambiadas')).toEqual([
      expect.objectContaining({ measured: 50, threshold: UMBRALES.coverage.changedLinesWarn, severity: 'warn' }),
    ]);
  }, TIEMPO_MAXIMO_MS);

  it('no emite alerta de cobertura cuando no hay medidas [US-213 AC-11]', () => {
    expect(hallazgosPropios(RAIZ_FIXTURE, UMBRALES, null).filter((h) => h.rule === 'cobertura-de-lineas-cambiadas')).toEqual([]);
  }, TIEMPO_MAXIMO_MS);
});
