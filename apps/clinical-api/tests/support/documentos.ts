import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Router, type Express } from 'express';
import { http, HttpResponse } from 'msw';
import type { Client } from 'pg';
import { crearAlmacenMinio } from '../../src/infrastructure/almacen-documentos.minio.js';
import type { Registrar } from '../../src/infrastructure/logger.js';
import { componerModuloDeDocumentos } from '../../src/modules/documents/documents.module.js';
import { appConAuth } from './app-auth.js';
import { generadorDeIds, type GeneradorDeIds } from './filas-sinteticas.js';
import {
  AHORA,
  RAG_BASE_URL,
  TRACE_ID_GENERADO,
  abrirSesion,
  prepararMundoConSeed,
  type MundoDeGateway,
} from './gateway.js';
import { servidorMswConLoopback } from './servidor-msw.js';
import { loggerEnMemoria, relojFijo, tokensFijos, type LoggerEnMemoria } from './usuarios.js';

/**
 * Soporte de los tests de la carga de documentos (L1D-56). `clinical-minio` es un borde arquitectónico: se simula con
 * MSW a nivel HTTP S3 (el adapter real de producción habla con él tal cual) y `rag-orchestrator` cuenta cualquier
 * llamada que reciba (la carga no debe hacer ninguna). Solo PDFs y bytes sintéticos (RN-13, RN-14).
 */

export const ENDPOINT_DEL_ALMACEN = 'http://clinical-minio:9000';
export const BUCKET_DE_TEST = 'clinical-documents';
/** `MAX_UPLOAD_MB` de la configuración de test (US-076 AC-3). */
export const MAX_UPLOAD_MB_DE_TEST = 20;
export const BYTES_POR_MB = 1024 * 1024;

const CARPETA_DE_FIXTURES = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../fixtures/documents',
);

/** Fixture sintético de FX-01a-a. */
export const fixture = (nombre: 'mama-examen.pdf' | 'informe.docx' | 'falso.pdf'): Buffer =>
  readFileSync(path.join(CARPETA_DE_FIXTURES, nombre));

/** PDF sintético de `megabytes` MiB (`grande.pdf` no se versiona: se genera en memoria, determinista). */
export function pdfSinteticoDe(megabytes: number): Buffer {
  const cabecera = Buffer.from('%PDF-1.4\n% SINT relleno sintetico FX-01a-a\n');
  return Buffer.concat([cabecera, Buffer.alloc(megabytes * BYTES_POR_MB - cabecera.length, 0x20)]);
}

export interface ObjetoGuardado {
  readonly clave: string;
  readonly bytes: Buffer;
  /** Cabeceras (nombre en minúscula → valor) con las que el cliente envió el objeto. */
  readonly cabeceras: Readonly<Record<string, string>>;
}

export interface EntornoSimulado {
  /** Objetos hoy en el bucket simulado, por clave. */
  objetos(): ReadonlyMap<string, ObjetoGuardado>;
  /** Cuántos `PUT` de objeto llegaron al almacén (haya salido bien o no). */
  escrituras(): number;
  /** Llamadas recibidas por `rag-orchestrator` (la carga no debe hacer ninguna). */
  llamadasARag(): number;
  /** Desde ya, el almacén falla toda operación (red caída) hasta `reiniciar()`. */
  caerAlmacen(): void;
  /** Desde ya, solo falla el borrado de objetos (la escritura sigue bien) hasta `reiniciar()`. */
  caerBorrado(): void;
  /** Ejecuta `accion` cuando llega la próxima escritura al almacén, antes de contestarla (otra carga que gana la carrera). */
  alEscribir(accion: () => Promise<void>): void;
  reiniciar(): void;
  iniciar(): void;
  detener(): void;
}

export function entornoSimulado(): EntornoSimulado {
  const objetos = new Map<string, ObjetoGuardado>();
  let escrituras = 0;
  let llamadasARag = 0;
  let caido = false;
  let borradoCaido = false;
  let alEscribir: (() => Promise<void>) | undefined;
  const claveDe = (url: string): string =>
    decodeURIComponent(new URL(url).pathname).slice(`/${BUCKET_DE_TEST}/`.length);
  const servidor = servidorMswConLoopback(
    http.all(`${RAG_BASE_URL}/*`, () => {
      llamadasARag += 1;
      return HttpResponse.json({}, { status: 500 });
    }),
    http.put(`${ENDPOINT_DEL_ALMACEN}/${BUCKET_DE_TEST}/*`, async ({ request }) => {
      escrituras += 1;
      if (caido) return HttpResponse.error();
      const pendiente = alEscribir;
      alEscribir = undefined;
      await pendiente?.();
      const clave = claveDe(request.url);
      objetos.set(clave, {
        clave,
        bytes: Buffer.from(await request.arrayBuffer()),
        cabeceras: Object.fromEntries(request.headers.entries()),
      });
      return new HttpResponse(null, { status: 200, headers: { ETag: '"sintetico"' } });
    }),
    http.delete(`${ENDPOINT_DEL_ALMACEN}/${BUCKET_DE_TEST}/*`, ({ request }) => {
      if (caido || borradoCaido) return HttpResponse.error();
      objetos.delete(claveDe(request.url));
      return new HttpResponse(null, { status: 204 });
    }),
    http.head(
      `${ENDPOINT_DEL_ALMACEN}/${BUCKET_DE_TEST}`,
      () => new HttpResponse(null, { status: 200 }),
    ),
  );
  return {
    objetos: () => objetos,
    escrituras: () => escrituras,
    llamadasARag: () => llamadasARag,
    caerAlmacen: () => {
      caido = true;
    },
    caerBorrado: () => {
      borradoCaido = true;
    },
    alEscribir: (accion) => {
      alEscribir = accion;
    },
    reiniciar: () => {
      caido = false;
      borradoCaido = false;
      alEscribir = undefined;
      escrituras = 0;
      llamadasARag = 0;
    },
    iniciar: servidor.iniciar,
    detener: servidor.detener,
  };
}

export interface AppDeDocumentos {
  readonly app: Express;
  /** Routers protegidos montados tras el guard (para recorrer sus rutas contra el contrato). */
  readonly rutas: readonly Router[];
  readonly logger: LoggerEnMemoria;
}

export interface OpcionesDeDocumentos {
  maxUploadMb?: number;
  logger?: LoggerEnMemoria;
  registrar?: Registrar;
}

/** Un generador de ids de documento por mundo: varias apps del mismo archivo comparten base y no pueden repetir ids. */
const idsDeDocumentoPorMundo = new WeakMap<MundoDeGateway, GeneradorDeIds>();

function idsDeDocumento(mundo: MundoDeGateway): GeneradorDeIds {
  const existente = idsDeDocumentoPorMundo.get(mundo);
  if (existente !== undefined) return existente;
  const nuevo = generadorDeIds(mundo.espacio + 3000);
  idsDeDocumentoPorMundo.set(mundo, nuevo);
  return nuevo;
}

/** La aplicación de producción (login → guard → documentos) con la BD de test y `clinical-minio` simulado en su borde HTTP. */
export function montarDocumentos(
  mundo: MundoDeGateway,
  opciones: OpcionesDeDocumentos = {},
): AppDeDocumentos {
  const reloj = relojFijo(AHORA);
  const logger = opciones.logger ?? loggerEnMemoria();
  const router = componerModuloDeDocumentos({
    db: mundo.cliente,
    almacen: crearAlmacenMinio({
      endpoint: ENDPOINT_DEL_ALMACEN,
      bucket: BUCKET_DE_TEST,
      accessKey: 'acceso-sintetico-de-test',
      secretKey: 'clave-sintetica-de-test',
      timeoutMs: 8000,
    }),
    reloj,
    ids: idsDeDocumento(mundo),
    traceIds: { traceId: () => TRACE_ID_GENERADO },
    registrar: logger.registrar,
    config: { maxUploadMb: opciones.maxUploadMb ?? MAX_UPLOAD_MB_DE_TEST },
  });
  const app = appConAuth({
    cliente: mundo.cliente,
    espacio: mundo.espacio,
    tokens: tokensFijos('no-se-usa'),
    reloj,
    registrar: logger.registrar,
    rutasProtegidas: [router],
  });
  return { app, logger, rutas: [router] };
}

/** Hace fallar todo `INSERT` en `clinical.document` hasta que se quite (el fallo posterior a escribir el objeto). */
export async function instalarFalloDeInsercionDeDocumento(cliente: Client): Promise<void> {
  await cliente.query(`
    CREATE FUNCTION clinical.test_falla_insercion_documento() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'fallo sintetico de test'; END $$`);
  await cliente.query(`
    CREATE TRIGGER test_falla_insercion_documento BEFORE INSERT ON clinical.document
    FOR EACH ROW EXECUTE FUNCTION clinical.test_falla_insercion_documento()`);
}

export async function quitarFalloDeInsercionDeDocumento(cliente: Client): Promise<void> {
  await cliente.query('DROP TRIGGER test_falla_insercion_documento ON clinical.document');
  await cliente.query('DROP FUNCTION clinical.test_falla_insercion_documento()');
}

export interface FilaDeDocumento {
  id: string;
  checksum: string;
  attempts: number;
  ocr_status: string;
  object_storage_key: string;
  original_filename: string;
  uploaded_by: string;
}

/** Filas de `clinical.document` del paciente. */
export async function documentosDelPaciente(
  mundo: MundoDeGateway,
  patientId: string,
): Promise<FilaDeDocumento[]> {
  const { rows } = await mundo.cliente.query<FilaDeDocumento>(
    `SELECT id, checksum, attempts, ocr_status::text AS ocr_status, object_storage_key, original_filename, uploaded_by
       FROM clinical.document WHERE patient_id = $1 ORDER BY uploaded_at, id`,
    [patientId],
  );
  return rows;
}

export interface EscenarioDeDocumentos {
  readonly mundo: MundoDeGateway;
  readonly entorno: EntornoSimulado;
  readonly cookieDoctor: string;
  readonly cookieAdmin: string;
  /** Id del usuario `doc1@test.local` (quien carga). */
  readonly doctorId: string;
  readonly cerrar: () => Promise<void>;
}

/** Base sembrada, sesiones de `doc1` y `admin` y el entorno simulado ya iniciado: una por archivo de test. */
export async function iniciarEscenarioDeDocumentos(
  etiqueta: string,
  espacio: number,
): Promise<EscenarioDeDocumentos> {
  const entorno = entornoSimulado();
  entorno.iniciar();
  const mundo = await prepararMundoConSeed(etiqueta, espacio);
  const cookieDoctor = await abrirSesion(
    mundo,
    'doc1@test.local',
    `SINT-cookie-doctor-${etiqueta}-0001`,
  );
  const cookieAdmin = await abrirSesion(
    mundo,
    'admin@test.local',
    `SINT-cookie-admin-${etiqueta}-0001`,
  );
  const { rows } = await mundo.cliente.query<{ id: string }>(
    `SELECT id FROM auth."user" WHERE email = 'doc1@test.local'`,
  );
  return {
    mundo,
    entorno,
    cookieDoctor,
    cookieAdmin,
    doctorId: rows[0]?.id ?? '',
    cerrar: async () => {
      entorno.detener();
      await mundo.cerrar();
    },
  };
}
