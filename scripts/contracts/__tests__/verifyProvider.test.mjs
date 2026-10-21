import { appendFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PROVIDERS } from '../lib/specs.mjs';
import { esEstricto, leerArgumentos, verificarProveedores } from '../verify-provider.mjs';

let carpeta;
let archivoDeReporte;

beforeEach(() => {
  carpeta = mkdtempSync(path.join(tmpdir(), 'verify-provider-test-'));
  archivoDeReporte = path.join(carpeta, 'respuestas.txt');
  appendFileSync(archivoDeReporte, '');
});
afterEach(() => rmSync(carpeta, { recursive: true, force: true }));

const verde = (salida = '') => async () => ({ codigo: 0, salida });

describe('leerArgumentos', () => {
  it('devuelve todos los proveedores cuando no se pide ninguno', () => {
    expect(leerArgumentos([])).toEqual(PROVIDERS);
  });

  it('devuelve solo los pedidos con --proveedor', () => {
    expect(leerArgumentos(['--proveedor', 'rag-orchestrator'])).toEqual(['rag-orchestrator']);
  });

  it('lanza el uso cuando el proveedor o la opción no existen', () => {
    expect(() => leerArgumentos(['--proveedor', 'otro'])).toThrow(/uso: verify-provider/);
    expect(() => leerArgumentos(['--todos'])).toThrow(/uso: verify-provider/);
    expect(() => leerArgumentos(['--proveedor'])).toThrow(/uso: verify-provider/);
  });
});

describe('verificarProveedores', () => {
  it('cuenta las respuestas de clinical-api desde el reporte y las de rag-orchestrator desde la salida de Pytest [US-214 AC-1]', async () => {
    appendFileSync(archivoDeReporte, 'clinical-api\nclinical-api\nrag-orchestrator\n');
    const salidaPytest = '.....\nverificación del proveedor: 7 respuestas verificadas contra rag-orchestrator\n';
    const ejecutar = async (suite) => ({ codigo: 0, salida: suite.comando === 'npm' || suite.comando === 'bash' ? '' : salidaPytest });

    const resumen = await verificarProveedores({ proveedores: PROVIDERS, ejecutar, archivoDeReporte, estricto: true });

    expect(resumen).toEqual([
      { proveedor: 'clinical-api', verificadas: 2, errores: [] },
      { proveedor: 'rag-orchestrator', verificadas: 7, errores: [] },
    ]);
  });

  it('ejecuta las dos suites de clinical-api y la de rag-orchestrator con el intérprete indicado', async () => {
    const lanzados = [];
    const ejecutar = async (suite) => {
      lanzados.push([suite.comando, ...suite.args].join(' '));
      return { codigo: 0, salida: '' };
    };

    await verificarProveedores({ proveedores: PROVIDERS, ejecutar, archivoDeReporte, estricto: false, python: 'py-de-prueba' });

    expect(lanzados).toEqual(['npm run test -w apps/clinical-api', 'bash scripts/test-integration.sh', 'py-de-prueba -m pytest']);
  });

  it('falla en modo estricto cuando un proveedor no verificó ninguna respuesta aunque sus tests pasen [US-214 AC-1]', async () => {
    const [resumen] = await verificarProveedores({ proveedores: ['clinical-api'], ejecutar: verde(), archivoDeReporte, estricto: true });

    expect(resumen.errores).toEqual(['no se verificó ninguna respuesta: la verificación del proveedor no estaba activa']);
  });

  it('no exige respuestas verificadas fuera del modo estricto', async () => {
    const [resumen] = await verificarProveedores({ proveedores: ['clinical-api'], ejecutar: verde(), archivoDeReporte, estricto: false });

    expect(resumen.errores).toEqual([]);
  });

  it('informa el comando y el motivo cuando una suite falla o vence el tiempo máximo', async () => {
    appendFileSync(archivoDeReporte, 'clinical-api\n');
    const ejecutar = async (suite) => (suite.comando === 'bash' ? { codigo: 124, salida: '', motivo: 'superó el tiempo máximo de 5 s' } : { codigo: 1, salida: '' });

    const [resumen] = await verificarProveedores({ proveedores: ['clinical-api'], ejecutar, archivoDeReporte, estricto: true });

    expect(resumen.errores).toEqual([
      'npm run test -w apps/clinical-api: terminó con código 1',
      'bash scripts/test-integration.sh: superó el tiempo máximo de 5 s',
    ]);
  });
});

describe('esEstricto', () => {
  it('es estricto salvo que CONTRACT_VERIFY sea lax [US-214 AC-1]', () => {
    expect(esEstricto(undefined)).toBe(true);
    expect(esEstricto('strict')).toBe(true);
    expect(esEstricto('lax')).toBe(false);
  });
});
