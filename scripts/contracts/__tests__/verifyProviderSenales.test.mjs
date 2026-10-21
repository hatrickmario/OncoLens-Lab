import { spawn } from 'node:child_process';
import { chmodSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ROOT } from './helpers/parches.mjs';

const SCRIPT = path.join(ROOT, 'scripts/contracts/verify-provider.mjs');
let carpeta;

beforeEach(() => {
  carpeta = mkdtempSync(path.join(tmpdir(), 'verify-provider-senales-'));
});
afterEach(() => rmSync(carpeta, { recursive: true, force: true }));

/** Lanza el CLI con un «intérprete» que se queda dormido, le manda la señal y devuelve el código de salida. */
function salidaTrasLaSenal(senal) {
  const intermedio = path.join(carpeta, 'python-dormido.sh');
  writeFileSync(intermedio, '#!/bin/sh\nsleep 30\n');
  chmodSync(intermedio, 0o755);
  return new Promise((resolver) => {
    const hijo = spawn('node', [SCRIPT, '--proveedor', 'rag-orchestrator'], {
      env: { ...process.env, VERIFY_PROVIDER_PYTHON: intermedio, VERIFY_PROVIDER_SEGUNDOS: '60', TMPDIR: carpeta },
      stdio: 'ignore',
    });
    setTimeout(() => hijo.kill(senal), 1500);
    hijo.on('close', (codigo) => resolver(codigo));
  });
}

describe('contracts:verify-provider ante una señal [US-214 AC-1]', () => {
  it('sale con 130 ante SIGINT y borra su carpeta temporal', async () => {
    expect(await salidaTrasLaSenal('SIGINT')).toBe(130);
    expect(readdirSync(carpeta).filter((nombre) => nombre.startsWith('verify-provider-'))).toEqual([]);
  }, 20_000);

  it('sale con 143 ante SIGTERM y borra su carpeta temporal', async () => {
    expect(await salidaTrasLaSenal('SIGTERM')).toBe(143);
    expect(readdirSync(carpeta).filter((nombre) => nombre.startsWith('verify-provider-'))).toEqual([]);
  }, 20_000);
});
