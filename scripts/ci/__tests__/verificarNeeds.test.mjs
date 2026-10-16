import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { jobsSinExito } from '../verificar-needs.mjs';

const ejecutar = promisify(execFile);
const SCRIPT = path.resolve(import.meta.dirname, '../verificar-needs.mjs');

const correr = (needs) =>
  ejecutar('node', [SCRIPT], { env: { ...process.env, NEEDS: JSON.stringify(needs) } }).then(
    ({ stdout }) => ({ codigo: 0, stdout, stderr: '' }),
    (error) => ({ codigo: error.code, stdout: error.stdout, stderr: error.stderr }),
  );

describe('jobsSinExito', () => {
  it.each(['failure', 'cancelled', 'skipped'])('nombra el job que terminó en %s [US-036 AC-1]', (resultado) => {
    const needs = { 'build-test': { result: 'success' }, contracts: { result: resultado } };

    expect(jobsSinExito(needs)).toEqual([{ nombre: 'contracts', resultado }]);
  });

  it('no devuelve nada cuando todos terminaron en success [US-036 AC-1]', () => {
    expect(jobsSinExito({ a: { result: 'success' } })).toEqual([]);
  });
});

describe('verificar-needs.mjs', () => {
  it('sale con 1 y nombra el job fallido cuando un job no terminó en success [US-036 AC-1]', async () => {
    const { codigo, stderr } = await correr({ a: { result: 'success' }, 'data-scan': { result: 'failure' } });

    expect(codigo).toBe(1);
    expect(stderr).toContain('el job data-scan terminó en failure');
  });

  it('sale con 0 cuando todos los jobs terminaron en success [US-036 AC-1]', async () => {
    expect((await correr({ a: { result: 'success' }, b: { result: 'success' } })).codigo).toBe(0);
  });

  it('sale con 1 cuando no recibe ningún job [US-036 AC-1]', async () => {
    expect((await correr({})).codigo).toBe(1);
  });
});
