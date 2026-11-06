import 'server-only';
import {
  correctBiomarker,
  correctClinicalNote,
  createManualBiomarker,
  createManualClinicalAttribute,
  createManualDiagnosis,
  createManualPriorTreatment,
  getBiomarkerHistory,
  getClinicalNoteHistory,
  getManualEntryOptions,
  listClinicalAttributes,
  listClinicalNotes,
} from '../../../../packages/api-contracts/src/client-web/clinical-api';
import {
  zCorrectBiomarkerBody,
  zCorrectBiomarkerPath,
  zCorrectClinicalAttributeBody,
  zCorrectClinicalAttributePath,
  zCorrectClinicalNoteBody,
  zCorrectClinicalNotePath,
  zCorrectPriorTreatmentBody,
  zCorrectPriorTreatmentPath,
  zCreateManualBiomarkerBody,
  zCreateManualBiomarkerPath,
  zCreateManualClinicalAttributeBody,
  zCreateManualDiagnosisBody,
  zCreateManualDiagnosisPath,
  zGetManualEntryOptionsPath,
  zCreateManualPriorTreatmentBody,
  zGetBiomarkerHistoryPath,
  zCreateManualClinicalAttributePath,
  zCreateManualPriorTreatmentPath,
  zGetClinicalAttributeHistoryPath,
  zGetClinicalNoteHistoryPath,
  zGetPriorTreatmentHistoryPath,
  zListClinicalAttributesPath,
  zListClinicalNotesPath,
} from '../../../../packages/api-contracts/src/zod/clinical-api/zod.gen';
import type { ZodType } from 'zod';
import { crearSdkClinicalApi, type SdkClinicalApi } from './clinical-api';
import type { DependenciasDelBff } from './dependencias';
import { verificarOrigen } from './origen';
import { esTipoJson, leerCuerpoAcotado } from './peticiones';
import { responderCuerpoExcesivo, retransmitir } from './proxy-json';
import { respuestaPropia } from './respuestas';

export type OperacionDeRegistroManual =
  | 'correctBiomarker'
  | 'getBiomarkerHistory'
  | 'listClinicalNotes'
  | 'correctClinicalNote'
  | 'getClinicalNoteHistory'
  | 'correctPriorTreatment'
  | 'getPriorTreatmentHistory'
  | 'correctClinicalAttribute'
  | 'getClinicalAttributeHistory'
  | 'createManualPriorTreatment'
  | 'listClinicalAttributes'
  | 'createManualClinicalAttribute'
  | 'createManualBiomarker'
  | 'createManualDiagnosis'
  | 'getManualEntryOptions';

export interface ParametrosDeRuta {
  id: string;
  biomarkerId?: string;
  noteId?: string;
  treatmentId?: string;
  attributeId?: string;
}

export type ManejadorDeRegistroManual = (
  request: Request,
  parametros: ParametrosDeRuta,
) => Promise<Response>;

type Respuesta = { response?: Response };
type Llamada = (sdk: SdkClinicalApi, cuerpo: unknown) => Promise<Respuesta>;

interface Definicion {
  /** Evento de log propio de la operación: evento, status y traceId, nunca ids ni contenido. */
  evento: string;
  /** Solo las mutaciones llevan cuerpo, `Origin` y `Content-Type: application/json`. */
  cuerpo?: ZodType;
  /** `null` si algún id de la ruta no es un UUID. */
  preparar(parametros: ParametrosDeRuta): Llamada | null;
}

const base = { parseAs: 'text', throwOnError: false } as const;

/** Une el schema de la ruta con su llamada: la llamada recibe los ids ya validados y tipados, sin rellenos. */
function definir<R, B = never>(definicion: {
  evento: string;
  ruta: ZodType<R>;
  cuerpo?: ZodType<B>;
  llamar: (sdk: SdkClinicalApi, ruta: R, cuerpo: B) => Promise<Respuesta>;
}): Definicion {
  return {
    evento: definicion.evento,
    ...(definicion.cuerpo && { cuerpo: definicion.cuerpo }),
    preparar: ({ id, ...ids }) => {
      const ruta = definicion.ruta.safeParse({ patientId: id, ...ids });
      return ruta.success ? (sdk, cuerpo) => definicion.llamar(sdk, ruta.data, cuerpo as B) : null;
    },
  };
}

const DEFINICIONES: Record<OperacionDeRegistroManual, Definicion> = {
  correctBiomarker: definir({
    evento: 'correcciones.biomarcador.corregir',
    ruta: zCorrectBiomarkerPath,
    cuerpo: zCorrectBiomarkerBody,
    llamar: (sdk, path, body) => correctBiomarker({ client: sdk.client, path, body, ...base }),
  }),
  getBiomarkerHistory: definir({
    evento: 'correcciones.biomarcador.historico',
    ruta: zGetBiomarkerHistoryPath,
    llamar: (sdk, path) => getBiomarkerHistory({ client: sdk.client, path, ...base }),
  }),
  listClinicalNotes: definir({
    evento: 'correcciones.notas.listar',
    ruta: zListClinicalNotesPath,
    llamar: (sdk, path) => listClinicalNotes({ client: sdk.client, path, ...base }),
  }),
  correctClinicalNote: definir({
    evento: 'correcciones.nota.corregir',
    ruta: zCorrectClinicalNotePath,
    cuerpo: zCorrectClinicalNoteBody,
    llamar: (sdk, path, body) => correctClinicalNote({ client: sdk.client, path, body, ...base }),
  }),
  getClinicalNoteHistory: definir({
    evento: 'correcciones.nota.historico',
    ruta: zGetClinicalNoteHistoryPath,
    llamar: (sdk, path) => getClinicalNoteHistory({ client: sdk.client, path, ...base }),
  }),
  correctPriorTreatment: definir({
    evento: 'correcciones.tratamiento.corregir',
    ruta: zCorrectPriorTreatmentPath,
    cuerpo: zCorrectPriorTreatmentBody,
    llamar: () => Promise.reject(new Error('no implementado')),
  }),
  getPriorTreatmentHistory: definir({
    evento: 'correcciones.tratamiento.historico',
    ruta: zGetPriorTreatmentHistoryPath,
    llamar: () => Promise.reject(new Error('no implementado')),
  }),
  correctClinicalAttribute: definir({
    evento: 'correcciones.atributo.corregir',
    ruta: zCorrectClinicalAttributePath,
    cuerpo: zCorrectClinicalAttributeBody,
    llamar: () => Promise.reject(new Error('no implementado')),
  }),
  getClinicalAttributeHistory: definir({
    evento: 'correcciones.atributo.historico',
    ruta: zGetClinicalAttributeHistoryPath,
    llamar: () => Promise.reject(new Error('no implementado')),
  }),
  createManualPriorTreatment: definir({
    evento: 'registro_clinico.tratamiento.crear',
    ruta: zCreateManualPriorTreatmentPath,
    cuerpo: zCreateManualPriorTreatmentBody,
    llamar: (sdk, path, body) =>
      createManualPriorTreatment({ client: sdk.client, path, body, ...base }),
  }),
  listClinicalAttributes: definir({
    evento: 'registro_clinico.atributos.listar',
    ruta: zListClinicalAttributesPath,
    llamar: (sdk, path) => listClinicalAttributes({ client: sdk.client, path, ...base }),
  }),
  createManualClinicalAttribute: definir({
    evento: 'registro_clinico.atributo.crear',
    ruta: zCreateManualClinicalAttributePath,
    cuerpo: zCreateManualClinicalAttributeBody,
    llamar: (sdk, path, body) =>
      createManualClinicalAttribute({ client: sdk.client, path, body, ...base }),
  }),
  createManualBiomarker: definir({
    evento: 'registro_manual.biomarcador.crear',
    ruta: zCreateManualBiomarkerPath,
    cuerpo: zCreateManualBiomarkerBody,
    llamar: (sdk, path, body) => createManualBiomarker({ client: sdk.client, path, body, ...base }),
  }),
  createManualDiagnosis: definir({
    evento: 'registro_manual.diagnostico.crear',
    ruta: zCreateManualDiagnosisPath,
    cuerpo: zCreateManualDiagnosisBody,
    llamar: (sdk, path, body) => createManualDiagnosis({ client: sdk.client, path, body, ...base }),
  }),
  getManualEntryOptions: definir({
    evento: 'registro_manual.opciones.leer',
    ruta: zGetManualEntryOptionsPath,
    llamar: (sdk, path) => getManualEntryOptions({ client: sdk.client, path, ...base }),
  }),
};

/** Lo que cada respuesta propia del BFF necesita para registrarse: sus dependencias y el evento de la operación. */
interface Contexto {
  dependencias: DependenciasDelBff;
  evento: string;
}

function responderPropia(
  { dependencias, evento }: Contexto,
  status: number,
  cuerpo: { error: string; message: string; field?: string },
  motivo?: 'content_type',
): Response {
  const traceId = dependencias.nuevoTraceId();
  dependencias.registrar({ event: evento, status, traceId, ...(motivo && { motivo }) });
  return respuestaPropia({ ...cuerpo, traceId }, status);
}

/** 422 propio: nombra el campo que falla (sin eco del valor) para que la UI lo marque; no contacta a clinical-api. */
function responderCuerpoInvalido(contexto: Contexto, campo?: PropertyKey): Response {
  return responderPropia(contexto, 422, {
    error: 'CUERPO_INVALIDO',
    ...(typeof campo === 'string' && { field: campo }),
    message: 'La solicitud no cumple el contrato.',
  });
}

/** Única forma de 5xx hacia el navegador: nada de lo que envió clinical-api (cuerpo, pila, traza) lo atraviesa. */
function responderErrorInterno({ dependencias, evento }: Contexto, inicio: number): Response {
  const traceId = dependencias.nuevoTraceId();
  dependencias.registrar({
    event: evento,
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
function rechazarMutacion(request: Request, contexto: Contexto): Response | null {
  const { dependencias, evento } = contexto;
  const rechazoDeOrigen = verificarOrigen(request, { ...dependencias, evento });
  if (rechazoDeOrigen !== null) return rechazoDeOrigen;
  if (esTipoJson(request.headers)) return null;
  return responderPropia(
    contexto,
    403,
    { error: 'PERMISO_DENEGADO', message: 'La solicitud debe enviarse como application/json.' },
    'content_type',
  );
}

async function leerMutacion(
  request: Request,
  contexto: Contexto,
  esquema: ZodType,
): Promise<{ datos: unknown } | { rechazo: Response }> {
  const { dependencias, evento } = contexto;
  const cuerpo = await leerCuerpoAcotado(request, dependencias.config.maxBodyBytes);
  if (cuerpo === null) return { rechazo: responderCuerpoExcesivo(dependencias, evento) };
  let datos: unknown;
  try {
    datos = JSON.parse(cuerpo);
  } catch {
    return { rechazo: responderCuerpoInvalido(contexto) };
  }
  const leido = esquema.safeParse(datos);
  if (leido.success) return { datos: leido.data };
  return { rechazo: responderCuerpoInvalido(contexto, leido.error.issues[0]?.path[0]) };
}

async function pedir(llamada: () => Promise<Respuesta>): Promise<Response | undefined> {
  try {
    return (await llamada()).response;
  } catch {
    return undefined;
  }
}

/**
 * Proxy de las cinco operaciones de corrección con histórico (US-253), de las tres del tratamiento previo y el atributo manuales (US-094) y de las tres de los formularios de biomarcador y diagnóstico (US-111). Las lecturas van sin `Origin` (cookie
 * `SameSite=Strict`); las mutaciones verifican `Origin` y validan el cuerpo con el Zod generado antes de reenviarlo.
 * Solo la cookie de sesión sale hacia clinical-api; 2xx y 4xx se retransmiten sin reinterpretar y un 5xx o un fallo
 * de red responde `ERROR_INTERNO` propio. El log lleva el evento de la operación, status y traceId: nunca ids,
 * valores ni texto de notas.
 */
export function crearManejadorDeRegistroManual(
  dependencias: DependenciasDelBff,
  operacion: OperacionDeRegistroManual,
): ManejadorDeRegistroManual {
  const definicion = DEFINICIONES[operacion];
  const contexto: Contexto = { dependencias, evento: definicion.evento };
  return async (request, parametros) => {
    const rechazo = definicion.cuerpo ? rechazarMutacion(request, contexto) : null;
    if (rechazo !== null) return rechazo;
    const llamada = definicion.preparar(parametros);
    if (llamada === null) {
      return responderPropia(contexto, 404, {
        error: 'NO_ENCONTRADO',
        message: 'Dato no encontrado.',
      });
    }
    let datos: unknown;
    if (definicion.cuerpo) {
      const lectura = await leerMutacion(request, contexto, definicion.cuerpo);
      if ('rechazo' in lectura) return lectura.rechazo;
      datos = lectura.datos;
    }
    const inicio = dependencias.ahora();
    const sdk = crearSdkClinicalApi(dependencias.config, { request, fetch: dependencias.fetch });
    const respuesta = await pedir(() => llamada(sdk, datos));
    if (respuesta === undefined || respuesta.status >= 500) {
      return responderErrorInterno(contexto, inicio);
    }
    return retransmitir(dependencias, { evento: definicion.evento, sdk, respuesta, inicio });
  };
}
