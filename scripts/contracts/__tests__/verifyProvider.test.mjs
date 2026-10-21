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
  archivoDeReporte = path.join(carpeta, 'respuestas');
});
afterEach(() => rmSync(carpeta, { recursive: true, force: true }));

const SUITE_UNITARIA = 'npm run test -w apps/clinical-api';
const SUITE_INTEGRACION = 'bash scripts/test-integration.sh';
const nombreDe = (suite) => [suite.comando, ...suite.args].join(' ');

/**
 * Un ejecutor falso: `verificadas` dice cuántas respuestas deja cada suite (por nombre) en SU archivo de reporte; `salidas`
 * lo que imprime (para el recuento de Pytest). El segundo argumento es el reporte propio de la suite.
 */
/** El proveedor cuyas respuestas deja una suite en su reporte: el hook de Pytest escribe `rag-orchestrator`, el cliente de Vitest `clinical-api`. */
const proveedorDe = (nombreDeSuite) => (nombreDeSuite.includes('pytest') ? 'rag-orchestrator' : 'clinical-api');

const ejecutorFalso = ({ verificadas = {}, salidas = {}, codigos = {}, motivos = {} } = {}) =>
  async (suite, { archivoDeReporte: propio } = {}) => {
    const nombre = nombreDe(suite);
    if (propio !== undefined) appendFileSync(propio, `${proveedorDe(nombre)}\n`.repeat(verificadas[nombre] ?? 0));
    return { codigo: codigos[nombre] ?? 0, salida: salidas[nombre] ?? '', ...(motivos[nombre] && { motivo: motivos[nombre] }) };
  };

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
  it('suma las respuestas de cada suite de clinical-api y toma las de rag-orchestrator de la salida de Pytest [US-214 AC-1]', async () => {
    const ejecutar = ejecutorFalso({
      verificadas: { [SUITE_UNITARIA]: 2, [SUITE_INTEGRACION]: 5, 'python -m pytest': 7 },
    });

    const resumen = await verificarProveedores({ proveedores: PROVIDERS, ejecutar, archivoDeReporte, estricto: true });

    expect(resumen).toEqual([
      { proveedor: 'clinical-api', verificadas: 7, errores: [] },
      { proveedor: 'rag-orchestrator', verificadas: 7, errores: [] },
    ]);
  });

  it('cuenta rag-orchestrator desde el archivo de reporte aunque Pytest no imprima ninguna frase de resumen [US-214 AC-1]', async () => {
    const ejecutar = ejecutorFalso({ verificadas: { 'python -m pytest': 3 } });

    const [resumen] = await verificarProveedores({ proveedores: ['rag-orchestrator'], ejecutar, archivoDeReporte, estricto: true });

    expect(resumen).toEqual({ proveedor: 'rag-orchestrator', verificadas: 3, errores: [] });
  });

  it('falla en estricto cuando el archivo de la suite de Pytest queda vacío aunque imprima una frase de resumen [US-214 AC-1]', async () => {
    const ejecutar = ejecutorFalso({ salidas: { 'python -m pytest': 'verificación del proveedor: 9 respuestas verificadas contra rag-orchestrator\n' } });

    const [resumen] = await verificarProveedores({ proveedores: ['rag-orchestrator'], ejecutar, archivoDeReporte, estricto: true });

    expect(resumen.errores).toEqual(['python -m pytest: no verificó ninguna respuesta (la verificación del proveedor no estaba activa en esa suite)']);
  });

  it('ejecuta las dos suites de clinical-api y la de rag-orchestrator con el intérprete indicado', async () => {
    const lanzados = [];
    const ejecutar = async (suite) => {
      lanzados.push(nombreDe(suite));
      return { codigo: 0, salida: '' };
    };

    await verificarProveedores({ proveedores: PROVIDERS, ejecutar, archivoDeReporte, estricto: false, python: 'py-de-prueba' });

    expect(lanzados).toEqual([SUITE_UNITARIA, SUITE_INTEGRACION, 'py-de-prueba -m pytest']);
  });

  it('da a cada suite su propio archivo de reporte [US-214 AC-1]', async () => {
    const archivos = [];
    const ejecutar = async (_suite, { archivoDeReporte: propio } = {}) => {
      archivos.push(propio);
      return { codigo: 0, salida: '' };
    };

    await verificarProveedores({ proveedores: ['clinical-api'], ejecutar, archivoDeReporte, estricto: false });

    expect(archivos).toHaveLength(2);
    expect(new Set(archivos).size).toBe(2);
  });

  it('falla nombrando la suite de integración cuando no verificó ninguna respuesta aunque la unitaria sí [US-214 AC-1]', async () => {
    const ejecutar = ejecutorFalso({ verificadas: { [SUITE_UNITARIA]: 3 } });

    const [resumen] = await verificarProveedores({ proveedores: ['clinical-api'], ejecutar, archivoDeReporte, estricto: true });

    expect(resumen.errores).toEqual([`${SUITE_INTEGRACION}: no verificó ninguna respuesta (la verificación del proveedor no estaba activa en esa suite)`]);
  });

  it('falla nombrando la suite unitaria cuando solo la de integración verificó [US-214 AC-1]', async () => {
    const ejecutar = ejecutorFalso({ verificadas: { [SUITE_INTEGRACION]: 3 } });

    const [resumen] = await verificarProveedores({ proveedores: ['clinical-api'], ejecutar, archivoDeReporte, estricto: true });

    expect(resumen.errores).toEqual([`${SUITE_UNITARIA}: no verificó ninguna respuesta (la verificación del proveedor no estaba activa en esa suite)`]);
  });

  it('no exige respuestas verificadas fuera del modo estricto', async () => {
    const [resumen] = await verificarProveedores({ proveedores: ['clinical-api'], ejecutar: ejecutorFalso(), archivoDeReporte, estricto: false });

    expect(resumen.errores).toEqual([]);
  });

  it('informa el comando y el motivo cuando una suite falla o vence el tiempo máximo', async () => {
    const ejecutar = ejecutorFalso({
      verificadas: { [SUITE_UNITARIA]: 1, [SUITE_INTEGRACION]: 1 },
      codigos: { [SUITE_UNITARIA]: 1, [SUITE_INTEGRACION]: 124 },
      motivos: { [SUITE_INTEGRACION]: 'superó el tiempo máximo de 5 s' },
    });

    const [resumen] = await verificarProveedores({ proveedores: ['clinical-api'], ejecutar, archivoDeReporte, estricto: true });

    expect(resumen.errores).toEqual([`${SUITE_UNITARIA}: terminó con código 1`, `${SUITE_INTEGRACION}: superó el tiempo máximo de 5 s`]);
  });
});

describe('esEstricto', () => {
  it('es estricto salvo que CONTRACT_VERIFY sea lax [US-214 AC-1]', () => {
    expect(esEstricto(undefined, undefined)).toBe(true);
    expect(esEstricto('strict', undefined)).toBe(true);
    expect(esEstricto('lax', undefined)).toBe(false);
  });

  it('rechaza CONTRACT_VERIFY=lax cuando CI está definido [US-214 AC-1]', () => {
    expect(() => esEstricto('lax', 'true')).toThrow(/CONTRACT_VERIFY=lax no se admite en la CI/);
    expect(esEstricto('strict', 'true')).toBe(true);
  });
});
