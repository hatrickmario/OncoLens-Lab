import 'server-only';
import type { z } from 'zod';
import { login } from '../../../../packages/api-contracts/src/client-web/clinical-api';
import {
  zErrorCredencialesInvalidas,
  zErrorCuerpoInvalido,
  zErrorInterno,
  zErrorLimiteSolicitudes,
  zLoginBody,
} from '../../../../packages/api-contracts/src/zod/clinical-api/zod.gen';
import {
  cabecerasHaciaNavegador,
  clasificarRespuestaDeClinicalApi,
  crearSdkClinicalApi,
  NOMBRE_COOKIE_DE_SESION,
} from './clinical-api';
import type { DependenciasDelBff } from './dependencias';
import { verificarOrigen } from './origen';
import { esTipoJson, leerCuerpoAcotado } from './peticiones';
import type { LineaDeRegistro } from './registro';
import { respuestaPropia } from './respuestas';

const EVENTO_LOGIN = 'auth.login';

export type DependenciasLogin = Pick<
  DependenciasDelBff,
  'config' | 'fetch' | 'nuevoTraceId' | 'registrar'
>;

type MotivoDeFallo = NonNullable<LineaDeRegistro['motivo']>;

/** Errores que el contrato declara para `login`, por status. Cualquier otro status o forma → 502 propio. */
const ESQUEMAS_DE_ERROR: Record<number, z.ZodType<{ traceId: string }>> = {
  401: zErrorCredencialesInvalidas,
  422: zErrorCuerpoInvalido,
  429: zErrorLimiteSolicitudes,
  500: zErrorInterno,
};

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
    // TraceId propio del BFF, único para toda la petición; el de clinical-api va aparte en el log.
    const traceId = dependencias.nuevoTraceId();
    const rechazo =
      verificarOrigen(request, {
        ...dependencias,
        nuevoTraceId: () => traceId,
        evento: EVENTO_LOGIN,
      }) ?? exigirJson(request, dependencias, traceId);
    if (rechazo !== null) {
      return rechazo;
    }

    const credenciales = await leerCredenciales(request, dependencias.config.maxBodyBytes);
    if (credenciales === null) {
      return responderCuerpoInvalido(dependencias, traceId);
    }

    const sdk = crearSdkClinicalApi(dependencias.config, { fetch: dependencias.fetch });
    const resultado = await login({
      client: sdk.client,
      body: credenciales,
      parseAs: 'text',
      throwOnError: false,
    });
    const clasificada = clasificarRespuestaDeClinicalApi(sdk, resultado.response);
    if ('fallo' in clasificada) {
      return responderConFallo(dependencias, traceId, clasificada.fallo);
    }
    const { respuesta, cuerpoCrudo } = clasificada;
    if (respuesta.status === 204) {
      return reenviarCookieDeSesion(respuesta, dependencias, traceId);
    }
    return reenviarErrorDelContrato(respuesta, cuerpoCrudo, dependencias, traceId);
  };
}

/**
 * Retransmite el error de clinical-api solo si su status está declarado para `login` y el cuerpo cumple
 * el schema generado de ese status; si no, 502 propio sin eco. El `traceId` remoto sale del cuerpo del contrato.
 */
function reenviarErrorDelContrato(
  respuesta: Response,
  cuerpoCrudo: string,
  dependencias: DependenciasLogin,
  traceId: string,
): Response {
  const conforme = ESQUEMAS_DE_ERROR[respuesta.status]?.safeParse(analizarJson(cuerpoCrudo));
  if (conforme === undefined || !conforme.success) {
    return responderConFallo(dependencias, traceId, 'cuerpo_no_conforme');
  }
  dependencias.registrar({
    event: EVENTO_LOGIN,
    status: respuesta.status,
    traceId,
    traceIdClinicalApi: conforme.data.traceId,
  });
  return new Response(cuerpoCrudo, {
    status: respuesta.status,
    headers: cabecerasHaciaNavegador(respuesta),
  });
}

function analizarJson(texto: string): unknown {
  try {
    return JSON.parse(texto);
  } catch {
    return undefined;
  }
}

/** Compara solo el tipo MIME (el parámetro `charset` es válido); cualquier otro tipo → 403 propio del BFF. */
function exigirJson(
  request: Request,
  dependencias: DependenciasLogin,
  traceId: string,
): Response | null {
  if (esTipoJson(request.headers)) {
    return null;
  }
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
  const credenciales = zLoginBody.safeParse(analizarJson(texto));
  return credenciales.success ? credenciales.data : null;
}

/**
 * 204 hacia el navegador con la única cabecera `Set-Cookie` de `oncolens_session`, tal cual la fijó el proveedor
 * (sin `Domain`). Falla cerrado: si a esa cookie le falta HttpOnly, Secure o SameSite=Strict, o lleva `Domain`,
 * no se retransmite y responde 502. Cualquier otra cookie de clinical-api se descarta.
 */
function reenviarCookieDeSesion(
  respuesta: Response,
  dependencias: DependenciasLogin,
  traceId: string,
): Response {
  const cookie = respuesta.headers
    .getSetCookie()
    .find((valor) => valor.startsWith(`${NOMBRE_COOKIE_DE_SESION}=`));
  if (cookie === undefined || !cookieEsSegura(cookie)) {
    return responderConFallo(dependencias, traceId, 'sin_cookie_de_sesion');
  }
  dependencias.registrar({ event: EVENTO_LOGIN, status: 204, traceId });
  const cabeceras = cabecerasHaciaNavegador(respuesta);
  cabeceras.append('Set-Cookie', cookie);
  return new Response(null, { status: 204, headers: cabeceras });
}

function cookieEsSegura(cookie: string): boolean {
  const atributos = cookie
    .split(';')
    .slice(1)
    .map((atributo) => atributo.trim().toLowerCase());
  return (
    atributos.includes('httponly') &&
    atributos.includes('secure') &&
    atributos.includes('samesite=strict') &&
    !atributos.some((atributo) => atributo.startsWith('domain'))
  );
}

/** 422 local (Zod o cuerpo excesivo): el formulario lo muestra como el mismo error genérico que el 401. */
function responderCuerpoInvalido(dependencias: DependenciasLogin, traceId: string): Response {
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

/** 502 propio del login: mensaje fijo, sin hostname, causa ni cuerpo parcial (ErrorServicioAutenticacion). */
function responderConFallo(
  dependencias: DependenciasLogin,
  traceId: string,
  motivo: MotivoDeFallo,
): Response {
  dependencias.registrar({ event: EVENTO_LOGIN, status: 502, traceId, motivo });
  return respuestaPropia(
    {
      error: 'ERROR_SERVICIO_AUTENTICACION',
      message: 'El servicio de autenticación no respondió correctamente.',
      traceId,
    },
    502,
  );
}
