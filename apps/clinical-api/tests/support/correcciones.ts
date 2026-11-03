import type { Express } from 'express';
import type { Client } from 'pg';
import { crearProveedorDeCatalogo } from '../../src/infrastructure/catalogo/catalog-version.provider.js';
import { crearCatalogoTerminologico } from '../../src/infrastructure/catalogo/catalogo-terminologico.js';
import { componerModuloDeCorrecciones } from '../../src/modules/corrections/corrections.module.js';
import type { LimitesDeCorreccion } from '../../src/modules/corrections/corrections.service.js';
import { createReconciliationService } from '../../src/modules/reconciliation/reconciliation.service.js';
import { appConAuth } from './app-auth.js';
import { RUTA_CATALOGO_FX01BB } from './catalogo-terminologico.js';
import { leerTexto, type PacienteSembrado } from './completitud.js';
import { INSTANTE_FIJO, FECHA_FIJA, insertar } from './filas-sinteticas.js';
import { AHORA, TRACE_ID_GENERADO, type MundoDeGateway } from './gateway.js';
import {
  CUERPO_KI67,
  iniciarEscenarioDeRegistroManual,
  montarRegistroManual,
  sembrarMamaFM2,
  type EscenarioDeRegistroManual,
} from './registro-manual.js';
import { clienteVerificado } from './verificarProveedor.js';
import { loggerEnMemoria, relojFijo, tokensFijos, type LoggerEnMemoria } from './usuarios.js';

/**
 * Soporte de los tests de la corrección con histórico (L1D-309): la aplicación de producción (login → guard →
 * corrección) sobre la base sembrada, con el `ReconciliationService` REAL sobre el catálogo `test-normalizacion-1.0.0`,
 * reloj congelado e ids inyectados. Todo dato es sintético (RN-13, RN-14).
 */

/** Límites de configuración de test (RN-22): una nota de más de 200 caracteres es «demasiado larga». */
export const LIMITES_DE_TEST: LimitesDeCorreccion = { notaMaxChars: 200, historialMax: 50 };

/** «Hoy» del reloj congelado (`AHORA`): una fecha posterior a esta es futura. */
export const HOY_DE_TEST = AHORA.slice(0, 10);
export const MANANA_DE_TEST = '2026-10-17';

export interface AppDeCorrecciones {
  readonly app: Express;
  readonly logger: LoggerEnMemoria;
}

export interface OpcionesDeCorrecciones {
  limites?: Partial<LimitesDeCorreccion>;
  rutaDelCatalogo?: string;
}

export function montarCorrecciones(
  mundo: MundoDeGateway,
  opciones: OpcionesDeCorrecciones = {},
): AppDeCorrecciones {
  const ruta = opciones.rutaDelCatalogo ?? RUTA_CATALOGO_FX01BB;
  const logger = loggerEnMemoria();
  const terminologia = crearCatalogoTerminologico(
    ruta,
    leerTexto,
    crearProveedorDeCatalogo(ruta, leerTexto),
  );
  const reloj = relojFijo(AHORA);
  const router = componerModuloDeCorrecciones({
    // La conexión única del arnés: BEGIN/COMMIT caen en la misma sesión que las lecturas del test.
    fuente: {
      connect: () =>
        Promise.resolve({
          query: (sql, valores) => mundo.cliente.query(sql, valores),
          release: () => undefined,
        }),
    },
    reconciliacionPara: () =>
      createReconciliationService({ catalogo: terminologia, registrar: logger.registrar }),
    limites: { ...LIMITES_DE_TEST, ...opciones.limites },
    reloj,
    generarId: mundo.ids,
    traceIds: { traceId: () => TRACE_ID_GENERADO },
    registrar: logger.registrar,
  });
  const app = appConAuth({
    cliente: mundo.cliente,
    espacio: mundo.espacio,
    tokens: tokensFijos('no-se-usa'),
    reloj,
    registrar: logger.registrar,
    rutasProtegidas: [router],
  });
  return { app, logger };
}

export type EscenarioDeCorrecciones = EscenarioDeRegistroManual;

export const iniciarEscenarioDeCorrecciones = iniciarEscenarioDeRegistroManual;

/** Registra Ki-67 `20 %` por el endpoint real del registro manual (US-110) y devuelve el id del biomarcador. */
export async function registrarKi67(
  escenario: EscenarioDeCorrecciones,
  patientId: string,
  cuerpo: Record<string, unknown> = CUERPO_KI67,
): Promise<string> {
  const respuesta = await clienteVerificado(montarRegistroManual(escenario.mundo).app)
    .post(`/platform/patients/${patientId}/biomarkers`)
    .set('Cookie', escenario.cookieDoctor)
    .send(cuerpo);
  if (respuesta.status !== 201) throw new Error('no se pudo registrar el biomarcador sintético');
  return respuesta.body.id as string;
}

/** Paciente F-M2 (mama) con una `ClinicalNote` sintética con PII; ya trae un HER2 `corregido` y un RE sin verificar. */
export async function pacienteConNotas(
  escenario: EscenarioDeCorrecciones,
): Promise<PacienteSembrado> {
  return sembrarMamaFM2(escenario.siembra);
}

/** FX-253-a: una nota `comorbilidad` y otra `nota_libre`, sintéticas y sin PII, para el paciente. Devuelve sus ids. */
export async function sembrarNotasDeFx253a(
  paciente: PacienteSembrado,
): Promise<{ comorbilidadId: string; notaLibreId: string }> {
  const nota = (noteType: string, content: string) =>
    insertar(paciente.cliente, 'clinical.clinical_note', {
      id: paciente.ids(),
      patient_id: paciente.patientId,
      episode_id: paciente.episodeId,
      created_by: paciente.userId,
      note_type: noteType,
      entry_method: 'seed',
      content,
      recorded_at: FECHA_FIJA,
      is_active: true,
      extraction_confidence: 'n_a',
      review_status: 'verificado',
      created_at: INSTANTE_FIJO,
    });
  const comorbilidad = await nota('comorbilidad', 'Hipertensión arterial en tratamiento.');
  const libre = await nota('nota_libre', 'Refiere buena tolerancia al tratamiento.');
  return { comorbilidadId: comorbilidad['id'] as string, notaLibreId: libre['id'] as string };
}

/** Paciente F-M2 pasado a `egresado` (RN-17): con HER2 y notas vigentes que NO admiten corrección. */
export async function pacienteEgresadoConDatos(
  escenario: EscenarioDeCorrecciones,
): Promise<PacienteSembrado & { biomarcadorId: string; notaId: string }> {
  const paciente = await sembrarMamaFM2(escenario.siembra);
  const { comorbilidadId } = await sembrarNotasDeFx253a(paciente);
  const biomarcadorId = await idDeBiomarcador(paciente.cliente, paciente.patientId, 'HER2');
  await paciente.cliente.query(
    "UPDATE clinical.patient SET lifecycle_status = 'egresado' WHERE id = $1",
    [paciente.patientId],
  );
  return { ...paciente, biomarcadorId, notaId: comorbilidadId };
}

export async function idDeBiomarcador(
  cliente: Client,
  patientId: string,
  nombre: string,
): Promise<string> {
  const { rows } = await cliente.query<{ id: string }>(
    `SELECT b.id FROM clinical.biomarker b JOIN clinical.exam e ON e.id = b.exam_id
      WHERE e.patient_id = $1 AND b.name = $2 AND b.review_status NOT IN ('rechazado', 'reemplazado')`,
    [patientId, nombre],
  );
  const id = rows[0]?.id;
  if (id === undefined) throw new Error(`el paciente sintético no tiene ${nombre} vigente`);
  return id;
}

export interface FilaDeBiomarcadorGuardada {
  readonly id: string;
  readonly value: string;
  readonly unit: string | null;
  readonly review_status: string;
  readonly supersedes_id: string | null;
  readonly original_name: string;
  readonly exam_id: string;
  readonly exam_entry_method: string;
  readonly exam_supersedes_id: string | null;
  readonly performed_at: string;
}

export async function filaDeBiomarcador(
  cliente: Client,
  id: string,
): Promise<FilaDeBiomarcadorGuardada> {
  const { rows } = await cliente.query<FilaDeBiomarcadorGuardada>(
    `SELECT b.id, b.value, b.unit, b.review_status::text AS review_status, b.supersedes_id, b.original_name,
            b.exam_id, e.entry_method::text AS exam_entry_method, e.supersedes_id AS exam_supersedes_id,
            to_char(e.performed_at, 'YYYY-MM-DD') AS performed_at
       FROM clinical.biomarker b JOIN clinical.exam e ON e.id = b.exam_id WHERE b.id = $1`,
    [id],
  );
  const fila = rows[0];
  if (fila === undefined) throw new Error('el biomarcador sintético no existe');
  return fila;
}

export interface FilaDeNotaGuardada {
  readonly id: string;
  readonly content: string;
  readonly note_type: string;
  readonly review_status: string;
  readonly is_active: boolean;
  readonly entry_method: string;
  readonly supersedes_id: string | null;
  readonly recorded_at: string;
}

export async function filaDeNota(cliente: Client, id: string): Promise<FilaDeNotaGuardada> {
  const { rows } = await cliente.query<FilaDeNotaGuardada>(
    `SELECT id, content, note_type::text AS note_type, review_status::text AS review_status, is_active,
            entry_method::text AS entry_method, supersedes_id, to_char(recorded_at, 'YYYY-MM-DD') AS recorded_at
       FROM clinical.clinical_note WHERE id = $1`,
    [id],
  );
  const fila = rows[0];
  if (fila === undefined) throw new Error('la nota sintética no existe');
  return fila;
}

export interface ConteoDeCorrecciones {
  readonly examenes: number;
  readonly biomarcadores: number;
  readonly notas: number;
}

/** Filas del paciente: los tests de «no crea filas» comparan antes y después. */
export async function contarFilasDeCorreccion(
  cliente: Client,
  patientId: string,
): Promise<ConteoDeCorrecciones> {
  const contar = async (sql: string): Promise<number> => {
    const { rows } = await cliente.query<{ n: number }>(sql, [patientId]);
    return rows[0]?.n ?? 0;
  };
  return {
    examenes: await contar('SELECT count(*)::int AS n FROM clinical.exam WHERE patient_id = $1'),
    biomarcadores: await contar(
      'SELECT count(*)::int AS n FROM clinical.biomarker b JOIN clinical.exam e ON e.id = b.exam_id WHERE e.patient_id = $1',
    ),
    notas: await contar(
      'SELECT count(*)::int AS n FROM clinical.clinical_note WHERE patient_id = $1',
    ),
  };
}
