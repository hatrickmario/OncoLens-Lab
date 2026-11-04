#!/usr/bin/env node
/**
 * Orquestación de `scripts/verify-g-demo` (US-142): lee los insumos, llama a los módulos puros y escribe el registro.
 * Es la única pieza con E/S de `scripts/gates/g-demo/`; el reloj, la lectura y la escritura se inyectan.
 *
 * Insumos (todos agregados): `--conteo-json` (salida de contar-en-proceso.js), `--banderas-json` (salida de banderas.mjs),
 * `--e2e-resultado` (JSON del E2E: modoLlm, generadoEn, pasos, catalogVersion), `--reporte-evaluate` (repetible),
 * `--p95-baseline-s`. El veredicto, el destino del registro y el código de salida son de `resultado.mjs`.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { comprobarE2e } from './e2e.mjs';
import {
  cargarExcepciones,
  declararValidacionClinica,
  excepcionesDeCapacidad,
} from './excepciones.mjs';
import { cargarMetas, evaluarMetricas, validarReporte } from './metricas.mjs';
import { evaluarP95 } from './p95.mjs';
import {
  DUENO,
  PATRON_DE_COMMIT,
  PATRON_DE_VERSION_O_MODELO,
  enteroSeguro,
  listaDeAvisos,
  listaDeExcepciones,
  listaDeNoMedidas,
  listaDeValidacionClinica,
  renderizarRegistro,
  tablaDeMetricas,
  textoDeBanderas,
  textoDelConteo,
  textoDelP95,
  valorOTexto,
  valorSeguro,
} from './registro.mjs';
import {
  MODOS,
  RESULTADOS,
  codigoDeSalida,
  decidirResultado,
  rutaDelRegistro,
} from './resultado.mjs';
import { verificarSoloSintetico } from './solo-sintetico.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const RUTA_METAS = 'apps/rag-orchestrator/eval/configs/metas-iniciales.yaml';
const RUTA_METRICAS = 'scripts/gates/g-demo/metricas.json';
const RUTA_EXCEPCIONES = 'docs/gates/g-demo-excepciones.json';
const RUTA_PLANTILLA = 'docs/gates/plantilla-G-Demo.md';
const FUENTE_DEL_P95 =
  'baseline de l1d-119 AC-6 (mediana de 3 corridas), contra Compose con los modelos de ADR-39';
/** Clave aditiva que escribe `contar-en-proceso` (apps/clinical-api/prisma/seed/contar.ts); un test la fija en ambos lados. */
const CLAVE_CONTEO_POR_ORIGEN = 'clinical.patient.por_data_origin';

export const CLAVES_DE_ARGUMENTOS = {
  '--modo': 'modo',
  '--e2e-resultado': 'e2e',
  '--p95-baseline-s': 'p95',
  '--p95-consultas': 'p95Consultas',
  '--conteo-json': 'conteo',
  '--banderas-json': 'banderas',
  '--commit': 'commit',
};
export const ARGUMENTO_REPETIBLE = '--reporte-evaluate';

/** Los mensajes de error son fijos: nunca repiten lo que llegó por la línea de comandos (RN-14). */
export function leerArgumentos(argv) {
  const args = { reportes: [] };
  for (let i = 0; i < argv.length; i += 2) {
    const nombre = argv[i];
    if (argv[i + 1] === undefined) throw new Error('falta el valor de un argumento');
    if (nombre === ARGUMENTO_REPETIBLE) args.reportes.push(argv[i + 1]);
    else if (CLAVES_DE_ARGUMENTOS[nombre]) {
      const clave = CLAVES_DE_ARGUMENTOS[nombre];
      if (clave in args) throw new Error('argumento duplicado');
      args[clave] = argv[i + 1];
    } else throw new Error('argumento desconocido');
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

/** corpusRelease solo sale del reporte de evaluate: el contrato que ve el navegador no lo expone (D5-47). */
function procedenciaDe(e2e, reportes) {
  const delReporte = (clave) => reportes.map((r) => r?.configuracion?.[clave]).find(Boolean);
  const valores = {
    catalogVersion: valorSeguro(
      e2e?.catalogVersion ?? delReporte('catalogVersion'),
      PATRON_DE_VERSION_O_MODELO,
    ),
    corpusRelease: valorSeguro(delReporte('corpusRelease'), PATRON_DE_VERSION_O_MODELO),
  };
  const faltantes = Object.keys(valores).filter((clave) => !valores[clave]);
  return { valores, faltantes, motivos: faltantes.length > 0 ? ['procedencia incompleta'] : [] };
}

const modelosDe = (reportes) => reportes.map((r) => r?.configuracion?.modelos).find(Boolean) ?? {};

function leerP95(args) {
  const valor = Number(args.p95);
  return args.p95 !== undefined && Number.isFinite(valor) ? valor : null;
}

/** Todas las comprobaciones del gate, cada una evaluada por su módulo; ninguna decide el veredicto. */
function reunirComprobaciones({ args, modo, deps }) {
  const leerJson = (ruta) => (ruta ? jsonONulo(deps.leerTextoOpcional(ruta)) : null);
  const metas = cargarMetas(deps.leerTexto(RUTA_METAS));
  const catalogo = JSON.parse(deps.leerTexto(RUTA_METRICAS));
  const reportes = args.reportes.map(leerJson);
  const e2e = leerJson(args.e2e);
  const metaP95 = { clave: catalogo.p95.claveMeta, maximo: metas[catalogo.p95.claveMeta]?.maximo };
  return {
    reportes,
    comprobaciones: {
      e2e: comprobarE2e(e2e, modo),
      reporte: validarReporte(reportes, catalogo.configuraciones),
      soloSintetico: verificarSoloSintetico(
        jsonONulo(args.conteo)?.conteos?.[CLAVE_CONTEO_POR_ORIGEN] ?? null,
        jsonONulo(args.banderas),
      ),
      excepciones: cargarExcepciones(JSON.parse(deps.leerTexto(RUTA_EXCEPCIONES))),
      procedencia: procedenciaDe(e2e, reportes),
      metricas: evaluarMetricas(reportes, catalogo.definiciones, metas, catalogo.configuraciones),
      p95: evaluarP95(leerP95(args), metaP95, modo),
    },
  };
}

/** Los datos que rellenan la plantilla: solo agregados y valores de la lista blanca (RN-14). */
function armarDatosDelRegistro({ veredicto, comprobaciones, reportes, args, modo, fecha }) {
  const modelos = modelosDe(reportes);
  const { procedencia, soloSintetico, metricas, excepciones, p95 } = comprobaciones;
  const modelo = (nombre) => valorOTexto(valorSeguro(modelos[nombre], PATRON_DE_VERSION_O_MODELO));
  return {
    titulo: veredicto.titulo,
    resultado: veredicto.resultado,
    modo,
    fecha,
    commit: valorOTexto(valorSeguro(args.commit, PATRON_DE_COMMIT)),
    catalogVersion: valorOTexto(procedencia.valores.catalogVersion),
    corpusRelease: valorOTexto(procedencia.valores.corpusRelease),
    modeloGeneracion: modelo('llm'),
    modeloEmbeddings: modelo('embeddings'),
    modeloReranker: modelo('reranker'),
    modeloNli: modelo('nli'),
    soloSintetico: soloSintetico.ok ? 'sí' : 'no',
    conteoPorOrigen: textoDelConteo(soloSintetico),
    banderas: textoDeBanderas(soloSintetico),
    tablaMetricas: tablaDeMetricas(metricas.mediciones),
    noMedidas: listaDeNoMedidas(metricas.mediciones),
    avisos: listaDeAvisos(comprobaciones.e2e.avisos ?? []),
    excepciones: listaDeExcepciones(excepcionesDeCapacidad(excepciones)),
    validacionClinica: listaDeValidacionClinica(declararValidacionClinica(excepciones)),
    p95: textoDelP95(p95, { fuente: FUENTE_DEL_P95, consultas: enteroSeguro(args.p95Consultas) }),
    dueno: DUENO,
    firma: 'pendiente',
  };
}

export async function verificar(argv, deps) {
  const args = leerArgumentos(argv);
  const modo = args.modo;
  if (!MODOS.includes(modo)) throw new Error('falta --modo fingido|real');
  const { reportes, comprobaciones } = reunirComprobaciones({ args, modo, deps });
  const veredicto = decidirResultado(comprobaciones, modo);
  const fecha = deps.reloj().toISOString().slice(0, 10);
  const datos = armarDatosDelRegistro({ veredicto, comprobaciones, reportes, args, modo, fecha });
  const destino = rutaDelRegistro(veredicto.resultado, modo, fecha);
  // Un registro real superado ya escrito puede estar firmado: nunca se pisa (se borra a mano para repetir la verificación).
  if (veredicto.resultado === RESULTADOS.SUPERADO && deps.existe(destino)) {
    throw new Error(`ya existe ${destino}; no se sobrescribe un registro que puede estar firmado`);
  }
  deps.escribirTexto(destino, renderizarRegistro(deps.leerTexto(RUTA_PLANTILLA), datos));
  deps.salida(`${veredicto.titulo}\nRegistro: ${destino}`);
  return codigoDeSalida(veredicto.resultado);
}

export function depsDelSistema(raiz = RAIZ) {
  const leerTextoOpcional = (ruta) => {
    try {
      return readFileSync(path.resolve(raiz, ruta), 'utf8');
    } catch {
      return null;
    }
  };
  return {
    leerTextoOpcional,
    leerTexto: (ruta) => {
      const texto = leerTextoOpcional(ruta);
      if (texto === null) throw new Error(`no se pudo leer ${ruta}`);
      return texto;
    },
    escribirTexto: (ruta, texto) => {
      const completa = path.resolve(raiz, ruta);
      mkdirSync(path.dirname(completa), { recursive: true });
      writeFileSync(completa, texto);
    },
    existe: (ruta) => existsSync(path.resolve(raiz, ruta)),
    reloj: () => new Date(),
    salida: (texto) => process.stdout.write(`${texto}\n`),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = await verificar(process.argv.slice(2), depsDelSistema());
  } catch (error) {
    console.error(`verify-g-demo: ${error.message}`);
    process.exitCode = 1;
  }
}
