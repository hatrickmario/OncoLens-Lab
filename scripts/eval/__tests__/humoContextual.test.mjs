/**
 * Humo de la familia `contextual` (US-271 AC-9, L1D-329): el proceso real del envoltorio, con la configuración de la CI
 * (adapters falsos, sin modelos ni red), sale con 0 y escribe el informe en un directorio temporal. Necesita las
 * dependencias de Python de `requirements-eval.txt` (EVAL_PYTHON elige el intérprete), como el resto de las pruebas que
 * ejecutan `evaluate` de verdad.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const RAIZ = path.resolve(import.meta.dirname, '../../..');
const TIEMPO_MAXIMO_MS = 60_000;

describe('evaluate --suite contextual (humo del proceso real)', { timeout: TIEMPO_MAXIMO_MS }, () => {
  let salida;

  afterEach(() => {
    if (salida) rmSync(salida, { recursive: true, force: true });
  });

  it('sale con 0 y escribe el informe con las tres preguntas de sinónimos cuando corre con la configuración de la CI [US-271 AC-9]', () => {
    salida = mkdtempSync(path.join(os.tmpdir(), 'ctx-humo-'));

    const resultado = spawnSync(
      'node',
      ['scripts/eval/evaluate.mjs', '--suite', 'contextual', '--salida', salida, '--nombre-archivo', 'informe'],
      { cwd: RAIZ, encoding: 'utf8', env: process.env, timeout: TIEMPO_MAXIMO_MS },
    );

    expect(resultado.status, `${resultado.stdout}${resultado.stderr}`).toBe(0);
    expect(existsSync(path.join(salida, 'informe.md'))).toBe(true);
    const informe = JSON.parse(readFileSync(path.join(salida, 'informe.json'), 'utf8'));
    expect(informe.suite).toBe('contextual');
    expect(new Set(informe.sinonimos.map((s) => s.pregunta_id))).toEqual(new Set(['CTX-C12', 'CTX-C13', 'CTX-C14']));
    expect(informe.sinonimos.every((s) => s.supero_umbral || s.causa !== null)).toBe(true);
  });

  it('sale con 0 y reporta la cobertura de los dos casos de próstata sobre las 180 consultas cuando corre con la configuración de la CI [US-273 AC-2]', () => {
    salida = mkdtempSync(path.join(os.tmpdir(), 'ctx-humo-'));

    const resultado = spawnSync(
      'node',
      ['scripts/eval/evaluate.mjs', '--suite', 'contextual', '--salida', salida, '--nombre-archivo', 'informe'],
      { cwd: RAIZ, encoding: 'utf8', env: process.env, timeout: TIEMPO_MAXIMO_MS },
    );

    expect(resultado.status, `${resultado.stdout}${resultado.stderr}`).toBe(0);
    const informe = JSON.parse(readFileSync(path.join(salida, 'informe.json'), 'utf8'));
    expect(informe.preguntas).toHaveLength(180);
    expect(informe.cobertura.map((c) => c.caso)).toEqual(['mama-completo', 'prostata-con-grado', 'prostata-con-psa-y-hrr']);
    const config = readFileSync(path.join(RAIZ, 'apps', 'rag-orchestrator', 'eval', 'configs', 'contextual-fake.yaml'), 'utf8');
    const meta = Number(/genericas_con_evidencia_minimo:\s*(\d+)/.exec(config)[1]);
    const preguntas = readFileSync(path.join(RAIZ, 'data', 'eval', 's5-corpus-ampliado', 'preguntas-contextuales.yaml'), 'utf8');
    const genericas = (preguntas.match(/clase: generica/g) ?? []).length;
    expect(informe.cobertura.every((c) => c.genericas_total === genericas && c.minimo === meta)).toBe(true);
    expect(informe.comparacion).toBeNull();
  });
});
