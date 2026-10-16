import { describe, expect, it } from 'vitest';
import { ejecutar, npmRun } from './soporte.mjs';

const PRUEBA_LARGA = 120_000;

describe('lint y formato del repositorio', () => {
  it(
    'termina con 0 cuando el código del S1 está formateado y sin errores de lint [US-215 AC-1]',
    () => {
      const lint = npmRun('lint');
      const formato = npmRun('format:check');

      expect(lint.estado, lint.salida).toBe(0);
      expect(formato.estado, formato.salida).toBe(0);
    },
    PRUEBA_LARGA,
  );

  // "No modifica lo generado ni los openapi.yaml cuando se ejecuta format [US-215 AC-1]" reescribe el árbol:
  // vive en el caso de PR ci/tests/cases/ac1-format-no-toca-generados, que corre sobre un clon.

  it('falla e indica cómo instalar ruff cuando no está en el PATH [US-215 AC-1]', () => {
    const sinRuff = ejecutar(process.execPath, ['scripts/quality/ruff.mjs', '--check'], {
      env: { ...process.env, PATH: '' },
    });

    expect(sinRuff.estado).toBe(1);
    expect(sinRuff.salida).toContain(
      'ruff no encontrado: pip install -r apps/rag-orchestrator/requirements-dev.txt',
    );
  });
});
