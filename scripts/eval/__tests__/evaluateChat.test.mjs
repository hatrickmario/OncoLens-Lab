/**
 * `npm run evaluate:chat` (US-269, L1D-326): el envoltorio que encadena la preparación de peticiones y la familia `chat`.
 * Los tests EJECUTAN el comando real (proceso, intérprete de Python y familia de `rag-orchestrator`) con adapters falsos y
 * sin preparar: no tocan la base de datos. Tiempo máximo explícito: cargar la familia pasa de los 5 s por defecto.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DIRECTORIO_DE_PETICIONES, argumentosDePython, leerOpciones } from '../evaluate-chat.mjs';

const RAIZ = path.resolve(import.meta.dirname, '../../..');
const SCRIPT = path.join(RAIZ, 'scripts', 'eval', 'evaluate-chat.mjs');
const CONFIG_FAKE = 'apps/rag-orchestrator/eval/configs/chat-fake.yaml';
const CONFIG_LOCAL = 'apps/rag-orchestrator/eval/configs/chat-local.yaml';
const TIEMPO_MAXIMO_MS = 120_000;

const salidas = [];
const nuevaSalida = () => {
  const directorio = mkdtempSync(path.join(tmpdir(), 'evaluate-chat-'));
  salidas.push(directorio);
  return directorio;
};
afterEach(() => salidas.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

const correr = (argumentos) =>
  spawnSync('node', [SCRIPT, ...argumentos], {
    cwd: RAIZ,
    encoding: 'utf8',
    timeout: TIEMPO_MAXIMO_MS,
    env: { ...process.env, EVAL_TIMEOUT_S: '100' },
  });

describe('evaluate:chat con adapters falsos', () => {
  it(
    'termina con 0 y escribe chat.json con proveedor fake cuando corre chat-fake.yaml con --sin-preparar [US-269 AC-3] [AC-T5.1]',
    () => {
      const salida = nuevaSalida();

      const resultado = correr(['--config', CONFIG_FAKE, '--sin-preparar', '--salida', salida]);

      expect(resultado.status, resultado.stderr).toBe(0);
      const reporte = JSON.parse(readFileSync(path.join(salida, 'chat.json'), 'utf8'));
      expect(JSON.stringify(reporte)).toContain('"fake"');
    },
    TIEMPO_MAXIMO_MS,
  );

  it(
    'termina con 2 y no escribe ningún reporte cuando la configuración es local y no hay peticiones [US-269 AC-3]',
    () => {
      const salida = nuevaSalida();

      const resultado = correr(['--config', CONFIG_LOCAL, '--sin-preparar', '--salida', salida]);

      expect(resultado.status).toBe(2);
      expect(existsSync(path.join(salida, 'chat.json'))).toBe(false);
    },
    TIEMPO_MAXIMO_MS,
  );

  it('termina con 2 y muestra el uso cuando falta --config', () => {
    const resultado = correr(['--sin-preparar']);

    expect(resultado.status).toBe(2);
    expect(resultado.stderr).toContain('uso: evaluate:chat');
  });
});

describe('argumentos de evaluate:chat', () => {
  it('resuelve --config y --salida contra el directorio de trabajo y reconoce --sin-preparar', () => {
    expect(
      leerOpciones(['--config', 'a.yaml', '--salida', 'out', '--sin-preparar'], '/trabajo'),
    ).toEqual({
      config: path.resolve('/trabajo', 'a.yaml'),
      salida: path.resolve('/trabajo', 'out'),
      sinPreparar: true,
    });
  });

  it('rechaza un argumento desconocido o un valor ausente', () => {
    expect(leerOpciones(['--config', 'a.yaml', '--otra'])).toBeNull();
    expect(leerOpciones(['--config'])).toBeNull();
  });

  it('pasa --peticiones a la familia solo cuando la preparación las dejó', () => {
    const opciones = { config: '/c.yaml', salida: '/s', sinPreparar: false };

    expect(argumentosDePython(opciones, true)).toEqual([
      '-m',
      'app.evaluation.chat',
      '--config',
      '/c.yaml',
      '--peticiones',
      DIRECTORIO_DE_PETICIONES,
      '--salida',
      '/s',
    ]);
    expect(argumentosDePython(opciones, false)).not.toContain('--peticiones');
  });
});
