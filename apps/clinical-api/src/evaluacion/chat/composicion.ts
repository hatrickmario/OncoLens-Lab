import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { idSembrado } from '../../../prisma/seed/determinismo.js';
import { leerConfiguracionDelSeed } from '../../../prisma/seed/config.js';
import {
  ConfiguracionInvalidaError,
  readDatabaseConfig,
  type DatabaseConfig,
  readDeidentificationConfig,
  readEvidenceAnalysisConfig,
  type EvidenceAnalysisConfig,
} from '../../config/index.js';
import type { Clock } from '../../infrastructure/clock.js';
import { crearEjecutorDeTransacciones } from '../../infrastructure/database.js';
import { crearProveedorDeCatalogo } from '../../infrastructure/catalogo/catalog-version.provider.js';
import type { GeneradorDeIds } from '../../infrastructure/ids.js';
import { nuevoSeudonimo } from '../../infrastructure/ids.js';
import type { Registrar } from '../../infrastructure/logger.js';
import type { Consultador } from '../../modules/auth/auth.repository.js';
import { componerCompletitud } from '../../modules/completeness/completeness.module.js';
import { crearBaseDelAnalisis } from '../../modules/evidence-analysis/analysis-basis.js';
import { crearContextDeidentifier } from '../../modules/evidence-analysis/deidentification/context-deidentifier.js';
import { crearLectorDeIdentidad } from '../../modules/evidence-analysis/deidentification/patient-identity.reader.js';
import { crearDetectorOpcionA } from '../../modules/evidence-analysis/deidentification/pii-detector.opcion-a.js';
import { cargarConfiguracionDePii } from '../../modules/evidence-analysis/deidentification/pii-formats.config.js';
import { crearConversationRepository } from '../../modules/evidence-analysis/conversation/conversation.repository.js';
import { crearConversationService } from '../../modules/evidence-analysis/conversation/conversation.service.js';
import { crearChecklistDelChat } from '../../modules/evidence-analysis/evidence-analysis.module.js';
import { createEvidenceAnalysisRepository } from '../../modules/evidence-analysis/evidence-analysis.repository.js';
import { cargarEtiquetasDeDatosCriticos } from '../../modules/evidence-analysis/etiquetas-datos-criticos.js';
import type { ContextDeidentifier } from '../../modules/evidence-analysis/ports.js';
import { crearTiposHabilitados } from '../../modules/evidence-analysis/tipos-habilitados.js';
import {
  crearServicioDeIdentidad,
  leerClavesDeIdentidadDelEntorno,
} from '../../modules/patients/identity.module.js';
import { crearCapturadorDeTurnos } from './capturador.js';
import type { BaseParaPreparar, DependenciasDelComando, ServicioParaPreparar } from './comando.js';

/** Todo lo que el servicio de conversación necesita, explícito: el proceso real y los tests lo arman con sus propias piezas. */
export interface EntradasDeLaComposicion {
  db: Consultador;
  pool: pg.Pool;
  rutaDelCatalogo: string;
  leerArchivo: (ruta: string) => string;
  desidentificador: ContextDeidentifier;
  analisis: Pick<
    EvidenceAnalysisConfig,
    | 'ragTimeoutMs'
    | 'chatRehydrateTurns'
    | 'analysisMaxOptions'
    | 'analysisFollowupMax'
    | 'aiDisclaimerText'
  >;
  reloj: Clock;
  ids: {
    analisis: GeneradorDeIds;
    conversaciones: GeneradorDeIds;
    turnos: GeneradorDeIds;
    hilos: GeneradorDeIds;
  };
}

/**
 * El servicio de conversación de producción (`crearConversationService`) con un cliente de Backend 2 capturador en el puerto
 * de `/chat/turn`: no duplica el armado del contexto ni la desidentificación (RN-11) y no llama a nadie.
 * `ENABLED_CANCER_TYPES` no se lee: el dataset mide mama y próstata, los dos tipos del manifiesto.
 */
export function componerServicioDeConversacion(
  entradas: EntradasDeLaComposicion,
): Pick<ServicioParaPreparar, 'servicio' | 'capturador'> {
  const { db, pool, rutaDelCatalogo, leerArchivo, analisis } = entradas;
  const catalogo = crearProveedorDeCatalogo(rutaDelCatalogo, leerArchivo);
  const tipos = catalogo.cancerTypes();
  const completitud = componerCompletitud({
    db,
    rutaDelCatalogo,
    leerArchivo,
    tiposHabilitados: crearTiposHabilitados(tipos, tipos),
  });
  const capturador = crearCapturadorDeTurnos();
  const servicio = crearConversationService({
    conversaciones: crearConversationRepository(db, crearEjecutorDeTransacciones(pool)),
    casos: createEvidenceAnalysisRepository(db),
    checklist: crearChecklistDelChat(completitud),
    desidentificador: entradas.desidentificador,
    rag: capturador,
    base: crearBaseDelAnalisis({
      etiquetaDe: cargarEtiquetasDeDatosCriticos(rutaDelCatalogo, leerArchivo),
      maxFollowUps: analisis.analysisFollowupMax,
    }),
    idsDeAnalisis: entradas.ids.analisis,
    catalogo,
    reloj: entradas.reloj,
    idsDeConversaciones: entradas.ids.conversaciones,
    idsDeTurnos: entradas.ids.turnos,
    idsDeHilos: entradas.ids.hilos,
    config: {
      ragTimeoutMs: analisis.ragTimeoutMs,
      chatRehydrateTurns: analisis.chatRehydrateTurns,
      maxOpciones: analisis.analysisMaxOptions,
      aiDisclaimerText: analisis.aiDisclaimerText,
    },
  });
  return { servicio, capturador };
}

/** `AI_DISCLAIMER_TEXT` no se muestra a nadie aquí (los turnos se descartan): una ausencia no impide preparar. */
const AVISO_SIN_USO = 'sin uso: las peticiones se preparan para medir, no para mostrar';
/** El capturador no llama a Backend 2: esta URL solo satisface la lectura de la configuración de producción. */
const URL_SIN_USO = 'http://rag-orchestrator.invalid';

const leerArchivo = (ruta: string): string => readFileSync(ruta, 'utf8');
const ignorar: Registrar = () => undefined;

/** Nombre con el que se verifica el certificado de PostgreSQL cuando difiere del host (el de test solo certifica `postgres`). */
const SERVIDOR_TLS = 'EVAL_CHAT_DB_TLS_SERVERNAME';

/** Mismo pool que `crearPool` (TLS verificado contra la CA) más `servername` opcional: conectar desde el host al PostgreSQL de Compose. */
function abrirPool(entorno: NodeJS.ProcessEnv, config: DatabaseConfig): pg.Pool {
  const servername = entorno[SERVIDOR_TLS]?.trim();
  const pool = new pg.Pool({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    ssl: {
      ca: config.ca,
      rejectUnauthorized: true,
      ...(servername !== undefined && servername !== '' && { servername }),
    },
  });
  pool.on('error', () => ignorar({ event: 'pool_postgres_error' }));
  return pool;
}

/** Puerto y base del PostgreSQL de test de Compose: los mismos por omisión que `scripts/test-integration.sh`. */
const PUERTO_DE_TEST = '55432';
const BASE_DE_TEST = 'oncolens';
/** Certificado del PostgreSQL de Compose: solo certifica el nombre del servicio. */
const SERVICIO_DE_POSTGRES = 'postgres';

/**
 * El entorno de la preparación sobre el stack de test de Compose (`scripts/setup-secrets.sh --profile test`): lo que el
 * entorno ya define manda; solo se completan las rutas de secretos y la conexión. `APP_ENV` NO se completa: la guarda de
 * RN-13 exige que quien corre el comando declare el entorno (no se presume uno permitido).
 */
export function entornoDelStackDeTest(
  entorno: NodeJS.ProcessEnv,
  raizDelRepo: string,
): NodeJS.ProcessEnv {
  const secretos =
    entorno['ONCOLENS_SECRETS_DIR'] ?? path.join(raizDelRepo, 'infra', 'docker', 'secrets');
  const puerto = entorno['PG_TEST_PORT'] ?? PUERTO_DE_TEST;
  const base = entorno['POSTGRES_DB'] ?? BASE_DE_TEST;
  return {
    CLINICAL_DATABASE_URL: `postgresql://clinical_api@127.0.0.1:${puerto}/${base}`,
    PG_CLINICAL_API_PASSWORD_FILE: path.join(secretos, 'pg_clinical_api_password'),
    CLINICAL_DATABASE_CA_FILE: path.join(secretos, 'pg_ca.crt'),
    IDENTITY_AES_KEY_FILE: path.join(secretos, 'identity_aes_key'),
    BLIND_INDEX_HMAC_KEY_FILE: path.join(secretos, 'blind_index_hmac_key'),
    [SERVIDOR_TLS]: SERVICIO_DE_POSTGRES,
    ...entorno,
  };
}

/** `EvidenceAnalysisConfig` con la configuración de producción (RN-22); la URL y el aviso se completan solo si faltan. */
function analisisDelProceso(entorno: NodeJS.ProcessEnv, rutaDelCatalogo: string) {
  return readEvidenceAnalysisConfig({
    RAG_ORCHESTRATOR_URL: URL_SIN_USO,
    AI_DISCLAIMER_TEXT: AVISO_SIN_USO,
    CLINICAL_CATALOG_PATH: rutaDelCatalogo,
    ...entorno,
  });
}

/**
 * El desidentificador de producción (RN-11) con la identidad cifrada real. Aquí se abren las claves de identidad: solo se
 * invoca después de las guardas (RN-13).
 */
function desidentificadorDelProceso(
  entorno: NodeJS.ProcessEnv,
  raizDelRepo: string,
  pool: pg.Pool,
): ContextDeidentifier {
  const pii = cargarConfiguracionDePii(
    readDeidentificationConfig({
      PII_FORMATS_PATH: path.join(raizDelRepo, 'config', 'pii-formats.json'),
      PII_MASKS_PATH: path.join(raizDelRepo, 'apps', 'clinical-api', 'config', 'pii-masks.json'),
      ...entorno,
    }),
    leerArchivo,
  );
  const identidad = crearServicioDeIdentidad({
    claves: leerClavesDeIdentidadDelEntorno(entorno, leerArchivo),
    db: pool,
  });
  return crearContextDeidentifier({
    identidades: crearLectorDeIdentidad(identidad),
    detectores: { para: (conocida) => crearDetectorOpcionA(conocida, pii) },
    pseudonimos: { nuevo: nuevoSeudonimo },
    appEnv: entorno['APP_ENV'] ?? '',
    registrar: ignorar,
    expresionesDeFecha: pii.fechas.expresiones,
  });
}

/**
 * Dependencias del proceso real (`npm run eval:chat-preparar`): PostgreSQL con el mismo camino que `clinical-api` (TLS
 * verificado, contraseña por archivo) y la identidad cifrada real. Las claves de identidad se leen SOLO en
 * `componerServicio`, que el comando invoca después de las guardas (RN-13). Nada se registra: sin logs de contenido.
 */
export function dependenciasDelProceso(
  entorno: NodeJS.ProcessEnv,
  { raizDelRepo, reloj }: { raizDelRepo: string; reloj: Clock },
): Pick<DependenciasDelComando, 'abrirBase' | 'componerServicio'> {
  let pool: pg.Pool | null = null;
  return {
    abrirBase: () => {
      const abierto = abrirPool(entorno, readDatabaseConfig(entorno, leerArchivo));
      pool = abierto;
      const base: BaseParaPreparar = {
        consultar: (sql, valores) => abierto.query(sql, valores),
        cerrar: () => abierto.end(),
      };
      return Promise.resolve(base);
    },
    componerServicio: () => {
      if (pool === null)
        throw new ConfiguracionInvalidaError('CLINICAL_DATABASE_URL', 'sin base abierta');
      const rutaDelCatalogo = leerConfiguracionDelSeed(entorno).rutaDelCatalogo;
      const { servicio, capturador } = componerServicioDeConversacion({
        db: pool,
        pool,
        rutaDelCatalogo,
        leerArchivo,
        desidentificador: desidentificadorDelProceso(entorno, raizDelRepo, pool),
        analisis: analisisDelProceso(entorno, rutaDelCatalogo),
        reloj,
        ids: {
          analisis: randomUUID,
          conversaciones: randomUUID,
          turnos: randomUUID,
          hilos: randomUUID,
        },
      });
      return Promise.resolve({ servicio, capturador, usuarioId: idSembrado('usuario/doc1') });
    },
  };
}
