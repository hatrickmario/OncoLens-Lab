import 'server-only';
import {
  correctBiomarker,
  correctClinicalNote,
  getBiomarkerHistory,
  getClinicalNoteHistory,
  listClinicalNotes,
} from '../../../../packages/api-contracts/src/client-web/clinical-api';
import {
  zCorrectBiomarkerBody,
  zCorrectBiomarkerPath,
  zCorrectClinicalNoteBody,
  zCorrectClinicalNotePath,
  zGetBiomarkerHistoryPath,
  zGetClinicalNoteHistoryPath,
  zListClinicalNotesPath,
} from '../../../../packages/api-contracts/src/zod/clinical-api/zod.gen';
import { crearSdkClinicalApi, type SdkClinicalApi } from './clinical-api';
import type { DependenciasDelBff } from './dependencias';
import { verificarOrigen } from './origen';
import { esTipoJson, leerCuerpoAcotado } from './peticiones';
import { responderCuerpoExcesivo, retransmitir } from './proxy-json';
import { respuestaPropia } from './respuestas';

const EVENTO = 'correcciones.proxy';

export type OperacionDeRegistroManual =
  | 'correctBiomarker'
  | 'getBiomarkerHistory'
  | 'listClinicalNotes'
  | 'correctClinicalNote'
  | 'getClinicalNoteHistory';

export interface ParametrosDeRuta {
  id: string;
  biomarkerId?: string;
  noteId?: string;
}

export type ManejadorDeRegistroManual = (
  request: Request,
  parametros: ParametrosDeRuta,
) => Promise<Response>;

interface Esquema {
  safeParse(valor: unknown): { success: boolean; error?: { issues: { path: PropertyKey[] }[] } };
}

type Llamada = (
  sdk: SdkClinicalApi,
  ids: { patientId: string; biomarkerId: string; noteId: string },
  cuerpo: string,
) => Promise<{ response?: Response }>;

interface Definicion {
  ruta: Esquema;
  /** Solo las mutaciones llevan cuerpo, `Origin` y `Content-Type: application/json`. */
  cuerpo?: Esquema;
  llamar: Llamada;
}

const base = { parseAs: 'text', throwOnError: false } as const;
const comoTexto = (texto: string) => ({
  body: texto as never,
  bodySerializer: (t: unknown) => t as string,
});

const DEFINICIONES: Record<OperacionDeRegistroManual, Definicion> = {
  correctBiomarker: {
    ruta: zCorrectBiomarkerPath,
    cuerpo: zCorrectBiomarkerBody,
    llamar: (sdk, ids, cuerpo) =>
      correctBiomarker({ client: sdk.client, path: ids, ...comoTexto(cuerpo), ...base }),
  },
  getBiomarkerHistory: {
    ruta: zGetBiomarkerHistoryPath,
    llamar: (sdk, ids) => getBiomarkerHistory({ client: sdk.client, path: ids, ...base }),
  },
  listClinicalNotes: {
    ruta: zListClinicalNotesPath,
    llamar: (sdk, ids) =>
      listClinicalNotes({ client: sdk.client, path: { patientId: ids.patientId }, ...base }),
  },
  correctClinicalNote: {
    ruta: zCorrectClinicalNotePath,
    cuerpo: zCorrectClinicalNoteBody,
    llamar: (sdk, ids, cuerpo) =>
      correctClinicalNote({ client: sdk.client, path: ids, ...comoTexto(cuerpo), ...base }),
  },
  getClinicalNoteHistory: {
    ruta: zGetClinicalNoteHistoryPath,
    llamar: (sdk, ids) => getClinicalNoteHistory({ client: sdk.client, path: ids, ...base }),
  },
};

function responderPropia(
  dependencias: DependenciasDelBff,
  status: number,
  cuerpo: { error: string; message: string; field?: string },
  motivo?: 'content_type',
): Response {
  const traceId = dependencias.nuevoTraceId();
  dependencias.registrar({ event: EVENTO, status, traceId, ...(motivo && { motivo }) });
  return respuestaPropia({ ...cuerpo, traceId }, status);
}

/** 422 propio: nombra el campo que falla (sin eco del valor) para que la UI lo marque; no contacta a clinical-api. */
function responderCuerpoInvalido(dependencias: DependenciasDelBff, campo?: PropertyKey): Response {
  return responderPropia(dependencias, 422, {
    error: 'CUERPO_INVALIDO',
    ...(typeof campo === 'string' && { field: campo }),
    message: 'La solicitud no cumple el contrato.',
  });
}

/** Única forma de 5xx hacia el navegador: nada de lo que envió clinical-api (cuerpo, pila, traza) lo atraviesa. */
function responderErrorInterno(dependencias: DependenciasDelBff, inicio: number): Response {
  const traceId = dependencias.nuevoTraceId();
  dependencias.registrar({
    event: EVENTO,
    status: 500,
    traceId,
    duracionMs: dependencias.ahora() - inicio,
  });
  return respuestaPropia(
    { error: 'ERROR_INTERNO', message: 'No se pudo completar la operación.', traceId },
    500,
  );
}

/** `Origin` exacto y JSON antes de leer el cuerpo (CSRF, SEG-01); `null` si la mutación puede seguir. */
function rechazarMutacion(request: Request, dependencias: DependenciasDelBff): Response | null {
  const rechazoDeOrigen = verificarOrigen(request, { ...dependencias, evento: EVENTO });
  if (rechazoDeOrigen !== null) return rechazoDeOrigen;
  if (esTipoJson(request.headers)) return null;
  return responderPropia(
    dependencias,
    403,
    { error: 'PERMISO_DENEGADO', message: 'La solicitud debe enviarse como application/json.' },
    'content_type',
  );
}

async function leerMutacion(
  request: Request,
  dependencias: DependenciasDelBff,
  esquema: Esquema,
): Promise<{ cuerpo: string } | { rechazo: Response }> {
  const cuerpo = await leerCuerpoAcotado(request, dependencias.config.maxBodyBytes);
  if (cuerpo === null) return { rechazo: responderCuerpoExcesivo(dependencias, EVENTO) };
  let datos: unknown;
  try {
    datos = JSON.parse(cuerpo);
  } catch {
    return { rechazo: responderCuerpoInvalido(dependencias) };
  }
  const leido = esquema.safeParse(datos);
  if (leido.success) return { cuerpo };
  return { rechazo: responderCuerpoInvalido(dependencias, leido.error?.issues[0]?.path[0]) };
}

async function pedir(
  llamada: () => Promise<{ response?: Response }>,
): Promise<Response | undefined> {
  try {
    return (await llamada()).response;
  } catch {
    return undefined;
  }
}

/**
 * Proxy de las cinco operaciones de corrección con histórico (US-253). Las lecturas van sin `Origin` (cookie
 * `SameSite=Strict`); las mutaciones verifican `Origin` y validan el cuerpo con el Zod generado antes de reenviarlo tal
 * cual. Solo la cookie de sesión sale hacia clinical-api; 2xx y 4xx se retransmiten sin reinterpretar y un 5xx o un fallo
 * de red responde `ERROR_INTERNO` propio. El log lleva evento, status y traceId: nunca ids, valores ni texto de notas.
 */
export function crearManejadorDeRegistroManual(
  dependencias: DependenciasDelBff,
  operacion: OperacionDeRegistroManual,
): ManejadorDeRegistroManual {
  const definicion = DEFINICIONES[operacion];
  return async (request, parametros) => {
    const ids = {
      patientId: parametros.id,
      biomarkerId: parametros.biomarkerId ?? '',
      noteId: parametros.noteId ?? '',
    };
    const rutaValida = definicion.ruta.safeParse({
      patientId: ids.patientId,
      ...(parametros.biomarkerId !== undefined && { biomarkerId: ids.biomarkerId }),
      ...(parametros.noteId !== undefined && { noteId: ids.noteId }),
    });
    const rechazo = definicion.cuerpo ? rechazarMutacion(request, dependencias) : null;
    if (rechazo !== null) return rechazo;
    if (!rutaValida.success) {
      return responderPropia(dependencias, 404, {
        error: 'NO_ENCONTRADO',
        message: 'Dato no encontrado.',
      });
    }
    let cuerpo = '';
    if (definicion.cuerpo) {
      const lectura = await leerMutacion(request, dependencias, definicion.cuerpo);
      if ('rechazo' in lectura) return lectura.rechazo;
      cuerpo = lectura.cuerpo;
    }
    const inicio = dependencias.ahora();
    const sdk = crearSdkClinicalApi(dependencias.config, { request, fetch: dependencias.fetch });
    const respuesta = await pedir(() => definicion.llamar(sdk, ids, cuerpo));
    if (respuesta === undefined || respuesta.status >= 500) {
      return responderErrorInterno(dependencias, inicio);
    }
    return retransmitir(dependencias, { evento: EVENTO, sdk, respuesta, inicio });
  };
}
