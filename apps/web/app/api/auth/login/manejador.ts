import 'server-only';
import { login } from '../../../../../../packages/api-contracts/src/client-web/clinical-api';
import { zLoginBody } from '../../../../../../packages/api-contracts/src/zod/clinical-api/zod.gen';
import {
  cabecerasHaciaNavegador,
  crearSdkClinicalApi,
  NOMBRE_COOKIE_DE_SESION,
  respuestaDeFalloDeTransporte,
} from '../../../../lib/server/clinical-api';
import type { ConfigWeb } from '../../../../lib/server/config';
import { verificarOrigen } from '../../../../lib/server/origen';
import { leerCuerpoAcotado } from '../../../../lib/server/peticiones';
import type { LineaDeRegistro } from '../../../../lib/server/registro';
import { respuestaPropia } from '../../../../lib/server/respuestas';

const EVENTO_LOGIN = 'auth.login';

/** `motivo=content_type` es propio del login: el registro compartido solo conoce los motivos del análisis. */
export type LineaDeRegistroLogin = Omit<LineaDeRegistro, 'motivo'> & {
  motivo?: LineaDeRegistro['motivo'] | 'content_type' | 'sin_cookie_de_sesion';
};

export interface DependenciasLogin {
  config: ConfigWeb;
  fetch: typeof globalThis.fetch;
  nuevoTraceId: () => string;
  registrar: (linea: LineaDeRegistroLogin) => void;
}

/**
 * Proxy del login (design D6). Orden fijo y antes de leer el cuerpo: `Origin` y `Content-Type: application/json`
 * (un formulario de otro sitio no puede enviar JSON sin *preflight*: login CSRF). Después valida con el Zod
 * generado, llama a la operación `login` del SDK sin cookie entrante y retransmite SOLO la cookie de sesión.
 * El log lleva evento, status y traceId: nunca el cuerpo, el correo, la contraseña ni la cookie.
 */
export function crearManejadorLogin(
  dependencias: DependenciasLogin,
): (request: Request) => Promise<Response> {
  return async (request) => {
    const rechazo =
      verificarOrigen(request, { ...dependencias, evento: EVENTO_LOGIN }) ??
      exigirJson(request, dependencias);
    if (rechazo !== null) {
      return rechazo;
    }

    const credenciales = await leerCredenciales(request, dependencias.config.maxBodyBytes);
    if (credenciales === null) {
      return responderCuerpoInvalido(dependencias);
    }

    const sdk = crearSdkClinicalApi(dependencias.config, { fetch: dependencias.fetch });
    const resultado = await login({
      client: sdk.client,
      body: credenciales,
      parseAs: 'text',
      throwOnError: false,
    });
    const respuesta = resultado.response;
    if (respuesta === undefined) {
      return responderConFallo(dependencias, 'clinical_api_inalcanzable');
    }
    const traceId = respuesta.headers.get('x-trace-id');
    dependencias.registrar({
      event: EVENTO_LOGIN,
      status: respuesta.status,
      ...(traceId !== null && { traceId }),
    });
    if (respuesta.status === 204) {
      return (
        reenviarCookieDeSesion(respuesta) ?? responderConFallo(dependencias, 'sin_cookie_de_sesion')
      );
    }
    return new Response(sdk.cuerpoCrudo(respuesta) ?? null, {
      status: respuesta.status,
      headers: cabecerasHaciaNavegador(respuesta),
    });
  };
}

/** Compara solo el tipo MIME (el parámetro `charset` es válido); cualquier otro tipo → 403 propio del BFF. */
function exigirJson(request: Request, dependencias: DependenciasLogin): Response | null {
  const tipo = (request.headers.get('content-type') ?? '').split(';')[0] ?? '';
  if (tipo.trim().toLowerCase() === 'application/json') {
    return null;
  }
  const traceId = dependencias.nuevoTraceId();
  dependencias.registrar({ event: EVENTO_LOGIN, status: 403, traceId, motivo: 'content_type' });
  return respuestaPropia(
    {
      error: 'PERMISO_DENEGADO',
      message: 'La solicitud debe enviarse como application/json.',
      traceId,
    },
    403,
  );
}

async function leerCredenciales(request: Request, maxBytes: number) {
  const texto = await leerCuerpoAcotado(request, maxBytes);
  if (texto === null) {
    return null;
  }
  let json: unknown;
  try {
    json = JSON.parse(texto);
  } catch {
    return null;
  }
  const credenciales = zLoginBody.safeParse(json);
  return credenciales.success ? credenciales.data : null;
}

/**
 * 204 hacia el navegador con la única cabecera `Set-Cookie` de `oncolens_session`, tal cual la fijó el proveedor
 * (atributos incluidos, sin `Domain`). Cualquier otra cookie de clinical-api se descarta. `null` si no hay ninguna.
 */
function reenviarCookieDeSesion(respuesta: Response): Response | null {
  const cookie = respuesta.headers
    .getSetCookie()
    .find((valor) => valor.startsWith(`${NOMBRE_COOKIE_DE_SESION}=`));
  if (cookie === undefined) {
    return null;
  }
  const cabeceras = cabecerasHaciaNavegador(respuesta);
  cabeceras.append('Set-Cookie', cookie);
  return new Response(null, { status: 204, headers: cabeceras });
}

/** 422 local (Zod o cuerpo excesivo): el formulario lo muestra como el mismo error genérico que el 401. */
function responderCuerpoInvalido(dependencias: DependenciasLogin): Response {
  const traceId = dependencias.nuevoTraceId();
  dependencias.registrar({ event: EVENTO_LOGIN, status: 422, traceId });
  return respuestaPropia(
    {
      error: 'CUERPO_INVALIDO',
      message: 'El cuerpo de la petición no cumple el contrato.',
      traceId,
    },
    422,
  );
}

function responderConFallo(
  dependencias: DependenciasLogin,
  motivo: 'clinical_api_inalcanzable' | 'sin_cookie_de_sesion',
): Response {
  const traceId = dependencias.nuevoTraceId();
  dependencias.registrar({ event: EVENTO_LOGIN, status: 502, traceId, motivo });
  return respuestaDeFalloDeTransporte(traceId);
}
