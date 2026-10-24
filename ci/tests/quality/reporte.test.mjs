import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  armarReporte,
  buscarDesactivacionesDeTamano,
  desdeDependencyCruiser,
  desdeImportLinter,
  desdeRuff,
  describir,
  ordenar,
  sinAlertaDondeHayError,
} from '../../../scripts/quality/normalizar.mjs';
import { leerUmbrales } from '../../../scripts/quality/umbrales.mjs';
import { RAIZ, ejecutar, npmRun } from './soporte.mjs';

const RAIZ_FALSA = '/repo';

describe('normalización de hallazgos', () => {
  it('convierte una violación de dependency-cruiser en regla, archivo e import prohibido [US-213 AC-2]', () => {
    const informe = {
      summary: {
        violations: [
          {
            type: 'dependency',
            from: 'apps/clinical-api/src/modules/x/x.controller.ts',
            to: 'node_modules/@prisma/client/default.js',
            rule: { name: 'controller-sin-acceso-a-datos', severity: 'error' },
          },
        ],
      },
    };

    expect(desdeDependencyCruiser(informe)).toEqual([
      expect.objectContaining({
        tool: 'dependency-cruiser',
        rule: 'controller-sin-acceso-a-datos',
        file: 'apps/clinical-api/src/modules/x/x.controller.ts',
        symbol: 'node_modules/@prisma/client/default.js',
        severity: 'error',
      }),
    ]);
  });

  it('describe el ciclo completo como símbolo cuando la violación es circular [US-213 AC-2]', () => {
    const informe = {
      summary: {
        violations: [
          {
            from: 'a.ts',
            to: 'b.ts',
            cycle: [{ name: 'b.ts' }, { name: 'a.ts' }],
            rule: { name: 'sin-ciclos', severity: 'error' },
          },
        ],
      },
    };

    expect(desdeDependencyCruiser(informe)[0].symbol).toBe('a.ts → b.ts → a.ts');
  });

  it('extrae símbolo, valor medido y umbral del mensaje de Ruff [US-213 AC-5]', () => {
    const diagnosticos = [
      {
        code: 'C901',
        filename: `${RAIZ_FALSA}/apps/rag-orchestrator/app/x.py`,
        location: { row: 12, column: 5 },
        message: '`ramificada` is too complex (11 > 10)',
      },
    ];

    expect(desdeRuff(diagnosticos, RAIZ_FALSA)).toEqual([
      expect.objectContaining({
        tool: 'ruff',
        rule: 'C901',
        file: 'apps/rag-orchestrator/app/x.py',
        line: 12,
        symbol: 'ramificada',
        measured: 11,
        threshold: 10,
      }),
    ]);
  });

  it('extrae contrato, import y línea de un contrato roto de import-linter [US-213 AC-3]', () => {
    const texto = [
      '----------------',
      'Broken contracts',
      '----------------',
      '',
      'dominio-independiente',
      '---------------------',
      '',
      'app.domain is not allowed to import app.infrastructure:',
      '',
      '-   app.domain.a -> app.infrastructure.x (l.1)',
      '',
    ].join('\n');

    expect(desdeImportLinter(texto, 'apps/rag-orchestrator')).toEqual([
      expect.objectContaining({
        tool: 'import-linter',
        rule: 'dominio-independiente',
        file: 'apps/rag-orchestrator/app/domain/a.py',
        line: 1,
        symbol: 'app.domain.a -> app.infrastructure.x',
      }),
    ]);
  });

  it('no devuelve hallazgos cuando import-linter no rompe ningún contrato [US-213 AC-3]', () => {
    expect(desdeImportLinter('Contracts: 2 kept, 0 broken.\n', 'apps/rag-orchestrator')).toEqual(
      [],
    );
  });

  it('descarta la alerta de tamaño de un archivo que ya falla por el límite duro [US-213 AC-7]', () => {
    const base = { tool: 'eslint', rule: 'max-lines', file: 'a.tsx', line: 1 };
    const hallazgos = [
      { ...base, severity: 'warn', measured: 160, threshold: 100 },
      { ...base, severity: 'error', measured: 160, threshold: 150 },
    ];

    expect(sinAlertaDondeHayError(hallazgos)).toEqual([hallazgos[1]]);
  });

  it('ordena de forma estable por herramienta, regla, archivo y línea', () => {
    const h = (tool, rule, file, line) => ({ tool, rule, file, line });

    const ordenados = ordenar([
      h('ruff', 'C901', 'b.py', 2),
      h('eslint', 'complexity', 'a.ts', 9),
      h('eslint', 'complexity', 'a.ts', 3),
    ]);

    expect(ordenados.map((x) => `${x.tool}:${x.file}:${x.line}`)).toEqual([
      'eslint:a.ts:3',
      'eslint:a.ts:9',
      'ruff:b.py:2',
    ]);
  });

  it('describe el hallazgo con regla, archivo, símbolo, valor medido y umbral [US-213 AC-4]', () => {
    const linea = describir({
      tool: 'eslint',
      rule: 'max-lines-per-function',
      file: 'apps/clinical-api/src/x.ts',
      line: 7,
      symbol: 'larga',
      measured: 41,
      threshold: 40,
      severity: 'error',
    });

    expect(linea).toBe(
      '[eslint] ERROR max-lines-per-function apps/clinical-api/src/x.ts:7 larga medido 41, umbral 40',
    );
  });
});

describe('desactivaciones de reglas de tamaño', () => {
  const buscar = (texto) => buscarDesactivacionesDeTamano([{ file: 'apps/x.ts', texto }]);

  it('marca un eslint-disable-next-line de max-lines-per-function [US-213 AC-4]', () => {
    expect(buscar('// eslint-disable-next-line max-lines-per-function\nfunction f() {}')).toEqual([
      expect.objectContaining({ rule: 'sin-eslint-disable-de-tamano', file: 'apps/x.ts', line: 1 }),
    ]);
  });

  it('marca un bloque eslint-disable que silencia todo [US-213 AC-4]', () => {
    expect(buscar('/* eslint-disable */\nconst a = 1;')).toHaveLength(1);
  });

  it('no marca un eslint-disable de otra regla [US-213 AC-4]', () => {
    expect(buscar('// eslint-disable-next-line no-console -- registro de arranque')).toEqual([]);
  });
});

describe('armado del reporte', () => {
  it('registra generadoEn y commit inyectados y cuenta errores y alertas [US-213 AC-1]', () => {
    const hallazgos = [{ severity: 'error' }, { severity: 'warn' }, { severity: 'warn' }];
    const umbrales = { maxLinesPerFunction: 40, excepciones: [] };

    const reporte = armarReporte(umbrales, hallazgos, {
      ahora: new Date('2026-10-22T10:00:00Z'),
      commit: 'abc123',
    });

    expect(reporte).toMatchObject({
      generadoEn: '2026-10-22T10:00:00.000Z',
      commit: 'abc123',
      resumen: { errores: 1, alertas: 2 },
    });
  });
});

const rutaDe = (programa) => ejecutar('which', [programa]).salida.trim();

describe('npm run quality con una herramienta ausente', () => {
  it('termina en 1 y no deja un latest.json viejo cuando ruff no está en el PATH [US-213 AC-1]', () => {
    const reporte = path.join(RAIZ, 'reports/quality/latest.json');
    mkdirSync(path.dirname(reporte), { recursive: true });
    writeFileSync(reporte, '{"viejo":true}');

    const resultado = ejecutar(process.execPath, ['scripts/quality/quality.mjs', '--reporte'], {
      // Node y Git (la cobertura de líneas cambiadas lo necesita y lanza si falta), sin Ruff.
      env: { ...process.env, PATH: [path.dirname(process.execPath), path.dirname(rutaDe('git'))].join(path.delimiter) },
    });

    expect(resultado.estado, resultado.salida).toBe(1);
    expect(resultado.salida).toContain('ruff');
    expect(existsSync(reporte)).toBe(false);
  }, 180_000);
});

describe('npm run quality:report sobre el monorepo', () => {
  it('termina con 0 y escribe reports/quality/latest.json con el resumen y los umbrales [US-213 AC-1]', () => {
    const resultado = npmRun('quality:report');

    expect(resultado.estado, resultado.salida).toBe(0);
    const reporte = JSON.parse(
      readFileSync(path.join(RAIZ, 'reports/quality/latest.json'), 'utf8'),
    );
    expect(reporte.resumen.errores).toBe(0);
    expect(reporte.umbrales.maxLinesPerFunction).toBe(leerUmbrales().maxLinesPerFunction);
    expect(Array.isArray(reporte.hallazgos)).toBe(true);
    expect(Array.isArray(reporte.excepcionesVigentes)).toBe(true);
  }, 180_000);
});
