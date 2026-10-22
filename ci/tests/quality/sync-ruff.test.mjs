import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  estaSincronizado,
  sincronizarPyproject,
} from '../../../scripts/quality/sync-ruff-thresholds.mjs';
import { ejecutar, exigirRuff } from './soporte.mjs';

const UMBRALES = { c901MaxComplexity: 10, plr0915MaxStatements: 50 };
const PYPROJECT_BASE = '[tool.ruff]\nline-length = 100\n';

/** Función con 11 ramas independientes: complejidad ciclomática 11. */
const FUNCION_COMPLEJIDAD_11 = `def decidir(x):\n${Array.from({ length: 10 }, (_, i) => `    if x == ${i}:\n        return ${i}`).join('\n')}\n    return -1\n`;

/** Función con 51 asignaciones (Ruff no cuenta el `return`): supera PLR0915 = 50. */
const FUNCION_51_SENTENCIAS = `def larga():\n${Array.from({ length: 51 }, (_, i) => `    v${i} = ${i}`).join('\n')}\n    return v0\n`;

/** Ejecuta Ruff como lo hace `npm run quality` (solo C901 y PLR0915) sobre un directorio con pyproject y código. */
function medir(pyproject, codigo) {
  exigirRuff();
  const directorio = mkdtempSync(path.join(tmpdir(), 'oncolens-ruff-'));
  writeFileSync(path.join(directorio, 'pyproject.toml'), pyproject);
  writeFileSync(path.join(directorio, 'f.py'), codigo);
  const resultado = ejecutar(
    'ruff',
    ['check', '.', '--select', 'C901,PLR0915', '--output-format', 'json'],
    { cwd: directorio },
  );
  return JSON.parse(resultado.salida || '[]').map((d) => ({ regla: d.code, mensaje: d.message }));
}

describe('sincronizarPyproject', () => {
  it('añade las secciones mccabe y pylint con los valores de los umbrales cuando el pyproject no las tiene', () => {
    const texto = sincronizarPyproject(PYPROJECT_BASE, UMBRALES);

    expect(texto).toContain('[tool.ruff.lint.mccabe]\nmax-complexity = 10');
    expect(texto).toContain('[tool.ruff.lint.pylint]\nmax-statements = 50');
    expect(texto.startsWith(PYPROJECT_BASE)).toBe(true);
  });

  it('es idempotente cuando se sincroniza dos veces con los mismos umbrales', () => {
    const una = sincronizarPyproject(PYPROJECT_BASE, UMBRALES);

    expect(sincronizarPyproject(una, UMBRALES)).toBe(una);
  });

  it('reemplaza el bloque anterior sin duplicarlo cuando cambia un umbral', () => {
    const una = sincronizarPyproject(PYPROJECT_BASE, UMBRALES);
    const otra = sincronizarPyproject(una, { ...UMBRALES, c901MaxComplexity: 12 });

    expect(otra).toContain('max-complexity = 12');
    expect(otra).not.toContain('max-complexity = 10');
    expect(otra.match(/\[tool\.ruff\.lint\.mccabe\]/g)).toHaveLength(1);
  });
});

describe('estaSincronizado', () => {
  it('es falso cuando el pyproject no tiene el bloque', () => {
    expect(estaSincronizado(PYPROJECT_BASE, UMBRALES)).toBe(false);
  });

  it('es falso cuando un valor del pyproject difiere del umbral', () => {
    const desfasado = sincronizarPyproject(PYPROJECT_BASE, UMBRALES);

    expect(estaSincronizado(desfasado, { ...UMBRALES, plr0915MaxStatements: 60 })).toBe(false);
  });

  it('es verdadero cuando el pyproject se generó con los mismos umbrales', () => {
    expect(estaSincronizado(sincronizarPyproject(PYPROJECT_BASE, UMBRALES), UMBRALES)).toBe(true);
  });
});

describe('umbrales de Ruff en rag-orchestrator', () => {
  it('falla con C901 nombrando la función cuando la complejidad es 11 y el umbral 10 [US-213 AC-5]', () => {
    const hallazgos = medir(sincronizarPyproject(PYPROJECT_BASE, UMBRALES), FUNCION_COMPLEJIDAD_11);

    expect(hallazgos).toEqual([
      expect.objectContaining({ regla: 'C901', mensaje: expect.stringMatching(/`decidir`.*11 > 10/) }),
    ]);
  });

  it('falla con PLR0915 nombrando el umbral cuando una función tiene 51 sentencias [US-213 AC-5]', () => {
    const hallazgos = medir(sincronizarPyproject(PYPROJECT_BASE, UMBRALES), FUNCION_51_SENTENCIAS);

    expect(hallazgos).toEqual([
      expect.objectContaining({ regla: 'PLR0915', mensaje: expect.stringContaining('> 50') }),
    ]);
  });

  it('pasa sin editar otro archivo cuando solo se sube c901MaxComplexity en los umbrales y se sincroniza [US-213 AC-6]', () => {
    const subido = { ...UMBRALES, c901MaxComplexity: 12 };

    expect(medir(sincronizarPyproject(PYPROJECT_BASE, subido), FUNCION_COMPLEJIDAD_11)).toEqual([]);
  });
});

describe('sync-ruff-thresholds --check sobre el repositorio', () => {
  it('termina en 0 cuando apps/rag-orchestrator/pyproject.toml está sincronizado con quality-thresholds.json [US-213 AC-6]', () => {
    const resultado = ejecutar('node', ['scripts/quality/sync-ruff-thresholds.mjs', '--check']);

    expect(resultado.salida).toContain('sincronizado');
    expect(resultado.estado).toBe(0);
  });
});
