import { copyFileSync, cpSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { evaluarImportLinter } from '../../../scripts/quality/normalizar.mjs';
import { RAIZ, ejecutar } from './soporte.mjs';

const FIXTURES = path.join(import.meta.dirname, 'fixtures/capas-python');
const CONTRATOS = path.join(RAIZ, 'apps/rag-orchestrator/.importlinter');
const DIRECTORIO = 'apps/rag-orchestrator';

/** Corre `lint-imports` sobre un fixture con los contratos reales (o el texto dado) y evalúa su resultado. */
function evaluar(caso, { configuracion = null } = {}) {
  const destino = mkdtempSync(path.join(tmpdir(), 'oncolens-importlinter-'));
  cpSync(path.join(FIXTURES, caso), destino, { recursive: true });
  if (configuracion === null) copyFileSync(CONTRATOS, path.join(destino, '.importlinter'));
  else writeFileSync(path.join(destino, '.importlinter'), configuracion);
  const resultado = ejecutar('lint-imports', [], { cwd: destino });
  return () => evaluarImportLinter(resultado.estado, resultado.salida, DIRECTORIO);
}

describe('evaluación de import-linter', () => {
  it('no devuelve hallazgos cuando los dos contratos se cumplen [US-213 AC-3]', () => {
    expect(evaluar('limpio')()).toEqual([]);
  });

  it('devuelve el hallazgo del primer import cuando el dominio importa infrastructure en dos líneas [US-213 AC-3]', () => {
    const hallazgos = evaluar('dominio-varias-lineas')();

    expect(hallazgos.length).toBeGreaterThanOrEqual(1);
    expect(hallazgos[0]).toMatchObject({
      rule: 'dominio-independiente',
      file: 'apps/rag-orchestrator/app/domain/regla.py',
      line: 1,
    });
  });

  it('rompe dominio-independiente cuando el dominio importa app.config [US-213 AC-3]', () => {
    const hallazgos = evaluar('dominio-config')();

    expect(hallazgos).toContainEqual(
      expect.objectContaining({
        rule: 'dominio-independiente',
        symbol: 'app.domain.regla -> app.config.ajustes',
      }),
    );
  });

  it('falla cuando la configuración apunta a un paquete raíz que no existe [US-213 AC-3]', () => {
    const configuracion = '[importlinter]\nroot_package = appx\n';

    expect(evaluar('limpio', { configuracion })).toThrow(/import-linter/);
  });

  it('falla nombrando el contrato ausente cuando la configuración no declara contratos [US-213 AC-3]', () => {
    const configuracion = '[importlinter]\nroot_package = app\n';

    expect(evaluar('limpio', { configuracion })).toThrow(/dominio-independiente/);
  });
});
