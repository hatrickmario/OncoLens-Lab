import 'server-only';
import { login } from '../../../../packages/api-contracts/src/client-web/clinical-api';
import { zLoginBody } from '../../../../packages/api-contracts/src/zod/clinical-api/zod.gen';
import {
  cabecerasHaciaNavegador,
  crearSdkClinicalApi,
  NOMBRE_COOKIE_DE_SESION,
} from './clinical-api';
import type { DependenciasDelBff } from './dependencias';
import { verificarOrigen } from './origen';
import { esTipoJson, leerCuerpoAcotado } from './peticiones';
import { respuestaPropia } from './respuestas';

const EVENTO_LOGIN = 'auth.login';

export type DependenciasLogin = Pick<
  DependenciasDelBff,
  'config' | 'fetch' | 'nuevoTraceId' | 'registrar'
>;

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
    const propias = { ...dependencias, nuevoTraceId: () => traceId };
    const rechazo =
      verificarOrigen(request, { ...propias, evento: EVENTO_LOGIN }) ??
      exigirJson(request, propias);
    if (rechazo !== null) {
      return rechazo;
    }

    const credenciales = await leerCredenciales(request, dependencias.config.maxBodyBytes);
    if (credenciales === null) {
      return responderCuerpoInvalido(propias);
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
      return responderConFallo(propias, 'clinical_api_inalcanzable');
    }
    const cuerpoCrudo = sdk.cuerpoCrudo(respuesta);
    if (cuerpoCrudo !== undefined && cuerpoCrudo !== '' && !esTipoJson(respuesta.headers)) {
      return responderConFallo(propias, 'error_no_json', respuesta);
    }
    if (respuesta.status === 204) {
      const conCookie = reenviarCookieDeSesion(respuesta);
      return conCookie === null
        ? responderConFallo(propias, 'sin_cookie_de_sesion', respuesta)
        : registrarYDevolver(propias, conCookie, respuesta);
    }
    return registrarYDevolver(
      propias,
      new Response(cuerpoCrudo ?? null, {
        status: respuesta.status,
        headers: cabecerasHaciaNavegador(respuesta),
      }),
      respuesta,
    );
  };
}

function registrarYDevolver(
  dependencias: DependenciasLogin,
  salida: Response,
  upstream: Response,
): Response {
  const traceIdClinicalApi = upstream.headers.get('x-trace-id');
  dependencias.registrar({
    event: EVENTO_LOGIN,
    status: salida.status,
    traceId: dependencias.nuevoTraceId(),
    ...(traceIdClinicalApi !== null && { traceIdClinicalApi }),
  });
  return salida;
}

/** Compara solo el tipo MIME (el parámetro `charset` es válido); cualquier otro tipo → 403 propio del BFF. */
function exigirJson(request: Request, dependencias: DependenciasLogin): Response | null {
  if (esTipoJson(request.headers)) {
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
 * (sin `Domain`). Falla cerrado: si a esa cookie le falta HttpOnly, Secure o SameSite=Strict, o lleva `Domain`,
 * no se retransmite. Cualquier otra cookie de clinical-api se descarta. `null` si no hay una cookie válida.
 */
function reenviarCookieDeSesion(respuesta: Response): Response | null {
  const cookie = respuesta.headers
    .getSetCookie()
    .find((valor) => valor.startsWith(`${NOMBRE_COOKIE_DE_SESION}=`));
  if (cookie === undefined || !cookieEsSegura(cookie)) {
    return null;
  }
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

/** 502 propio del login: mensaje fijo, sin hostname, causa ni cuerpo parcial (ErrorServicioAutenticacion). */
function responderConFallo(
  dependencias: DependenciasLogin,
  motivo: 'clinical_api_inalcanzable' | 'sin_cookie_de_sesion' | 'error_no_json',
  upstream?: Response,
): Response {
  const traceId = dependencias.nuevoTraceId();
  const traceIdClinicalApi = upstream?.headers.get('x-trace-id') ?? null;
  dependencias.registrar({
    event: EVENTO_LOGIN,
    status: 502,
    traceId,
    ...(traceIdClinicalApi !== null && { traceIdClinicalApi }),
    motivo,
  });
  return respuestaPropia(
    {
      error: 'ERROR_SERVICIO_AUTENTICACION',
      message: 'El servicio de autenticación no respondió correctamente.',
      traceId,
    },
    502,
  );
}
