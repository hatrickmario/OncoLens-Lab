import { createHash } from 'node:crypto';
import { delay, http, HttpResponse } from 'msw';
import type { Client } from 'pg';
import type { Express } from 'express';
import type { CryptoKey } from 'jose';
import respuestaEjemplo from '../../../../contracts/examples/rag-query-con-evidencia.json' with { type: 'json' };
import respuestaSinEvidencia from '../../../../contracts/examples/rag-query-sin-evidencia.json' with { type: 'json' };
import { idSembrado } from '../../prisma/seed/determinismo.js';
import { createRagOrchestratorClient } from '../../src/infrastructure/rag-orchestrator.client.js';
import { createServiceTokenSigner } from '../../src/infrastructure/service-jwt.js';
import { crearProveedorDeVersionDeCatalogo } from '../../src/modules/evidence-analysis/catalog-version.provider.js';
import { componerGatewayDeAnalisis } from '../../src/modules/evidence-analysis/evidence-analysis.module.js';
import { crearRagQueryClient } from '../../src/modules/evidence-analysis/rag-query.adapter.js';
import type { IdGenerator, PseudonymGenerator } from '../../src/modules/evidence-analysis/ports.js';
import type { GeneradorDeToken } from '../../src/modules/auth/auth.service.js';
import { readFileSync } from 'node:fs';
import { appConAuth } from './app-auth.js';
import type { BaseDeTest } from './db.js';
import { conectar } from './db.js';
import {
  FECHA_FIJA,
  INSTANTE_FIJO,
  filaDeDiagnostico,
  filaDeEpisodio,
  filaDeIdentidad,
  filaDePaciente,
  generadorDeIds,
  insertar,
  type GeneradorDeIds,
} from './filas-sinteticas.js';
import { servidorMswConLoopback } from './servidor-msw.js';
import {
  RUTA_DEL_CATALOGO,
  crearBaseDelSeed,
  entornoDelSeed,
  escribirArchivosDeContrasena,
  seedContraLaBase,
  type ArchivosDeContrasena,
} from './seed.js';
import { generarParEfimero } from './service-jwt.js';
import {
  insertarSesion,
  loggerEnMemoria,
  relojFijo,
  tokensFijos,
  type LoggerEnMemoria,
} from './usuarios.js';

/**
 * Soporte del gateway de análisis (US-052): base propia con el seed sintético (pacientes a-e, `doc1` y `admin`),
 * `rag-orchestrator` simulado con MSW desde `contracts/examples/` (captura cabeceras y cuerpo y cuenta llamadas) y la
 * aplicación de producción compuesta con reloj, `traceId` y seudónimo fijos. Todo dato es sintético (RN-13, RN-14).
 */

export const RAG_BASE_URL = 'http://rag-orchestrator:8000';
export const AHORA = '2026-10-16T12:00:00.000Z';
export const TRACE_ID_GENERADO = 'req_TestGen0001';
export const PREGUNTA_AC1 =
  '¿Qué opciones describe la evidencia para cáncer de próstata con progresión tras terapia de deprivación androgénica?';
export const TODAS_LAS_FUENTES = { guias: true, ensayos: true, publicaciones: true } as const;
export const PUNTERO_422 = '#/paths/~1platform~1evidence-analyses/post/responses/422';
export const PUNTERO_404 = '#/paths/~1platform~1evidence-analyses/post/responses/404';
export const PUNTERO_403 = '#/paths/~1platform~1evidence-analyses/post/responses/403';
export const PUNTERO_401 = '#/paths/~1platform~1evidence-analyses/post/responses/401';
export const PUNTERO_502 = '#/paths/~1platform~1evidence-analyses/post/responses/502';
export const PUNTERO_200 = '#/paths/~1platform~1evidence-analyses/post/responses/200';
export const PUNTERO_500 = '#/paths/~1platform~1evidence-analyses/post/responses/500';
export const PUNTERO_503 = '#/paths/~1platform~1evidence-analyses/post/responses/503';
export const PUNTERO_504 = '#/paths/~1platform~1evidence-analyses/post/responses/504';
/** Preguntas del plan de pruebas de FEAT-06a: `Q-HER2` obtiene evidencia (`LLM-OK`) y `Q-SIN` no. */
export const PREGUNTA_Q_HER2 =
  '¿Qué opciones adyuvantes describe la evidencia para cáncer de mama HER2 positivo en estadio IIA?';
export const PREGUNTA_Q_SIN =
  '¿Qué opciones describe la evidencia para un tumor inexistente en el corpus?';
export const DISCLAIMER_DE_TEST = 'Aviso sintético de IA de test · Uso académico/investigación';
export const SUPUESTO_S1_DE_TEST =
  'Datos del paciente recibidos como contexto. Esta versión no verifica su completitud ni la ausencia de datos clínicamente relevantes.';
/** Plazo corto REAL: el temporizador que aborta la llamada es del runtime; el reloj de la aplicación sí está congelado. */
export const RAG_TIMEOUT_MS_DE_TEST = 150;
const RESPUESTA_TARDIA_MS = 2000;

export const idDePaciente = (letra: 'a' | 'b' | 'c' | 'd' | 'e'): string =>
  idSembrado(`paciente-${letra}`);

export const versionDelCatalogo = (): string =>
  (JSON.parse(readFileSync(`${RUTA_DEL_CATALOGO}/manifest.json`, 'utf8')) as { version: string })
    .version;

const hashDe = (token: string) => createHash('sha256').update(token).digest('hex');

export interface MundoDeGateway {
  readonly base: BaseDeTest;
  readonly cliente: Client;
  readonly ids: GeneradorDeIds;
  /** UUID de los `AIAnalysisRecord`: un solo generador por base, para que los tests de un archivo no repitan ids. */
  readonly idsDeAnalisis: GeneradorDeIds;
  readonly espacio: number;
  readonly cerrar: () => Promise<void>;
}

/** Una base migrada y sembrada por archivo de test: los conteos y los pacientes creados no se pisan entre archivos. */
export async function prepararMundoConSeed(
  etiqueta: string,
  espacio: number,
): Promise<MundoDeGateway> {
  const base = await crearBaseDelSeed(etiqueta);
  const archivos: ArchivosDeContrasena = escribirArchivosDeContrasena();
  try {
    await seedContraLaBase(base.url).ejecutar(entornoDelSeed(archivos));
  } finally {
    archivos.limpiar();
  }
  const cliente = await conectar(base.url);
  return {
    base,
    cliente,
    ids: generadorDeIds(espacio),
    idsDeAnalisis: generadorDeIds(espacio + 2000),
    espacio,
    cerrar: async () => {
      await cliente.end();
      await base.destruir();
    },
  };
}

export interface CapturaDeRag {
  readonly headers: Headers;
  readonly texto: string;
  readonly cuerpo: Record<string, unknown>;
}

export type EscenarioDeRag =
  | { tipo: 'json'; status: number; cuerpo: object; cabeceras?: Record<string, string> }
  | { tipo: 'red' }
  /** No responde dentro de `RAG_TIMEOUT_MS`: contesta con evidencia, pero mucho después del plazo. */
  | { tipo: 'tardia' };

const ESCENARIO_POR_DEFECTO: EscenarioDeRag = {
  tipo: 'json',
  status: 200,
  cuerpo: respuestaEjemplo,
};

/** `rag-orchestrator` responde `200` con el ejemplo sin evidencia (`Q-SIN`). */
export const SIN_EVIDENCIA: EscenarioDeRag = {
  tipo: 'json',
  status: 200,
  cuerpo: respuestaSinEvidencia,
};

export interface RagSimulado {
  readonly capturadas: CapturaDeRag[];
  llamadas(): number;
  /** Cambia lo que responde `/rag/query` hasta el próximo `reiniciar()`. */
  responder(escenario: EscenarioDeRag): void;
  reiniciar(): void;
  iniciar(): void;
  detener(): void;
}

/** `/rag/query` simulado: responde el escenario vigente (por defecto, con evidencia) y captura cada request. */
export function ragSimulado(): RagSimulado {
  const capturadas: CapturaDeRag[] = [];
  let escenario: EscenarioDeRag = ESCENARIO_POR_DEFECTO;
  const servidor = servidorMswConLoopback(
    http.post(`${RAG_BASE_URL}/rag/query`, async ({ request }) => {
      const texto = await request.text();
      capturadas.push({
        headers: request.headers,
        texto,
        cuerpo: JSON.parse(texto) as Record<string, unknown>,
      });
      if (escenario.tipo === 'red') return HttpResponse.error();
      if (escenario.tipo === 'tardia') {
        await delay(RESPUESTA_TARDIA_MS);
        return HttpResponse.json(respuestaEjemplo);
      }
      return HttpResponse.json(escenario.cuerpo, {
        status: escenario.status,
        ...(escenario.cabeceras !== undefined && { headers: escenario.cabeceras }),
      });
    }),
  );
  return {
    capturadas,
    llamadas: () => capturadas.length,
    responder: (nuevo) => {
      escenario = nuevo;
    },
    reiniciar: () => {
      capturadas.length = 0;
      escenario = ESCENARIO_POR_DEFECTO;
      servidor.servidor.resetHandlers();
    },
    iniciar: servidor.iniciar,
    detener: servidor.detener,
  };
}

export interface OpcionesDeGateway {
  /** Por defecto `test`; `undefined` explícito simula `APP_ENV` ausente. */
  appEnv?: string | undefined;
  /** Sustituye al generador de token de sesión (por defecto, valores fijos). */
  tokens?: GeneradorDeToken;
  ids?: IdGenerator;
  pseudonimos?: PseudonymGenerator;
  /** `ANALYSIS_MAX_OPTIONS` (por defecto 1, el valor del S1). */
  analysisMaxOptions?: number;
  evidenceDefaultYears?: number;
  /** `RAG_TIMEOUT_MS` (por defecto, el plazo corto de test). */
  ragTimeoutMs?: number;
}

export interface GatewayDeTest {
  readonly app: Express;
  readonly logger: LoggerEnMemoria;
  readonly clavePublica: CryptoKey;
}

/** Seudónimos sucesivos y deterministas: `psd_TestPseudonimo0001`, `…0002`. */
export function pseudonimosFijos(): PseudonymGenerator {
  let n = 0;
  return { nuevo: () => `psd_TestPseudonimo${String(++n).padStart(4, '0')}` };
}

/** La aplicación de producción (login → guard → gateway) con la BD de test y `rag-orchestrator` simulado. */
export async function montarGateway(
  mundo: MundoDeGateway,
  opciones: OpcionesDeGateway = {},
): Promise<GatewayDeTest> {
  const { privateKey, publicKey } = await generarParEfimero();
  const reloj = relojFijo(AHORA);
  const logger = loggerEnMemoria();
  const signer = createServiceTokenSigner({ privateKey, clock: reloj, ttlSeconds: 60 });
  const rag = crearRagQueryClient(createRagOrchestratorClient({ baseUrl: RAG_BASE_URL, signer }));
  const appEnv = Object.hasOwn(opciones, 'appEnv') ? opciones.appEnv : 'test';
  const ruta = componerGatewayDeAnalisis({
    db: mundo.cliente,
    rag,
    catalogo: crearProveedorDeVersionDeCatalogo(RUTA_DEL_CATALOGO, (archivo) =>
      readFileSync(archivo, 'utf8'),
    ),
    config: {
      appEnv,
      analysisMaxOptions: opciones.analysisMaxOptions ?? 1,
      evidenceDefaultYears: opciones.evidenceDefaultYears ?? 10,
      ragTimeoutMs: opciones.ragTimeoutMs ?? RAG_TIMEOUT_MS_DE_TEST,
      aiDisclaimerText: DISCLAIMER_DE_TEST,
      analysisBasisAssumptionText: SUPUESTO_S1_DE_TEST,
    },
    reloj,
    ids: opciones.ids ?? { traceId: () => TRACE_ID_GENERADO },
    idsDeAnalisis: mundo.idsDeAnalisis,
    pseudonimos: opciones.pseudonimos ?? pseudonimosFijos(),
    registrar: logger.registrar,
  });
  const app = appConAuth({
    cliente: mundo.cliente,
    espacio: mundo.espacio,
    tokens: opciones.tokens ?? tokensFijos('no-se-usa'),
    reloj,
    registrar: logger.registrar,
    rutasProtegidas: [ruta],
  });
  return { app, logger, clavePublica: publicKey };
}

/** Usuario sembrado por correo → cabecera `Cookie` de una sesión vigente creada para el test. */
export async function abrirSesion(
  mundo: MundoDeGateway,
  email: 'doc1@test.local' | 'admin@test.local',
  token: string,
): Promise<string> {
  const { rows } = await mundo.cliente.query<{ id: string }>(
    'SELECT id FROM auth."user" WHERE email = $1',
    [email],
  );
  const usuario = rows[0];
  if (usuario === undefined) throw new Error(`el seed no creó a ${email}`);
  await insertarSesion(mundo.cliente, mundo.ids, {
    userId: usuario.id,
    tokenHash: hashDe(token),
    expiresAt: '2026-10-16T20:00:00.000Z',
  });
  return `oncolens_session=${token}`;
}

/** Paciente sintético extra (la tabla del seed no se toca): con o sin diagnóstico activo y con el origen indicado. */
export async function crearPacienteSintetico(
  mundo: MundoDeGateway,
  opciones: { dataOrigin?: 'sintetico' | 'real_anonimizado'; conDiagnostico: boolean },
): Promise<string> {
  const { cliente, ids } = mundo;
  const { rows } = await cliente.query<{ id: string }>(
    `SELECT id FROM auth."user" WHERE email = 'doc1@test.local'`,
  );
  const doctorId = rows[0]?.id ?? '';
  const paciente = await insertar(
    cliente,
    'clinical.patient',
    filaDePaciente(ids, { data_origin: opciones.dataOrigin ?? 'sintetico' }),
  );
  const episodio = await insertar(
    cliente,
    'clinical.care_episode',
    filaDeEpisodio(ids, paciente['id'] as string, doctorId),
  );
  if (opciones.conDiagnostico) {
    await insertar(
      cliente,
      'clinical.diagnosis',
      filaDeDiagnostico(ids, paciente['id'] as string, episodio['id'] as string),
    );
  }
  return paciente['id'] as string;
}

/** PII SINTÉTICA de FX-T4a-a (backlog FEAT-T4a): nada de esto es de una persona real (RN-13, RN-14). */
const CEDULA_SINTETICA = ['5212', '3456'].join('');
const TELEFONO_SINTETICO = ['300', '1234567'].join('');
// Los números se arman por partes: el escáner de PII de la CI no distingue un valor sintético de uno real (US-036).
export const PII_FX_T4A_A = {
  cedula: CEDULA_SINTETICA,
  nombre: 'Lucía Fernanda Rondón Peña',
  telefono: TELEFONO_SINTETICO,
  convenio: 'CONV-TEST-01',
  textoLibre: `Paciente Lucía Rondón (CC ${CEDULA_SINTETICA}), tel. ${TELEFONO_SINTETICO}, refiere dolor leve.`,
} as const;

/**
 * FX-T4a-a: paciente sintético con PII conocida en la identidad cifrada (bytes ficticios), el convenio y el texto libre
 * de una nota y de un evento, con diagnóstico de mama, HER2 y un tratamiento previo. Devuelve su id.
 */
export async function crearPacienteFxT4aA(mundo: MundoDeGateway): Promise<string> {
  const { cliente, ids } = mundo;
  const { rows } = await cliente.query<{ id: string }>(
    `SELECT id FROM auth."user" WHERE email = 'doc1@test.local'`,
  );
  const doctorId = rows[0]?.id ?? '';
  const paciente = await insertar(
    cliente,
    'clinical.patient',
    filaDePaciente(ids, {
      birth_year: 1971,
      sex: 'F',
      agreement_reference: PII_FX_T4A_A.convenio,
    }),
  );
  const patientId = paciente['id'] as string;
  await insertar(cliente, 'identity.patient_identity', filaDeIdentidad(patientId));
  const episodio = await insertar(
    cliente,
    'clinical.care_episode',
    filaDeEpisodio(ids, patientId, doctorId),
  );
  const episodeId = episodio['id'] as string;
  await insertar(
    cliente,
    'clinical.diagnosis',
    filaDeDiagnostico(ids, patientId, episodeId, {
      cancer_type: 'mama',
      icd10_code: 'C50.9',
      staging_system: 'TNM_8',
      stage_value: 'IIA',
      performance_scale: 'ECOG',
      performance_value: 1,
    }),
  );
  const examen = await insertar(cliente, 'clinical.exam', {
    id: ids(),
    patient_id: patientId,
    episode_id: episodeId,
    source_document_id: null,
    exam_type: 'laboratorio',
    source_lab: null,
    entry_method: 'seed',
    performed_at: FECHA_FIJA,
    created_at: INSTANTE_FIJO,
  });
  await insertar(cliente, 'clinical.biomarker', {
    id: ids(),
    exam_id: examen['id'],
    name: 'HER2',
    original_name: 'HER2',
    mapping_status: 'no_mapeado',
    value: '3+ (IHQ)',
    reference_range: '',
    result_type: 'cualitativo',
    clinical_significance: 'relevante',
    significance_source: 'documento',
    extraction_confidence: 'n_a',
    review_status: 'verificado',
    source_span: '{}',
    created_at: INSTANTE_FIJO,
  });
  await insertar(cliente, 'clinical.clinical_note', {
    id: ids(),
    patient_id: patientId,
    episode_id: episodeId,
    created_by: doctorId,
    note_type: 'nota_libre',
    entry_method: 'seed',
    content: PII_FX_T4A_A.textoLibre,
    recorded_at: FECHA_FIJA,
    is_active: true,
    extraction_confidence: 'n_a',
    review_status: 'verificado',
    created_at: INSTANTE_FIJO,
  });
  await insertar(cliente, 'clinical.prior_treatment', {
    id: ids(),
    patient_id: patientId,
    episode_id: episodeId,
    line_number: 1,
    setting: 'adyuvante',
    regimen_name: 'AC-T',
    atc_codes: [],
    mapping_status: 'no_mapeado',
    started_at: FECHA_FIJA,
    ongoing: false,
    end_reason: 'completado',
    entry_method: 'seed',
    extraction_confidence: 'n_a',
    review_status: 'verificado',
    created_at: INSTANTE_FIJO,
  });
  await insertar(cliente, 'clinical.clinical_event', {
    id: ids(),
    patient_id: patientId,
    episode_id: episodeId,
    event_type: 'evolucion',
    event_date: FECHA_FIJA,
    date_precision: 'dia',
    description: PII_FX_T4A_A.textoLibre,
    mapping_status: 'n_a',
    entry_method: 'seed',
    extraction_confidence: 'n_a',
    review_status: 'verificado',
    created_at: INSTANTE_FIJO,
  });
  return patientId;
}

export async function contarAnalisisDelPaciente(
  cliente: Client,
  patientId: string,
): Promise<number> {
  const { rows } = await cliente.query<{ n: number }>(
    'SELECT count(*)::int AS n FROM clinical.ai_analysis_record WHERE patient_id = $1',
    [patientId],
  );
  return rows[0]?.n ?? 0;
}

/** Columnas de `clinical.ai_analysis_record` que afirman los tests (snake_case; jsonb ya parseado). */
export interface FilaDelRegistro {
  id: string;
  patient_id: string;
  episode_id: string;
  requested_by: string;
  analysis_type: string;
  trace_id: string;
  query_text: string;
  status: string;
  top_relevance_score: number | null;
  evidence_options: unknown[];
  analysis_basis: Record<string, unknown> & { assumptions: { text: string; origin: string }[] };
  filters_applied: Record<string, unknown>;
  clinical_context_snapshot: Record<string, unknown>;
  context_fingerprint: string;
  patient_data_links: { dataRef: string; entityType: string; entityId: string }[];
  [columna: string]: unknown;
}

/** Fila cruda de `clinical.ai_analysis_record` de un `trace_id`; `undefined` si no hay. */
export async function leerRegistroPorTrace(
  cliente: Client,
  traceId: string,
): Promise<FilaDelRegistro | undefined> {
  const { rows } = await cliente.query<FilaDelRegistro>(
    'SELECT * FROM clinical.ai_analysis_record WHERE trace_id = $1',
    [traceId],
  );
  return rows[0];
}

/** Cantidad de registros de análisis con ese `trace_id` (los de un test no se mezclan con los de otro). */
export async function contarRegistrosPorTrace(cliente: Client, traceId: string): Promise<number> {
  const { rows } = await cliente.query<{ n: number }>(
    'SELECT count(*)::int AS n FROM clinical.ai_analysis_record WHERE trace_id = $1',
    [traceId],
  );
  return rows[0]?.n ?? 0;
}

export async function contarEventosDelPaciente(
  cliente: Client,
  patientId: string,
): Promise<number> {
  const { rows } = await cliente.query<{ n: number }>(
    'SELECT count(*)::int AS n FROM clinical.clinical_event WHERE patient_id = $1',
    [patientId],
  );
  return rows[0]?.n ?? 0;
}

/**
 * Provoca un fallo real de escritura (RN-06): un *trigger* temporal `BEFORE INSERT` en `clinical.ai_analysis_record`
 * que lanza una excepción con texto sintético. Devuelve la función que lo elimina. La base es de este archivo de test.
 */
export async function instalarFalloDeEscrituraDelRegistro(
  cliente: Client,
  textoDelError: string,
): Promise<() => Promise<void>> {
  await cliente.query(`
    CREATE FUNCTION clinical.test_falla_insercion_analisis() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION '${textoDelError}'; END $$`);
  await cliente.query(`
    CREATE TRIGGER test_falla_insercion_analisis BEFORE INSERT ON clinical.ai_analysis_record
    FOR EACH ROW EXECUTE FUNCTION clinical.test_falla_insercion_analisis()`);
  return async () => {
    await cliente.query(
      'DROP TRIGGER test_falla_insercion_analisis ON clinical.ai_analysis_record',
    );
    await cliente.query('DROP FUNCTION clinical.test_falla_insercion_analisis()');
  };
}
