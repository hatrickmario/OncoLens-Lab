import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { crearEjecutorDeTransacciones } from '../../src/infrastructure/database.js';
import { crearProveedorDeCatalogo } from '../../src/infrastructure/catalogo/catalog-version.provider.js';
import { readFileSync } from 'node:fs';
import { idSembrado } from '../../prisma/seed/determinismo.js';
import { identidadSinteticaDe } from '../../prisma/seed/identidades.js';
import {
  DOCUMENTO_SINTETICO_CHAT,
  NOMBRE_SINTETICO_CHAT,
  PACIENTE_CHAT,
} from '../../prisma/seed/pacientes/chat.js';
import { PACIENTES_SEMILLA } from '../../prisma/seed/pacientes/indice.js';
import { componerCompletitud } from '../../src/modules/completeness/completeness.module.js';
import { crearBaseDelAnalisis } from '../../src/modules/evidence-analysis/analysis-basis.js';
import { crearContextDeidentifier } from '../../src/modules/evidence-analysis/deidentification/context-deidentifier.js';
import { crearConversationRepository } from '../../src/modules/evidence-analysis/conversation/conversation.repository.js';
import { crearConversationService } from '../../src/modules/evidence-analysis/conversation/conversation.service.js';
import { createEvidenceAnalysisRepository } from '../../src/modules/evidence-analysis/evidence-analysis.repository.js';
import { crearChecklistDelChat } from '../../src/modules/evidence-analysis/evidence-analysis.module.js';
import { cargarEtiquetasDeDatosCriticos } from '../../src/modules/evidence-analysis/etiquetas-datos-criticos.js';
import { crearTiposHabilitados } from '../../src/modules/evidence-analysis/tipos-habilitados.js';
import type { IdentidadDelPaciente } from '../../src/modules/evidence-analysis/ports.js';
import { crearCapturadorDeTurnos } from '../../src/evaluacion/chat/capturador.js';
import type {
  BaseParaPreparar,
  DependenciasDelComando,
} from '../../src/evaluacion/chat/comando.js';
import {
  configuracionDePiiDeTest,
  detectoresReales,
  lectorDeIdentidadFalso,
} from './desidentificacion.js';
import { AHORA, DISCLAIMER_DE_TEST, pseudonimosFijos, type MundoDeGateway } from './gateway.js';
import { RUTA_DEL_CATALOGO } from './seed.js';
import { loggerEnMemoria, relojFijo } from './usuarios.js';

/**
 * Soporte de `eval:chat-preparar` (L1D-326): arma sus dependencias sobre la BD de test con el seed sintético, el servicio de
 * conversación de producción y la identidad FALSA de los pacientes sembrados (el lector cifrado se prueba en US-046).
 * Todo dato es sintético (RN-13, RN-14).
 */

export const RAIZ_DEL_REPO = path.resolve(import.meta.dirname, '../../../..');
export const RUTA_DEL_DATASET = path.join(RAIZ_DEL_REPO, 'data/eval/chat-v1');

export interface EntornoDePreparacion {
  readonly deps: DependenciasDelComando;
  readonly directorio: string;
  /** Veces que el comando pidió componer el servicio, que es cuando se abren las claves de identidad. */
  readonly composiciones: () => number;
  readonly salida: () => string;
  readonly errores: () => string;
  readonly limpiar: () => void;
}

export interface OpcionesDePreparacion {
  entorno?: NodeJS.ProcessEnv;
  /** Raíz de un dataset alterno (`<raíz>/data/eval/chat-v1/casos.yaml`). */
  raizDelRepo?: string;
}

/** Identidad sintética de cada paciente sembrado, por id: la que la siembra guarda cifrada (`identidadSinteticaDe`). */
function identidadesDelSeed(): Record<string, IdentidadDelPaciente> {
  const mapa: Record<string, IdentidadDelPaciente> = {};
  PACIENTES_SEMILLA.forEach((paciente, indice) => {
    const patientId = idSembrado(paciente.clave);
    const { nombreCompleto, numeroDeDocumento } = identidadSinteticaDe(patientId, indice + 1);
    mapa[patientId] = { nombreCompleto, documento: numeroDeDocumento };
  });
  mapa[idSembrado(PACIENTE_CHAT)] = {
    nombreCompleto: NOMBRE_SINTETICO_CHAT,
    documento: DOCUMENTO_SINTETICO_CHAT,
  };
  return mapa;
}

function baseDelMundo(mundo: MundoDeGateway): BaseParaPreparar {
  return { consultar: (sql, valores) => mundo.cliente.query(sql, valores), cerrar: async () => {} };
}

export function prepararEntorno(
  mundo: MundoDeGateway,
  opciones: OpcionesDePreparacion = {},
): EntornoDePreparacion {
  const directorio = mkdtempSync(path.join(tmpdir(), 'chat-preparar-'));
  const salida: string[] = [];
  const errores: string[] = [];
  let composiciones = 0;
  const deps: DependenciasDelComando = {
    raizDelRepo: opciones.raizDelRepo ?? RAIZ_DEL_REPO,
    entorno: opciones.entorno ?? { APP_ENV: 'test' },
    directorioDeSalida: path.join(directorio, 'tmp'),
    stdout: (texto) => salida.push(texto),
    stderr: (texto) => errores.push(texto),
    abrirBase: () => Promise.resolve(baseDelMundo(mundo)),
    trazador: (
      (n = 0) =>
      () =>
        `req_PrepChat${String(++n).padStart(4, '0')}`
    )(),
    componerServicio: (base) => {
      composiciones += 1;
      return Promise.resolve(componerServicioDeTest(mundo, base));
    },
  };
  return {
    deps,
    directorio: deps.directorioDeSalida,
    composiciones: () => composiciones,
    salida: () => salida.join(''),
    errores: () => errores.join(''),
    limpiar: () => rmSync(directorio, { recursive: true, force: true }),
  };
}

function componerServicioDeTest(mundo: MundoDeGateway, _base: BaseParaPreparar) {
  const reloj = relojFijo(AHORA);
  const logger = loggerEnMemoria();
  const leer = (archivo: string): string => readFileSync(archivo, 'utf8');
  const completitud = componerCompletitud({
    db: mundo.cliente,
    rutaDelCatalogo: RUTA_DEL_CATALOGO,
    leerArchivo: leer,
    tiposHabilitados: crearTiposHabilitados(['mama', 'prostata'], ['mama', 'prostata']),
  });
  const capturador = crearCapturadorDeTurnos();
  const servicio = crearConversationService({
    conversaciones: crearConversationRepository(
      mundo.cliente,
      crearEjecutorDeTransacciones(mundo.pool),
    ),
    casos: createEvidenceAnalysisRepository(mundo.cliente),
    checklist: crearChecklistDelChat(completitud),
    desidentificador: crearContextDeidentifier({
      identidades: lectorDeIdentidadFalso(identidadesDelSeed()),
      detectores: detectoresReales(),
      pseudonimos: pseudonimosFijos(),
      appEnv: 'test',
      registrar: logger.registrar,
      expresionesDeFecha: configuracionDePiiDeTest().fechas.expresiones,
    }),
    rag: capturador,
    base: crearBaseDelAnalisis({
      etiquetaDe: cargarEtiquetasDeDatosCriticos(RUTA_DEL_CATALOGO, leer),
      maxFollowUps: 10,
    }),
    idsDeAnalisis: mundo.idsDeAnalisis,
    catalogo: crearProveedorDeCatalogo(RUTA_DEL_CATALOGO, leer),
    reloj,
    idsDeConversaciones: mundo.idsDeConversaciones,
    idsDeTurnos: mundo.idsDeTurnosDeChat,
    idsDeHilos: mundo.idsDeHilos,
    config: {
      ragTimeoutMs: 1000,
      chatRehydrateTurns: 6,
      maxOpciones: 1,
      aiDisclaimerText: DISCLAIMER_DE_TEST,
    },
  });
  return { servicio, capturador, usuarioId: idSembrado('usuario/doc1') };
}

/** Un dataset alterno en un directorio temporal: `<raíz>/data/eval/chat-v1/casos.yaml` con el YAML dado. */
export function datasetAlterno(yamlDeCasos: string): { raiz: string; limpiar: () => void } {
  const raiz = mkdtempSync(path.join(tmpdir(), 'chat-dataset-'));
  const dir = path.join(raiz, 'data/eval/chat-v1');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'casos.yaml'), yamlDeCasos, 'utf8');
  return { raiz, limpiar: () => rmSync(raiz, { recursive: true, force: true }) };
}
