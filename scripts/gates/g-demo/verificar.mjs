#!/usr/bin/env node
/**
 * Orquestación de `scripts/verify-g-demo` (US-142): lee los insumos, llama a los módulos puros y escribe el registro.
 * Es la única pieza con E/S de `scripts/gates/g-demo/`; el reloj, la lectura y la escritura se inyectan.
 *
 * Insumos (todos agregados): `--conteo-json` (salida de contar-en-proceso.js), `--banderas-json` (salida de banderas.mjs),
 * `--e2e-resultado` (JSON del E2E: pasos, catalogVersion, corpusRelease), `--reporte-evaluate` (repetible), `--p95-e2e-s`.
 * Sale con 0 si el resultado es «superado» o «regresión fingida»; con 1 si «no superado».
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  cargarExcepciones,
  declararValidacionClinica,
  excepcionesDeCapacidad,
} from './excepciones.mjs';
import { cargarMetas, evaluarMetricas, validarReporte } from './metricas.mjs';
import { evaluarP95 } from './p95.mjs';
import {
  DUENO,
  NO_DISPONIBLE,
  listaDeExcepciones,
  listaDeNoMedidas,
  listaDeValidacionClinica,
  renderizarRegistro,
  tablaDeMetricas,
  textoDeBanderas,
  textoDelConteo,
  textoDelP95,
  valorOTexto,
} from './registro.mjs';
import { decidirResultado } from './resultado.mjs';
import { verificarSoloSintetico } from './solo-sintetico.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const RUTA_METAS = 'apps/rag-orchestrator/eval/configs/metas-iniciales.yaml';
const FUENTE_DEL_P95 =
  'baseline de l1d-119 AC-6 (mediana de 3 corridas), contra Compose con los modelos de ADR-39';

export function leerArgumentos(argv) {
  const args = { reportes: [] };
  const claves = {
    '--modo': 'modo',
    '--e2e-resultado': 'e2e',
    '--p95-e2e-s': 'p95',
    '--p95-consultas': 'p95Consultas',
    '--conteo-json': 'conteo',
    '--banderas-json': 'banderas',
    '--commit': 'commit',
  };
  for (let i = 0; i < argv.length; i += 2) {
    if (argv[i] === '--reporte-evaluate') args.reportes.push(argv[i + 1]);
    else if (claves[argv[i]]) args[claves[argv[i]]] = argv[i + 1];
    else throw new Error(`argumento desconocido: ${argv[i]}`);
  }
  return args;
}

const jsonONulo = (texto) => {
  if (!texto) return null;
  try {
    return JSON.parse(texto);
  } catch {
    return null;
  }
};

function resultadoDelE2e(e2e) {
  const pasos = Array.isArray(e2e?.pasos) ? e2e.pasos : [];
  const fallido = pasos.find((p) => p.resultado !== 'ok');
  if (pasos.length === 0) return { ok: false, pasoFallido: null };
  return { ok: !fallido, pasoFallido: fallido?.paso ?? null };
}

function procedenciaDe(e2e, reportes) {
  const dePrimero = (clave) =>
    e2e?.[clave] ?? reportes.map((r) => r?.configuracion?.[clave]).find(Boolean) ?? null;
  const valores = {
    catalogVersion: dePrimero('catalogVersion'),
    corpusRelease: dePrimero('corpusRelease'),
  };
  return { valores, faltantes: Object.keys(valores).filter((k) => !valores[k]) };
}

const modelosDe = (reportes) => reportes.map((r) => r?.configuracion?.modelos).find(Boolean) ?? {};

function leerP95(args, modo) {
  if (modo === 'fingido' || args.p95 === undefined) return null;
  const valor = Number(args.p95);
  return Number.isFinite(valor) ? valor : null;
}

export async function verificar(argv, deps) {
  const args = leerArgumentos(argv);
  const modo = args.modo ?? 'fingido';
  const leerJson = (ruta) => (ruta ? jsonONulo(deps.leerTexto(ruta)) : null);
  const metas = cargarMetas(deps.leerTexto(RUTA_METAS));
  const catalogo = JSON.parse(deps.leerTexto('scripts/gates/g-demo/metricas.json'));
  const reportes = args.reportes.map(leerJson).filter(Boolean);
  const e2e = leerJson(args.e2e);
  const excepciones = cargarExcepciones(
    JSON.parse(deps.leerTexto('docs/gates/g-demo-excepciones.json')),
  );
  const metaP95 = metas[catalogo.p95.claveMeta];

  const comprobaciones = {
    e2e: resultadoDelE2e(e2e),
    reporte: validarReporte(reportes),
    metricas: evaluarMetricas(reportes, catalogo.definiciones, metas),
    soloSintetico: verificarSoloSintetico(
      jsonONulo(args.conteo)?.conteos?.['clinical.patient.por_data_origin'] ?? null,
      jsonONulo(args.banderas),
    ),
    excepciones,
    procedencia: procedenciaDe(e2e, reportes),
    p95: evaluarP95(leerP95(args, modo), { clave: catalogo.p95.claveMeta, maximo: metaP95.maximo }),
  };
  const veredicto = decidirResultado(comprobaciones, modo);
  const fecha = deps.reloj().toISOString().slice(0, 10);
  const modelos = modelosDe(reportes);
  const datos = {
    titulo: veredicto.titulo,
    resultado: veredicto.resultado,
    modo,
    fecha,
    commit: valorOTexto(args.commit),
    catalogVersion: valorOTexto(comprobaciones.procedencia.valores.catalogVersion),
    corpusRelease: valorOTexto(comprobaciones.procedencia.valores.corpusRelease),
    modeloGeneracion: valorOTexto(modelos.llm),
    modeloEmbeddings: valorOTexto(modelos.embeddings),
    modeloReranker: valorOTexto(modelos.reranker),
    modeloNli: valorOTexto(modelos.nli),
    soloSintetico: comprobaciones.soloSintetico.ok ? 'sí' : 'no',
    conteoPorOrigen: textoDelConteo(comprobaciones.soloSintetico),
    banderas: textoDeBanderas(comprobaciones.soloSintetico),
    tablaMetricas: tablaDeMetricas(comprobaciones.metricas),
    noMedidas: listaDeNoMedidas(comprobaciones.metricas),
    excepciones: listaDeExcepciones(excepcionesDeCapacidad(excepciones)),
    validacionClinica: listaDeValidacionClinica(declararValidacionClinica(excepciones)),
    p95: textoDelP95(comprobaciones.p95, { fuente: FUENTE_DEL_P95, consultas: args.p95Consultas }),
    dueno: DUENO,
    firma: 'pendiente',
  };
  const plantilla = deps.leerTexto('docs/gates/plantilla-G-Demo.md');
  const destino =
    modo === 'real' ? `docs/gates/G-Demo-${fecha}.md` : `reports/gates/G-Demo-fingido-${fecha}.md`;
  deps.escribirTexto(destino, renderizarRegistro(plantilla, datos));
  deps.salida(`${veredicto.titulo}\nRegistro: ${destino}`);
  return veredicto.resultado === 'no_superado' ? 1 : 0;
}

export function depsDelSistema(raiz = RAIZ) {
  return {
    leerTexto: (ruta) => {
      try {
        return readFileSync(path.resolve(raiz, ruta), 'utf8');
      } catch {
        return null;
      }
    },
    escribirTexto: (ruta, texto) => {
      const completa = path.resolve(raiz, ruta);
      mkdirSync(path.dirname(completa), { recursive: true });
      writeFileSync(completa, texto);
    },
    reloj: () => new Date(),
    salida: (texto) => process.stdout.write(`${texto}\n`),
  };
}

export { NO_DISPONIBLE };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = await verificar(process.argv.slice(2), depsDelSistema());
  } catch (error) {
    console.error(`verify-g-demo: ${error.message}`);
    process.exitCode = 1;
  }
}
