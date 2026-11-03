import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { jobsSinExito, omitiblesDeclarados } from '../verificar-needs.mjs';

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

const cambios = (omitibles, result = 'success') => ({ cambios: { result, outputs: { omitibles: typeof omitibles === 'string' ? omitibles : JSON.stringify(omitibles) } } });
const TIEMPO_MAXIMO = 30_000;

describe('omitiblesDeclarados', () => {
  it('devuelve la lista del detector cuando cambios terminó en success [D-12.1]', () => {
    expect(omitiblesDeclarados(cambios(['a', 'b']))).toEqual(['a', 'b']);
  });

  it.each(['no es json', '{"a":1}', '[1,2]', ''])('cuenta como vacía la lista ilegible %j [D-12.1]', (ilegible) => {
    expect(omitiblesDeclarados(cambios(ilegible))).toEqual([]);
  });

  it('devuelve vacío cuando cambios no está en needs o no tiene outputs [D-12.1]', () => {
    expect(omitiblesDeclarados({})).toEqual([]);
    expect(omitiblesDeclarados({ cambios: { result: 'success' } })).toEqual([]);
  });
});

describe('ci-ok acepta omitidos solo si el detector los declaró', () => {
  it('acepta un skipped declarado y lo nombra como omitido por el detector [D-12.1]', async () => {
    const needs = { ...cambios(['build-test-node']), 'build-test-node': { result: 'skipped' }, contracts: { result: 'success' } };

    const { codigo, stdout } = await correr(needs);

    expect(codigo).toBe(0);
    expect(stdout).toContain('el job build-test-node se omitió por el detector de cambios');
  }, TIEMPO_MAXIMO);

  it('sigue fallando con un skipped no declarado y nombra el job [D-12.1] [US-036 AC-1]', async () => {
    const needs = { ...cambios([]), contracts: { result: 'skipped' } };

    const { codigo, stderr } = await correr(needs);

    expect(codigo).toBe(1);
    expect(stderr).toContain('el job contracts terminó en skipped');
  }, TIEMPO_MAXIMO);

  it('no autoriza ningún omitido cuando el detector falló y nombra cambios y cada skipped [D-12.1]', async () => {
    const needs = { ...cambios(['contracts', 'quality'], 'failure'), contracts: { result: 'skipped' }, quality: { result: 'skipped' } };

    const { codigo, stderr } = await correr(needs);

    expect(codigo).toBe(1);
    expect(stderr).toContain('el job cambios terminó en failure');
    expect(stderr).toContain('el job contracts terminó en skipped');
    expect(stderr).toContain('el job quality terminó en skipped');
  }, TIEMPO_MAXIMO);

  it('no acepta ningún skipped cuando la lista de omitibles es ilegible [D-12.1]', async () => {
    const needs = { ...cambios('basura'), contracts: { result: 'skipped' } };

    expect((await correr(needs)).codigo).toBe(1);
  }, TIEMPO_MAXIMO);

  it('no acepta un job declarado omitible que terminó en failure [D-12.1]', async () => {
    const needs = { ...cambios(['contracts']), contracts: { result: 'failure' } };

    expect((await correr(needs)).codigo).toBe(1);
  }, TIEMPO_MAXIMO);
});
