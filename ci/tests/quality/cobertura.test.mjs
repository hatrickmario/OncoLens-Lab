import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  alertasDeCobertura,
  lineasCambiadas,
  medirLineasCambiadas,
} from '../../../scripts/quality/cobertura.mjs';
import { armarReporte } from '../../../scripts/quality/normalizar.mjs';
import { leerUmbrales } from '../../../scripts/quality/umbrales.mjs';
import { RAIZ } from './soporte.mjs';

// L1D-285 (test después): PR de fixture que cambia 10 líneas de un *.service.ts de clinical-api con 5 cubiertas, y 2 líneas
// de un archivo de scripts/ sin informe de cobertura.
const FIXTURES = path.join(import.meta.dirname, 'fixtures/cobertura');
const DIFF = readFileSync(path.join(FIXTURES, 'cambio.diff'), 'utf8');
const LCOV = readFileSync(path.join(FIXTURES, 'clinical-api.lcov'), 'utf8');
const INFORMES = [{ lcov: LCOV, base: 'apps/clinical-api' }];
// El umbral sale de la configuración; las rutas de alerta se fijan a un service para probar el filtro (la configuración real
// ya no incluye `*.service.ts`: decidido, usuario, 2026-10-24).
const COBERTURA = { ...leerUmbrales().coverage, alertPaths: ['apps/clinical-api/src/**/*.service.ts'] };

describe('cobertura de líneas cambiadas', () => {
  it('lee las líneas añadidas por archivo del diff sin contexto', () => {
    const cambios = lineasCambiadas(DIFF);

    expect([...cambios.get('apps/clinical-api/src/modules/x/x.service.ts')]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect([...cambios.get('scripts/herramienta.mjs')]).toEqual([6, 7]);
  });

  it('mide 5 de 10 líneas cubiertas y 50 % en el service, y omite el archivo sin informe [US-213 AC-11]', () => {
    expect(medirLineasCambiadas(DIFF, INFORMES, RAIZ)).toEqual([
      {
        archivo: 'apps/clinical-api/src/modules/x/x.service.ts',
        lineasCambiadas: 10,
        lineasCubiertas: 5,
        porcentaje: 50,
      },
    ]);
  });

  it('alerta con el porcentaje 50 y el umbral leído de la configuración sin producir ningún error [US-213 AC-11]', () => {
    const medidas = medirLineasCambiadas(DIFF, INFORMES, RAIZ);

    const alertas = alertasDeCobertura(medidas, COBERTURA);
    const reporte = armarReporte(leerUmbrales(), alertas, {
      ahora: new Date('2026-10-24T00:00:00Z'),
      commit: null,
      cobertura: medidas,
    });

    expect(alertas).toEqual([
      expect.objectContaining({
        tool: 'cobertura-lineas-cambiadas',
        file: 'apps/clinical-api/src/modules/x/x.service.ts',
        measured: 50,
        threshold: COBERTURA.changedLinesWarn,
        severity: 'warn',
      }),
    ]);
    expect(reporte.resumen).toEqual({ errores: 0, alertas: 1 });
    expect(reporte.cobertura[0].porcentaje).toBe(50);
  });

  it('usa el umbral de la configuración y no uno fijo en el script [US-213 AC-11] [RN-22]', () => {
    const medidas = medirLineasCambiadas(DIFF, INFORMES, RAIZ);

    expect(alertasDeCobertura(medidas, { ...COBERTURA, changedLinesWarn: 50 })).toEqual([]);
    expect(alertasDeCobertura(medidas, { ...COBERTURA, changedLinesWarn: 51 })).toHaveLength(1);
  });

  it('no alerta por un archivo fuera de las rutas acotadas aunque tenga 0 % [US-213 AC-11]', () => {
    const medidas = [{ archivo: 'scripts/herramienta.mjs', lineasCambiadas: 2, lineasCubiertas: 0, porcentaje: 0 }];

    expect(alertasDeCobertura(medidas, COBERTURA)).toEqual([]);
  });
});

describe('rutas de alerta de la configuración real', () => {
  it('no incluye *.service.ts porque el LCOV del unitario no mide la integración [US-213 AC-11]', () => {
    const { alertPaths } = leerUmbrales().coverage;

    expect(alertPaths.some((ruta) => ruta.endsWith('.service.ts'))).toBe(false);
    expect(alertPaths).toContain('apps/web/lib/**');
  });
});
