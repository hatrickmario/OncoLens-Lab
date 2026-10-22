import 'server-only';
import {
  listPatients,
  searchPatients,
} from '../../../../packages/api-contracts/src/client-web/clinical-api';
import {
  zListPatientsQuery,
  zSearchPatientsBody,
} from '../../../../packages/api-contracts/src/zod/clinical-api/zod.gen';
import { crearSdkClinicalApi } from './clinical-api';
import type { DependenciasDelBff } from './dependencias';
import { verificarOrigen } from './origen';
import { esTipoJson, leerCuerpoAcotado } from './peticiones';
import { responderCuerpoExcesivo, responderCuerpoInvalido, retransmitir } from './proxy-json';
import { respuestaPropia } from './respuestas';

const EVENTO_LISTADO = 'patients.proxy';
const EVENTO_BUSQUEDA = 'patients.search.proxy';

type Manejador = (request: Request) => Promise<Response>;

/** Solo los filtros sin identidad del contrato: cualquier otro parámetro es un 422 propio (la identidad no viaja en la URL, RN-10). */
const filtrosDelListadoSchema = zListPatientsQuery.strict();

/** Campos que `PatientSearchRequest` declara; el Zod generado no rechaza los demás (`additionalProperties: false`). */
const CAMPOS_DE_LA_BUSQUEDA: ReadonlySet<string> = new Set([
  'idType',
  'nationalId',
  'name',
  'page',
]);

function leerFiltros(parametros: URLSearchParams) {
  const crudo: Record<string, unknown> = Object.fromEntries(parametros);
  const pagina = crudo['page'];
  return filtrosDelListadoSchema.safeParse({
    ...crudo,
    ...(typeof pagina === 'string' && { page: Number(pagina) }),
  });
}

/**
 * Proxy de `GET /platform/patients` (US-048). Sin `Origin`: es una lectura y la cookie es `SameSite=Strict`. Valida los
 * filtros con el Zod generado y reenvía solo la cookie de sesión, con `cache: 'no-store'` (hay identidad enmascarada).
 * El log lleva evento, status y traceId: nunca filtros ni cookie.
 */
export function crearManejadorListadoDePacientes(dependencias: DependenciasDelBff): Manejador {
  return async (request) => {
    const filtros = leerFiltros(new URL(request.url).searchParams);
    if (!filtros.success) {
      return responderCuerpoInvalido(dependencias, EVENTO_LISTADO);
    }
    const inicio = dependencias.ahora();
    const sdk = crearSdkClinicalApi(dependencias.config, { request, fetch: dependencias.fetch });
    const resultado = await listPatients({
      client: sdk.client,
      query: filtros.data,
      parseAs: 'text',
      throwOnError: false,
    });
    return retransmitir(dependencias, {
      evento: EVENTO_LISTADO,
      sdk,
      respuesta: resultado.response,
      inicio,
    });
  };
}

/** Compara solo el tipo MIME; cualquier otro tipo → 403 propio (un formulario de otro sitio no puede enviar JSON). */
function exigirJson(request: Request, dependencias: DependenciasDelBff): Response | null {
  if (esTipoJson(request.headers)) {
    return null;
  }
  const traceId = dependencias.nuevoTraceId();
  dependencias.registrar({ event: EVENTO_BUSQUEDA, status: 403, traceId, motivo: 'content_type' });
  return respuestaPropia(
    {
      error: 'PERMISO_DENEGADO',
      message: 'La solicitud debe enviarse como application/json.',
      traceId,
    },
    403,
  );
}

function analizarCriterio(texto: string): boolean {
  let datos: unknown;
  try {
    datos = JSON.parse(texto);
  } catch {
    return false;
  }
  const leido = zSearchPatientsBody.safeParse(datos);
  if (!leido.success || typeof datos !== 'object' || datos === null) {
    return false;
  }
  const { idType, nationalId, name } = leido.data;
  const soloCamposDelContrato = Object.keys(datos).every((campo) =>
    CAMPOS_DE_LA_BUSQUEDA.has(campo),
  );
  const criterioCompleto = (idType !== undefined && nationalId !== undefined) || name !== undefined;
  return soloCamposDelContrato && criterioCompleto;
}

/**
 * Proxy de `POST /platform/patients/search` (US-048). `verificarOrigen()` y `Content-Type: application/json` van antes de
 * leer el cuerpo; la identidad viaja solo en el cuerpo (nunca en la URL) y se reenvía tal cual, sin reserializar. El log
 * lleva evento, status y traceId: nunca el criterio, la cookie ni la respuesta.
 */
export function crearManejadorBusquedaDePacientes(dependencias: DependenciasDelBff): Manejador {
  return async (request) => {
    const traceId = dependencias.nuevoTraceId();
    const rechazo =
      verificarOrigen(request, {
        ...dependencias,
        nuevoTraceId: () => traceId,
        evento: EVENTO_BUSQUEDA,
      }) ?? exigirJson(request, { ...dependencias, nuevoTraceId: () => traceId });
    if (rechazo !== null) {
      return rechazo;
    }
    const cuerpo = await leerCuerpoAcotado(request, dependencias.config.maxBodyBytes);
    if (cuerpo === null) {
      return responderCuerpoExcesivo(dependencias, EVENTO_BUSQUEDA);
    }
    if (!analizarCriterio(cuerpo)) {
      return responderCuerpoInvalido(dependencias, EVENTO_BUSQUEDA);
    }
    const inicio = dependencias.ahora();
    const sdk = crearSdkClinicalApi(dependencias.config, { request, fetch: dependencias.fetch });
    const resultado = await searchPatients({
      client: sdk.client,
      body: cuerpo as unknown as Parameters<typeof searchPatients>[0]['body'],
      bodySerializer: (texto) => texto as string,
      parseAs: 'text',
      throwOnError: false,
    });
    return retransmitir(dependencias, {
      evento: EVENTO_BUSQUEDA,
      sdk,
      respuesta: resultado.response,
      inicio,
    });
  };
}
