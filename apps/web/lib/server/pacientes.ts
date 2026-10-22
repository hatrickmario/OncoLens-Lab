import 'server-only';
import { getPatient } from '../../../../packages/api-contracts/src/client-web/clinical-api';
import type {
  PatientAdminSummary,
  PatientSummary,
} from '../../../../packages/api-contracts/src/types/clinical-api';
import {
  zGetPatientPath,
  zGetPatientResponse,
} from '../../../../packages/api-contracts/src/zod/clinical-api/zod.gen';
import {
  clasificarRespuestaDeClinicalApi,
  crearSdkClinicalApi,
  type SdkClinicalApi,
} from './clinical-api';
import { leerJson, traceIdDe } from '../pacientes/respuesta';
import { dependenciasDeEntorno, type DependenciasDelBff } from './dependencias';

export type ResultadoDeFicha =
  | { tipo: 'ok'; ficha: PatientSummary | PatientAdminSummary }
  | { tipo: 'no_encontrada' }
  | { tipo: 'no_autenticado' }
  | { tipo: 'error'; traceId?: string };

const EVENTO = 'patients.ficha';

function interpretarRespuestaDeFicha(
  status: number,
  texto: string,
  cabecera: string | null,
): ResultadoDeFicha {
  if (status === 401) return { tipo: 'no_autenticado' };
  if (status === 404) return { tipo: 'no_encontrada' };
  const cuerpo = leerJson(texto);
  const leida = status === 200 ? zGetPatientResponse.safeParse(cuerpo) : null;
  if (leida?.success) {
    return { tipo: 'ok', ficha: leida.data as PatientSummary | PatientAdminSummary };
  }
  const traceId = traceIdDe(cuerpo, cabecera);
  return { tipo: 'error', ...(traceId !== undefined && { traceId }) };
}

async function pedirFicha(sdk: SdkClinicalApi, id: string): Promise<Response | undefined> {
  try {
    const resultado = await getPatient({
      client: sdk.client,
      path: { patientId: id },
      parseAs: 'text',
      throwOnError: false,
    });
    return resultado.response;
  } catch {
    return undefined;
  }
}

/**
 * Lee la ficha desde el servidor (RSC) con el SDK generado: solo la cookie de sesión sale hacia clinical-api, con
 * `cache: 'no-store'` (identidad descifrada). Un id que no es UUID es "no encontrada" sin llamar (D7). El log lleva
 * evento, status y traceId: nunca el id pedido ni la respuesta.
 */
export async function obtenerFicha(
  cabeceraCookie: string | null,
  id: string,
  dependencias: DependenciasDelBff = dependenciasDeEntorno(),
): Promise<ResultadoDeFicha> {
  if (!zGetPatientPath.safeParse({ patientId: id }).success) return { tipo: 'no_encontrada' };
  const request = new Request('http://web.interno/', {
    headers: cabeceraCookie === null ? {} : { cookie: cabeceraCookie },
  });
  const sdk = crearSdkClinicalApi(dependencias.config, { request, fetch: dependencias.fetch });
  const clasificada = clasificarRespuestaDeClinicalApi(sdk, await pedirFicha(sdk, id));
  if ('fallo' in clasificada) {
    const traceId = dependencias.nuevoTraceId();
    dependencias.registrar({ event: EVENTO, status: 502, traceId });
    return { tipo: 'error', traceId };
  }
  const { respuesta, cuerpoCrudo } = clasificada;
  const trace = respuesta.headers.get('x-trace-id');
  dependencias.registrar({
    event: EVENTO,
    status: respuesta.status,
    ...(trace && { traceId: trace }),
  });
  return interpretarRespuestaDeFicha(respuesta.status, cuerpoCrudo, trace);
}
