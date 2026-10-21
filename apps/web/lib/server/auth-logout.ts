import 'server-only';
import { logout } from '../../../../packages/api-contracts/src/client-web/clinical-api';
import { zErrorNoAutenticado } from '../../../../packages/api-contracts/src/zod/clinical-api/zod.gen';
import {
  analizarJson,
  reenviarCookieDeSesionSegura,
  responderConFalloDeAutenticacion,
  type DependenciasDeAutenticacion,
} from './auth-comun';
import {
  cabecerasHaciaNavegador,
  clasificarRespuestaDeClinicalApi,
  crearSdkClinicalApi,
} from './clinical-api';
import { ipDelCliente } from './ip-del-cliente';
import { verificarOrigen } from './origen';

const EVENTO_LOGOUT = 'auth.logout';

export type DependenciasLogout = DependenciasDeAutenticacion;

/**
 * Proxy del cierre de sesión (design D6). `verificarOrigen()` va primero y antes de contactar a clinical-api: con un
 * `Origin` ajeno responde 403 y la sesión sigue activa (CSRF, AC-5). Después llama a `logout` del SDK generado con
 * solo la cookie de sesión y la IP fijada por web, y retransmite el borrado de la cookie. El log lleva evento, status y
 * traceId: nunca la cookie ni el token.
 */
export function crearManejadorLogout(
  dependencias: DependenciasLogout,
): (request: Request) => Promise<Response> {
  return async (request) => {
    const traceId = dependencias.nuevoTraceId();
    const rechazo = verificarOrigen(request, {
      ...dependencias,
      nuevoTraceId: () => traceId,
      evento: EVENTO_LOGOUT,
    });
    if (rechazo !== null) {
      return rechazo;
    }

    const ip = ipDelCliente(request.headers);
    const sdk = crearSdkClinicalApi(dependencias.config, {
      request,
      fetch: dependencias.fetch,
      ...(ip !== undefined && { ipDelCliente: ip }),
    });
    const resultado = await logout({ client: sdk.client, parseAs: 'text', throwOnError: false });
    const clasificada = clasificarRespuestaDeClinicalApi(sdk, resultado.response);
    if ('fallo' in clasificada) {
      return responderConFalloDeAutenticacion(
        dependencias,
        EVENTO_LOGOUT,
        traceId,
        clasificada.fallo,
      );
    }
    const { respuesta, cuerpoCrudo } = clasificada;
    if (respuesta.status === 204) {
      return reenviarCookieDeSesionSegura(respuesta, dependencias, EVENTO_LOGOUT, traceId);
    }
    return reenviarNoAutenticado(respuesta, cuerpoCrudo, dependencias, traceId);
  };
}

/** El contrato solo declara 204 y 401 para `logout`: otro status o un cuerpo que no cumple el schema es 502 propio. */
function reenviarNoAutenticado(
  respuesta: Response,
  cuerpoCrudo: string,
  dependencias: DependenciasLogout,
  traceId: string,
): Response {
  const conforme =
    respuesta.status === 401 ? zErrorNoAutenticado.safeParse(analizarJson(cuerpoCrudo)) : undefined;
  if (conforme === undefined || !conforme.success) {
    return responderConFalloDeAutenticacion(
      dependencias,
      EVENTO_LOGOUT,
      traceId,
      'cuerpo_no_conforme',
    );
  }
  dependencias.registrar({
    event: EVENTO_LOGOUT,
    status: 401,
    traceId,
    traceIdClinicalApi: conforme.data.traceId,
  });
  return new Response(cuerpoCrudo, {
    status: 401,
    headers: cabecerasHaciaNavegador(respuesta),
  });
}
