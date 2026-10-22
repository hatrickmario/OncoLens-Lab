import { copyFileSync, cpSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { desdeImportLinter } from '../../../scripts/quality/normalizar.mjs';
import { RAIZ, ejecutar } from './soporte.mjs';

const FIXTURES = path.join(import.meta.dirname, 'fixtures/capas-python');
const CONTRATOS = path.join(RAIZ, 'apps/rag-orchestrator/.importlinter');

/** Falla con la instrucción de instalación cuando `lint-imports` no está en el PATH (nunca se omite un test). */
function exigirImportLinter() {
  if (ejecutar('lint-imports', ['--help']).error?.code === 'ENOENT') {
    throw new Error(
      'lint-imports no encontrado: pip install -r apps/rag-orchestrator/requirements-dev.txt',
    );
  }
}

/** Copia el fixture a un directorio temporal junto con los contratos REALES de rag-orchestrator y los evalúa. */
function analizar(caso) {
  exigirImportLinter();
  const destino = mkdtempSync(path.join(tmpdir(), 'oncolens-importlinter-'));
  cpSync(path.join(FIXTURES, caso), destino, { recursive: true });
  copyFileSync(CONTRATOS, path.join(destino, '.importlinter'));
  return ejecutar('lint-imports', [], { cwd: destino });
}

describe('contratos de import-linter de rag-orchestrator', () => {
  it('cumple los dos contratos cuando api e infrastructure dependen de application y esta del dominio [US-213 AC-3]', () => {
    const resultado = analizar('limpio');

    expect(resultado.estado).toBe(0);
    expect(resultado.salida).toContain('dominio-independiente KEPT');
    expect(resultado.salida).toContain('capas-hexagonales KEPT');
  });

  it('rompe dominio-independiente y nombra el import cuando el dominio importa infrastructure [US-213 AC-3]', () => {
    const resultado = analizar('dominio-infraestructura');

    expect(resultado.estado).not.toBe(0);
    expect(resultado.salida).toContain('dominio-independiente BROKEN');
    expect(resultado.salida).toContain('app.domain.regla -> app.infrastructure.adaptador');
  });

  it('rompe capas-hexagonales cuando application importa api [US-213 AC-3]', () => {
    const resultado = analizar('application-api');

    expect(resultado.estado).not.toBe(0);
    expect(resultado.salida).toContain('capas-hexagonales BROKEN');
    expect(resultado.salida).toContain('app.application.servicio -> app.api.ruta');
  });

  it('rompe capas-hexagonales cuando api importa infrastructure [US-213 AC-3]', () => {
    const resultado = analizar('api-infraestructura');

    expect(resultado.estado).not.toBe(0);
    expect(resultado.salida).toContain('capas-hexagonales BROKEN');
    expect(resultado.salida).toContain('app.api.ruta -> app.infrastructure.adaptador');
  });

  it('normaliza cada import prohibido al hallazgo común con regla, archivo y símbolo [US-213 AC-3]', () => {
    const { salida } = analizar('dominio-infraestructura');

    const hallazgos = desdeImportLinter(salida, 'apps/rag-orchestrator');

    expect(hallazgos).toContainEqual(
      expect.objectContaining({
        tool: 'import-linter',
        rule: 'dominio-independiente',
        file: 'apps/rag-orchestrator/app/domain/regla.py',
        symbol: 'app.domain.regla -> app.infrastructure.adaptador',
      }),
    );
  });
});
