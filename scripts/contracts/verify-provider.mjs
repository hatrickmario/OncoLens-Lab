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

/** Suites de cada proveedor. Todas cuentan igual: una línea con el nombre del proveedor por respuesta verificada en su CONTRACT_VERIFY_REPORT. */
function suitesDe(proveedor, python) {
  const contarReporte = ({ archivoDeReporte }) => contarLineas(archivoDeReporte, proveedor);
  const suites = {
    [CLINICAL_API]: [
      { comando: 'npm', args: ['run', 'test', '-w', 'apps/clinical-api'], contar: contarReporte },
      { comando: 'bash', args: ['scripts/test-integration.sh'], contar: contarReporte },
    ],
    [RAG_ORCHESTRATOR]: [{ comando: python, args: ['-m', 'pytest'], cwd: 'apps/rag-orchestrator', contar: contarReporte }],
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

/**
 * Estricto por defecto; `CONTRACT_VERIFY=lax` solo relaja la exigencia de al menos una respuesta verificada por suite (uso
 * local) y se rechaza en la CI (`CI` definido): allí una verificación apagada no puede dar verde.
 */
export function esEstricto(valor, ci = undefined) {
  if (valor === 'lax' && ci !== undefined) throw new Error('CONTRACT_VERIFY=lax no se admite en la CI (variable CI definida)');
  return valor !== 'lax';
}

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

const nombreDeSuite = ({ comando, args }) => [comando, ...args].join(' ');

/**
 * Ejecuta las suites y devuelve un resumen por proveedor. `ejecutar(suite, { archivoDeReporte })` devuelve `{ codigo, salida }`
 * y lo inyecta quien llama (el CLI usa procesos reales; los tests, uno falso). Cada suite tiene su propio archivo de reporte y
 * en modo estricto debe verificar más de 0 respuestas por sí misma.
 * @returns {Promise<{ proveedor: string, verificadas: number, errores: string[] }[]>}
 */
export async function verificarProveedores({ proveedores, ejecutar, archivoDeReporte, estricto, python = 'python' }) {
  const resumen = [];
  for (const proveedor of proveedores) {
    const suites = suitesDe(proveedor, python);
    if (!suites) throw new Error(`el proveedor ${proveedor} no tiene suites de verificación definidas`);
    const errores = [];
    let verificadas = 0;
    for (const [indice, suite] of suites.entries()) {
      const propio = `${archivoDeReporte}.${proveedor}.${indice}`;
      appendFileSync(propio, '');
      const resultado = await ejecutar(suite, { archivoDeReporte: propio });
      if (resultado.codigo !== 0) errores.push(`${nombreDeSuite(suite)}: ${resultado.motivo ?? `terminó con código ${resultado.codigo}`}`);
      const deLaSuite = suite.contar({ archivoDeReporte: propio });
      verificadas += deLaSuite;
      if (estricto && deLaSuite === 0) errores.push(`${nombreDeSuite(suite)}: no verificó ninguna respuesta (la verificación del proveedor no estaba activa en esa suite)`);
    }
    resumen.push({ proveedor, verificadas, errores });
  }
  return resumen;
}

/** Ejecuta un comando como proceso hijo, reenvía su salida y lo mata al pasar `segundos`. */
function ejecutarProceso({ comando, args, cwd }, { raiz, entorno, segundos }, { archivoDeReporte }) {
  return new Promise((resolver) => {
    const hijo = spawn(comando, args, { cwd: path.join(raiz, cwd ?? '.'), env: { ...entorno, CONTRACT_VERIFY_REPORT: archivoDeReporte }, stdio: ['ignore', 'pipe', 'inherit'], detached: true });
    let salida = '';
    let vencido = false;
    let senalRecibida;
    const terminarGrupo = (senal) => {
      // Todo el grupo de procesos: los nietos (vitest, pytest) heredan el pipe y mantendrian abierto el cierre.
      try {
        process.kill(-hijo.pid, senal);
      } catch {
        // El grupo ya terminó.
      }
    };
    // Ante una señal se termina el grupo y se resuelve con el código convencional (128 + n): quien llama limpia su carpeta
    // temporal en un `finally` antes de salir.
    const reenviar = (senal, codigoDeSalida) => () => {
      terminarGrupo(senal);
      senalRecibida = codigoDeSalida;
    };
    const alInterrumpir = reenviar('SIGINT', 130);
    const alTerminar = reenviar('SIGTERM', 143);
    process.once('SIGINT', alInterrumpir);
    process.once('SIGTERM', alTerminar);
    const soltarSenales = () => {
      process.off('SIGINT', alInterrumpir);
      process.off('SIGTERM', alTerminar);
    };
    const temporizador = setTimeout(() => {
      vencido = true;
      terminarGrupo('SIGKILL');
    }, segundos * 1000);
    hijo.stdout.on('data', (trozo) => {
      salida += trozo;
      process.stdout.write(trozo);
    });
    hijo.on('error', (error) => {
      clearTimeout(temporizador);
      soltarSenales();
      resolver({ codigo: 127, salida, motivo: `no se pudo ejecutar (${error.code})` });
    });
    hijo.on('close', (codigo) => {
      clearTimeout(temporizador);
      soltarSenales();
      resolver({ codigo: vencido ? 124 : (codigo ?? 1), salida, motivo: vencido ? `superó el tiempo máximo de ${segundos} s` : undefined, senal: senalRecibida });
    });
  });
}

/** El proceso recibió SIGINT (130) o SIGTERM (143): se interrumpe todo y se sale con ese código tras limpiar. */
class SenalRecibida extends Error {
  constructor(codigoDeSalida) {
    super(`interrumpido por una señal (código ${codigoDeSalida})`);
    this.codigoDeSalida = codigoDeSalida;
  }
}

async function main() {
  const proveedores = leerArgumentos(process.argv.slice(2));
  const segundos = Number(process.env.VERIFY_PROVIDER_SEGUNDOS ?? SEGUNDOS_POR_DEFECTO);
  if (!Number.isFinite(segundos) || segundos <= 0) throw new Error('VERIFY_PROVIDER_SEGUNDOS debe ser un número de segundos mayor que 0');
  const estricto = esEstricto(process.env.CONTRACT_VERIFY, process.env.CI);
  const carpeta = mkdtempSync(path.join(tmpdir(), 'verify-provider-'));
  const archivoDeReporte = path.join(carpeta, 'respuestas');
  // La exigencia de verificar es del CLI: los hijos no reciben CONTRACT_VERIFY.
  const entorno = { ...process.env };
  delete entorno.CONTRACT_VERIFY;
  try {
    const resumen = await verificarProveedores({
      proveedores,
      archivoDeReporte,
      estricto,
      python: process.env.VERIFY_PROVIDER_PYTHON ?? 'python',
      ejecutar: async (suite, propio) => {
        const resultado = await ejecutarProceso(suite, { raiz: DEFAULT_ROOT, entorno, segundos }, propio);
        if (resultado.senal !== undefined) throw new SenalRecibida(resultado.senal);
        return resultado;
      },
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
    return error instanceof SenalRecibida ? error.codigoDeSalida : 2;
  });
}
