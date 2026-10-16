import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { RAIZ, ejecutar, npmRun } from './soporte.mjs';

const PRUEBA_LARGA = 120_000;
const RAICES_GENERADAS = [
  'packages/api-contracts/src',
  'apps/clinical-api/openapi.yaml',
  'apps/rag-orchestrator/openapi.yaml',
  'apps/rag-orchestrator/app/schemas/generated',
];

const archivosDe = (ruta) => {
  const absoluta = path.join(RAIZ, ruta);
  const entradas = readdirSync(absoluta, { withFileTypes: true, recursive: true });
  return entradas.length ? entradas.filter((e) => e.isFile()).map((e) => path.join(e.parentPath, e.name)) : [];
};

const huellaDeGenerados = () => {
  const hash = createHash('sha256');
  const archivos = RAICES_GENERADAS.flatMap((ruta) =>
    ruta.endsWith('.yaml') ? [path.join(RAIZ, ruta)] : archivosDe(ruta),
  ).sort();
  for (const archivo of archivos) hash.update(archivo).update(readFileSync(archivo));
  return hash.digest('hex');
};

describe('lint y formato del repositorio', () => {
  it(
    'termina con 0 cuando el código del S1 está formateado y sin errores de lint [US-215 AC-1]',
    () => {
      const lint = npmRun('lint');
      const formato = npmRun('format:check');

      expect({ lint: lint.estado, salida: lint.salida }).toMatchObject({ lint: 0 });
      expect({ formato: formato.estado, salida: formato.salida }).toMatchObject({ formato: 0 });
    },
    PRUEBA_LARGA,
  );

  it(
    'no modifica lo generado ni los openapi.yaml cuando se ejecuta format [US-215 AC-1]',
    () => {
      const antes = huellaDeGenerados();

      const resultado = npmRun('format');

      expect(resultado.estado, resultado.salida).toBe(0);
      expect(huellaDeGenerados()).toBe(antes);
    },
    PRUEBA_LARGA,
  );

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
