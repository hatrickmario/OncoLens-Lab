#!/usr/bin/env node
/**
 * `npm run contracts:verify-provider [-- --proveedor <nombre>]...` (US-214 AC-1, design D1 y D2): ejecuta las suites de
 * integración de cada proveedor con la verificación automática de respuestas activa (cada respuesta se valida contra el
 * `openapi.yaml` de su servicio: código declarado, cabeceras obligatorias y cuerpo) y, con `CONTRACT_VERIFY=strict`, exige
 * que cada proveedor haya verificado al menos una respuesta: una verificación apagada por error no cuenta como verde.
 *
 *  - clinical-api: Vitest (config unitaria y de integración). La de integración necesita el PostgreSQL de test
 *    (`scripts/test-integration.sh`); en la CI corre dentro de `scripts/ci/integracion-clinical-api.sh`.
 *  - rag-orchestrator: Pytest con adapters falsos (los tests `servicios_reales` los corre `integration-rag`).
 *
 * Variables (RN-22): VERIFY_PROVIDER_SEGUNDOS (tope por suite, 600: las dos de clinical-api caben en los 30 min del job), VERIFY_PROVIDER_PYTHON (intérprete, `python`).
 * Los tests nunca imprimen el valor de un campo: los mensajes nombran proveedor, método, plantilla, código y ruta JSON.
 */
import { spawn } from 'node:child_process';
import { appendFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DEFAULT_ROOT } from './lib/paths.mjs';
import { CLINICAL_API, PROVIDERS, RAG_ORCHESTRATOR } from './lib/specs.mjs';

const SEGUNDOS_POR_DEFECTO = 600;

/** Suites de cada proveedor y cómo se cuentan sus respuestas verificadas. */
function suitesDe(proveedor, python) {
  const suites = {
    [CLINICAL_API]: {
      comandos: [
        { comando: 'npm', args: ['run', 'test', '-w', 'apps/clinical-api'] },
        { comando: 'bash', args: ['scripts/test-integration.sh'] },
      ],
      // El cliente de test deja una línea por respuesta verificada en CONTRACT_VERIFY_REPORT.
      contar: ({ archivoDeReporte }) => contarLineas(archivoDeReporte, CLINICAL_API),
    },
    [RAG_ORCHESTRATOR]: {
      comandos: [{ comando: python, args: ['-m', 'pytest'], cwd: 'apps/rag-orchestrator' }],
      // conftest.py imprime «verificación del proveedor: N respuestas verificadas contra rag-orchestrator».
      contar: ({ salida }) => contarEnSalida(salida, RAG_ORCHESTRATOR),
    },
  };
  return suites[proveedor];
}

function contarLineas(archivo, proveedor) {
  try {
    return readFileSync(archivo, 'utf8').split('\n').filter((linea) => linea === proveedor).length;
  } catch {
    return 0;
  }
}

function contarEnSalida(salida, proveedor) {
  const patron = new RegExp(`verificación del proveedor: (\\d+) respuestas verificadas contra ${proveedor}`, 'g');
  return [...salida.matchAll(patron)].reduce((total, coincidencia) => total + Number(coincidencia[1]), 0);
}

/** Estricto por defecto; `CONTRACT_VERIFY=lax` solo relaja la exigencia de al menos una respuesta verificada (uso local). */
export const esEstricto = (valor) => valor !== 'lax';

/** Argumentos de la línea de comandos: los proveedores pedidos (todos si no se pide ninguno). Lanza ante un argumento desconocido. */
export function leerArgumentos(argv) {
  const proveedores = [];
  for (let indice = 0; indice < argv.length; indice += 2) {
    const [opcion, valor] = [argv[indice], argv[indice + 1]];
    if (opcion !== '--proveedor' || !PROVIDERS.includes(valor)) {
      throw new Error(`uso: verify-provider [--proveedor ${PROVIDERS.join('|')}]...`);
    }
    proveedores.push(valor);
  }
  return proveedores.length > 0 ? proveedores : [...PROVIDERS];
}

/**
 * Ejecuta las suites y devuelve un resumen por proveedor. `ejecutar(comando, opciones)` devuelve `{ codigo, salida }` y lo
 * inyecta quien llama (el CLI usa procesos reales; los tests, uno falso).
 * @returns {Promise<{ proveedor: string, verificadas: number, errores: string[] }[]>}
 */
export async function verificarProveedores({ proveedores, ejecutar, archivoDeReporte, estricto, python = 'python' }) {
  const resumen = [];
  for (const proveedor of proveedores) {
    const suites = suitesDe(proveedor, python);
    if (!suites) throw new Error(`el proveedor ${proveedor} no tiene suites de verificación definidas`);
    const errores = [];
    let salida = '';
    for (const suite of suites.comandos) {
      const resultado = await ejecutar(suite);
      salida += resultado.salida;
      if (resultado.codigo !== 0) errores.push(`${suite.comando} ${suite.args.join(' ')}: ${resultado.motivo ?? `terminó con código ${resultado.codigo}`}`);
    }
    const verificadas = suites.contar({ archivoDeReporte, salida });
    if (estricto && verificadas === 0) errores.push('no se verificó ninguna respuesta: la verificación del proveedor no estaba activa');
    resumen.push({ proveedor, verificadas, errores });
  }
  return resumen;
}

/** Ejecuta un comando como proceso hijo, reenvía su salida y lo mata al pasar `segundos`. */
function ejecutarProceso({ comando, args, cwd }, { raiz, entorno, segundos }) {
  return new Promise((resolver) => {
    const hijo = spawn(comando, args, { cwd: path.join(raiz, cwd ?? '.'), env: entorno, stdio: ['ignore', 'pipe', 'inherit'], detached: true });
    let salida = '';
    let vencido = false;
    const temporizador = setTimeout(() => {
      vencido = true;
      // Todo el grupo de procesos: los nietos (vitest, pytest) heredan el pipe y mantendrian abierto el cierre.
      process.kill(-hijo.pid, 'SIGKILL');
    }, segundos * 1000);
    hijo.stdout.on('data', (trozo) => {
      salida += trozo;
      process.stdout.write(trozo);
    });
    hijo.on('error', (error) => {
      clearTimeout(temporizador);
      resolver({ codigo: 127, salida, motivo: `no se pudo ejecutar (${error.code})` });
    });
    hijo.on('close', (codigo) => {
      clearTimeout(temporizador);
      resolver({ codigo: vencido ? 124 : (codigo ?? 1), salida, motivo: vencido ? `superó el tiempo máximo de ${segundos} s` : undefined });
    });
  });
}

async function main() {
  const proveedores = leerArgumentos(process.argv.slice(2));
  const segundos = Number(process.env.VERIFY_PROVIDER_SEGUNDOS ?? SEGUNDOS_POR_DEFECTO);
  if (!Number.isFinite(segundos) || segundos <= 0) throw new Error('VERIFY_PROVIDER_SEGUNDOS debe ser un número de segundos mayor que 0');
  const carpeta = mkdtempSync(path.join(tmpdir(), 'verify-provider-'));
  const archivoDeReporte = path.join(carpeta, 'respuestas.txt');
  appendFileSync(archivoDeReporte, '');
  const entorno = { ...process.env, CONTRACT_VERIFY: esEstricto(process.env.CONTRACT_VERIFY) ? 'strict' : 'lax', CONTRACT_VERIFY_REPORT: archivoDeReporte };
  try {
    const resumen = await verificarProveedores({
      proveedores,
      archivoDeReporte,
      estricto: entorno.CONTRACT_VERIFY === 'strict',
      python: process.env.VERIFY_PROVIDER_PYTHON ?? 'python',
      ejecutar: (suite) => ejecutarProceso(suite, { raiz: DEFAULT_ROOT, entorno, segundos }),
    });
    for (const { proveedor, verificadas } of resumen) console.log(`contracts:verify-provider — ${proveedor}: ${verificadas} respuestas verificadas`);
    const fallos = resumen.flatMap(({ proveedor, errores }) => errores.map((error) => `contracts:verify-provider — ${proveedor}: ${error}`));
    fallos.forEach((fallo) => console.error(fallo));
    return fallos.length === 0 ? 0 : 1;
  } finally {
    rmSync(carpeta, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main().catch((error) => {
    console.error(`contracts:verify-provider — ${error.message}`);
    return 2;
  });
}
