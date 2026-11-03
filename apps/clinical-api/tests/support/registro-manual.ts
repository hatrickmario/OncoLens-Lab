import type { Express } from 'express';
import type { Client } from 'pg';
import { crearCatalogoDeEscalas } from '../../src/infrastructure/catalogo/catalogo-de-escalas.js';
import { crearProveedorDeCatalogo } from '../../src/infrastructure/catalogo/catalog-version.provider.js';
import { crearCatalogoTerminologico } from '../../src/infrastructure/catalogo/catalogo-terminologico.js';
import { completenessController } from '../../src/modules/completeness/completeness.controller.js';
import { crearTiposHabilitados } from '../../src/modules/evidence-analysis/tipos-habilitados.js';
import { componerModuloDeRegistroManual } from '../../src/modules/manual-entry/manual-entry.module.js';
import { createReconciliationService } from '../../src/modules/reconciliation/reconciliation.service.js';
import type { FuenteDeConexiones } from '../../src/modules/manual-entry/manual-entry.repository.js';
import { conectar } from './db.js';
import { appConAuth } from './app-auth.js';
import { RUTA_CATALOGO_FX01BB } from './catalogo-terminologico.js';
import { servicioDeCompletitud } from './completitud-http.js';
import { filaDeGradacionGleason, filaDeGradacionNottingham, insertar } from './filas-sinteticas.js';
import {
  RUTA_CATALOGO_TEST_1_0_0,
  leerTexto,
  nuevoPaciente,
  prepararSiembra,
  sembrarDiagnostico,
  sembrarFM2,
  type ContextoDeSiembra,
  type PacienteSembrado,
} from './completitud.js';
import {
  AHORA,
  TRACE_ID_GENERADO,
  abrirSesion,
  prepararMundoConSeed,
  type MundoDeGateway,
} from './gateway.js';
import { loggerEnMemoria, relojFijo, tokensFijos, type LoggerEnMemoria } from './usuarios.js';

/**
 * Soporte de los tests del registro manual (L1D-90): la aplicación de producción (login → guard → registro manual y
 * checklist) sobre la base sembrada, con el `ReconciliationService` y el adaptador de escalas REALES sobre el catálogo
 * `test-normalizacion-1.0.0` (no hay borde arquitectónico que fingir). Todo dato es sintético (RN-13, RN-14).
 */

export interface AppDeRegistroManual {
  readonly app: Express;
  readonly logger: LoggerEnMemoria;
}

export interface OpcionesDeRegistroManual {
  /** Catálogo montado; por defecto el fixture `test-normalizacion-1.0.0`. */
  rutaDelCatalogo?: string;
  /** Cada transacción abre su PROPIA conexión (como el Pool de producción): para probar el bloqueo entre peticiones. */
  conexionesIndependientes?: boolean;
}

function fuenteUnica(mundo: MundoDeGateway): FuenteDeConexiones {
  return {
    connect: () =>
      Promise.resolve({
        query: (sql, valores) => mundo.cliente.query(sql, valores),
        release: () => undefined,
      }),
  };
}

function fuenteIndependiente(mundo: MundoDeGateway): FuenteDeConexiones {
  return {
    connect: async () => {
      const cliente = await conectar(mundo.base.url);
      return {
        query: (sql, valores) => cliente.query(sql, valores),
        release: () => void cliente.end(),
      };
    },
  };
}

export function montarRegistroManual(
  mundo: MundoDeGateway,
  opciones: OpcionesDeRegistroManual = {},
): AppDeRegistroManual {
  const ruta = opciones.rutaDelCatalogo ?? RUTA_CATALOGO_FX01BB;
  const logger = loggerEnMemoria();
  const proveedor = crearProveedorDeCatalogo(ruta, leerTexto);
  const terminologia = crearCatalogoTerminologico(ruta, leerTexto, proveedor);
  const reloj = relojFijo(AHORA);
  const traceIds = { traceId: () => TRACE_ID_GENERADO };
  const router = componerModuloDeRegistroManual({
    // La conexión única del arnés: BEGIN/COMMIT caen en la misma sesión que las lecturas del test.
    fuente:
      opciones.conexionesIndependientes === true ? fuenteIndependiente(mundo) : fuenteUnica(mundo),
    reconciliacionPara: () =>
      createReconciliationService({ catalogo: terminologia, registrar: logger.registrar }),
    escalas: crearCatalogoDeEscalas(ruta, leerTexto, proveedor),
    tiposHabilitados: crearTiposHabilitados(['mama', 'prostata'], ['mama', 'prostata']),
    reloj,
    generarId: mundo.ids,
    traceIds,
    registrar: logger.registrar,
  });
  const checklist = completenessController({
    service: servicioDeCompletitud(mundo, { rutaDelCatalogo: RUTA_CATALOGO_TEST_1_0_0 }),
    traceIds,
    registrar: logger.registrar,
  });
  const app = appConAuth({
    cliente: mundo.cliente,
    espacio: mundo.espacio,
    tokens: tokensFijos('no-se-usa'),
    reloj,
    registrar: logger.registrar,
    rutasProtegidas: [router, checklist],
  });
  return { app, logger };
}

export interface EscenarioDeRegistroManual {
  readonly mundo: MundoDeGateway;
  readonly siembra: ContextoDeSiembra;
  readonly cookieDoctor: string;
  readonly cookieAdmin: string;
  readonly cerrar: () => Promise<void>;
}

export async function iniciarEscenarioDeRegistroManual(
  etiqueta: string,
  espacio: number,
): Promise<EscenarioDeRegistroManual> {
  const mundo = await prepararMundoConSeed(etiqueta, espacio);
  return {
    mundo,
    siembra: await prepararSiembra(mundo.cliente, mundo.ids),
    cookieDoctor: await abrirSesion(
      mundo,
      'doc1@test.local',
      `SINT-cookie-doctor-${etiqueta}-0001`,
    ),
    cookieAdmin: await abrirSesion(mundo, 'admin@test.local', `SINT-cookie-admin-${etiqueta}-0001`),
    cerrar: () => mundo.cerrar(),
  };
}

/** Ki-67 de FX-01b-b: el `name` canónico y el código ficticio del catálogo de test. */
export const KI67_DE_TEST = { name: 'Ki-67', loincCode: 'LOINC-T-KI67' } as const;

export const CUERPO_KI67 = {
  name: 'Ki-67',
  value: '20',
  unit: '%',
  resultType: 'cuantitativo',
  performedAt: '2026-09-10',
} as const;

/** F-M2 (mama, mixto, sin Ki-67, `grade = null`, TNM_8 IV, ECOG 2), con el `ENABLED_CANCER_TYPES` de test. */
export const sembrarMamaFM2 = (contexto: ContextoDeSiembra): Promise<PacienteSembrado> =>
  sembrarFM2(contexto);

/** Id del diagnóstico activo de un paciente (para colgarle gradaciones sintéticas). */
export async function diagnosticoActivoDe(cliente: Client, patientId: string): Promise<string> {
  const { rows } = await cliente.query<{ id: string }>(
    'SELECT id FROM clinical.diagnosis WHERE patient_id = $1 AND is_active',
    [patientId],
  );
  const id = rows[0]?.id;
  if (id === undefined) throw new Error('el paciente sembrado no tiene diagnóstico activo');
  return id;
}

/** Mama TNM_8 IIA con una gradación Nottingham grado 1 verificada y de referencia (`grade = 'Nottingham grado 1'`). */
export async function sembrarMamaConNottingham1(
  contexto: ContextoDeSiembra,
): Promise<PacienteSembrado> {
  const paciente = await nuevoPaciente(contexto);
  await sembrarDiagnostico(paciente, {
    cancerType: 'mama',
    histology: 'carcinoma ductal infiltrante',
    grade: 'Nottingham grado 1',
    stagingSystem: 'TNM_8',
    stageValue: 'IIA',
    performanceValue: 1,
  });
  const diagnosisId = await diagnosticoActivoDe(contexto.cliente, paciente.patientId);
  await insertar(
    contexto.cliente,
    'clinical.diagnosis_grading',
    filaDeGradacionNottingham(contexto.ids, diagnosisId, {
      nottingham_grade: 1,
      is_reference: true,
      created_at: '2026-05-01T12:00:00.000Z',
    }),
  );
  return paciente;
}

/** Próstata TNM_8 T2c sin gradación (FX-03b-a), con `grade = null`. */
export async function sembrarProstataTnm8(contexto: ContextoDeSiembra): Promise<PacienteSembrado> {
  const paciente = await nuevoPaciente(contexto);
  await sembrarDiagnostico(paciente, {
    cancerType: 'prostata',
    histology: 'adenocarcinoma acinar',
    grade: null,
    stagingSystem: 'TNM_8',
    stageValue: 'T2c',
    performanceValue: 1,
  });
  return paciente;
}

/** Próstata con una gradación de prostatectomía `global` 3+4 verificada y de referencia. */
export async function sembrarProstataConProstatectomiaGlobal(
  contexto: ContextoDeSiembra,
): Promise<PacienteSembrado> {
  const paciente = await sembrarProstataTnm8(contexto);
  const diagnosisId = await diagnosticoActivoDe(contexto.cliente, paciente.patientId);
  await insertar(
    contexto.cliente,
    'clinical.diagnosis_grading',
    filaDeGradacionGleason(contexto.ids, diagnosisId, {
      specimen_type: 'prostatectomia',
      grade_scope: 'global',
      gleason_primary_pattern: 3,
      gleason_secondary_pattern: 4,
      gleason_score: 7,
      isup_grade_group: 2,
      is_reference: true,
    }),
  );
  return paciente;
}

/** Paciente de mama sin ningún diagnóstico activo. */
export const sembrarSinDiagnostico = (contexto: ContextoDeSiembra): Promise<PacienteSembrado> =>
  nuevoPaciente(contexto);

/** Paciente egresado (RN-17) con un diagnóstico vigente: ningún registro se admite. */
export async function sembrarEgresado(contexto: ContextoDeSiembra): Promise<PacienteSembrado> {
  const paciente = await sembrarProstataTnm8(contexto);
  await contexto.cliente.query(
    "UPDATE clinical.patient SET lifecycle_status = 'egresado' WHERE id = $1",
    [paciente.patientId],
  );
  return paciente;
}

export interface ConteoDeFilas {
  readonly examenes: number;
  readonly biomarcadores: number;
  readonly diagnosticos: number;
  readonly gradaciones: number;
}

/** Filas clínicas del paciente: los tests de «no crea filas» comparan antes y después. */
export async function contarFilasDelPaciente(
  cliente: Client,
  patientId: string,
): Promise<ConteoDeFilas> {
  const contar = async (sql: string): Promise<number> => {
    const { rows } = await cliente.query<{ n: number }>(sql, [patientId]);
    return rows[0]?.n ?? 0;
  };
  return {
    examenes: await contar('SELECT count(*)::int AS n FROM clinical.exam WHERE patient_id = $1'),
    biomarcadores: await contar(
      'SELECT count(*)::int AS n FROM clinical.biomarker b JOIN clinical.exam e ON e.id = b.exam_id WHERE e.patient_id = $1',
    ),
    diagnosticos: await contar(
      'SELECT count(*)::int AS n FROM clinical.diagnosis WHERE patient_id = $1',
    ),
    gradaciones: await contar(
      'SELECT count(*)::int AS n FROM clinical.diagnosis_grading g JOIN clinical.diagnosis d ON d.id = g.diagnosis_id WHERE d.patient_id = $1',
    ),
  };
}

/** Mama con ECOG... reemplazado por Karnofsky 80: el valor solo es válido en su escala (0-100). */
export async function sembrarMamaConKarnofsky80(
  contexto: ContextoDeSiembra,
): Promise<PacienteSembrado> {
  const paciente = await sembrarMamaConNottingham1(contexto);
  await contexto.cliente.query(
    "UPDATE clinical.diagnosis SET performance_scale = 'Karnofsky', performance_value = 80 WHERE patient_id = $1",
    [paciente.patientId],
  );
  return paciente;
}
