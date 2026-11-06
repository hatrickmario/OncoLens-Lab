import 'server-only';
import { crearSdkClinicalApi, type SdkClinicalApi } from './clinical-api';
import type { DependenciasDelBff } from './dependencias';
import { retransmitir } from './proxy-json';
import { respuestaPropia } from './respuestas';

type Manejador = (request: Request, patientId: string) => Promise<Response>;
type MotivoDeFalloDeLectura = 'status_5xx' | 'clinical_api_inalcanzable';

export interface DescripcionDeProxyDeLectura {
  /** Evento de log (`<recurso>.proxy`); el log nunca lleva id, cuerpo ni cookie. */
  evento: string;
  /** Mensaje fijo del único 5xx que sale al navegador. */
  mensajeDeFallo: string;
  /** Mensaje fijo del `404` propio por id inválido; por defecto el del paciente. */
  mensajeNoEncontrado?: string;
  idValido: (patientId: string) => boolean;
  /** Llama a la operación del SDK generado con `parseAs: 'text'`. */
  pedir: (sdk: SdkClinicalApi, patientId: string) => Promise<{ response?: Response }>;
}

/** `undefined` cuando no hubo respuesta (fallo de red o timeout). */
async function pedirSinLanzar(
  descripcion: DescripcionDeProxyDeLectura,
  sdk: SdkClinicalApi,
  patientId: string,
): Promise<Response | undefined> {
  try {
    return (await descripcion.pedir(sdk, patientId)).response;
  } catch {
    return undefined;
  }
}

/**
 * Proxy de lectura `GET /platform/patients/{id}/<recurso>` (checklist, vista de caso): un id inválido es 404 propio sin
 * llamar; `200` y `4xx` se retransmiten con su cuerpo; `5xx`, fallo de red o timeout responden `ERROR_INTERNO` saneado
 * con `traceId` de web, sin nada de clinical-api.
 */
export function crearProxyDeLectura(
  dependencias: DependenciasDelBff,
  descripcion: DescripcionDeProxyDeLectura,
): Manejador {
  const { evento } = descripcion;

  const responderNoEncontrado = (): Response => {
    const traceId = dependencias.nuevoTraceId();
    dependencias.registrar({ event: evento, status: 404, traceId });
    return respuestaPropia(
      {
        error: 'NO_ENCONTRADO',
        message: descripcion.mensajeNoEncontrado ?? 'Paciente no encontrado.',
        traceId,
      },
      404,
    );
  };

  const responderNoDisponible = (inicio: number, motivo: MotivoDeFalloDeLectura): Response => {
    const traceId = dependencias.nuevoTraceId();
    dependencias.registrar({
      event: evento,
      status: 500,
      traceId,
      duracionMs: dependencias.ahora() - inicio,
      motivo,
    });
    return respuestaPropia(
      { error: 'ERROR_INTERNO', message: descripcion.mensajeDeFallo, traceId },
      500,
    );
  };

  return async (request, patientId) => {
    if (!descripcion.idValido(patientId)) {
      return responderNoEncontrado();
    }
    const inicio = dependencias.ahora();
    const sdk = crearSdkClinicalApi(dependencias.config, { request, fetch: dependencias.fetch });
    const respuesta = await pedirSinLanzar(descripcion, sdk, patientId);
    if (respuesta === undefined) {
      return responderNoDisponible(inicio, 'clinical_api_inalcanzable');
    }
    if (respuesta.status >= 500) {
      return responderNoDisponible(inicio, 'status_5xx');
    }
    return retransmitir(dependencias, { evento, sdk, respuesta, inicio });
  };
}
