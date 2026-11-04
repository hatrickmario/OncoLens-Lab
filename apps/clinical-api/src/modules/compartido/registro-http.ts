import type { Request, Response } from 'express';
import { rechazarNoEncontrado } from '../../infrastructure/http-errores.js';
import type { Registrar } from '../../infrastructure/logger.js';
import { traceIdDe } from '../../middleware/trace-id.middleware.js';
import { idDePacienteSchema } from '../patients/patients.schema.js';
import type { LecturaDeCuerpo } from './cuerpo-de-registro.js';
import { ValorFueraDeCatalogoError } from './errores-de-registro.js';
import {
  cuerpoInvalidoDelCampo,
  rechazar,
  rechazoComunDe,
  registrarResultado,
  type Rechazo,
} from './http-escritura.js';
import { PacienteNoEncontradoError } from './pacientes.errores.js';

/*
 * Traducción HTTP común de los `POST /platform/patients/{id}/<registro>` del oncólogo (tratamiento previo, atributo):
 * valida el cuerpo, responde 201 `no-store`, traduce los errores de dominio y deja UNA línea de log sin datos clínicos.
 */

export interface DependenciasDelRegistro<S> {
  /** El service de UNA petición: recibe el `traceId` para que el log de la normalización lo lleve. */
  readonly servicioPara: (traceId: string) => S;
  readonly registrar: Registrar;
}

export interface OperacionDeRegistro<S, C, R> {
  readonly evento: string;
  readonly leerCuerpo: (cuerpo: unknown) => LecturaDeCuerpo<C>;
  readonly ejecutar: (servicio: S, solicitud: { patientId: string; cuerpo: C }) => Promise<R>;
  /** Etiquetas no clínicas del resultado para la línea de log (p. ej. `mappingStatus`); nunca textos del paciente. */
  readonly etiquetasDelLog?: (creado: R) => Readonly<Record<string, string>>;
  /** Errores de dominio propios de la operación → rechazo; `undefined` si no es uno de ellos. */
  readonly rechazoPropioDe?: (error: unknown) => Rechazo | undefined;
}

/** Rechazos comunes con su `field`: el valor fuera del catálogo nombra el campo que lo causó. */
function rechazoDeRegistro(error: unknown): Rechazo | undefined {
  const comun = rechazoComunDe(error);
  if (comun !== undefined && error instanceof ValorFueraDeCatalogoError) {
    return { ...comun, campo: error.campo };
  }
  return comun;
}

/** Ejecuta la operación y responde 201 `no-store`, o traduce el error de dominio (404, 422) a su rechazo. */
async function ejecutarYResponder<S, C, R>(
  { servicioPara, registrar }: DependenciasDelRegistro<S>,
  operacion: OperacionDeRegistro<S, C, R>,
  response: Response,
  solicitud: { patientId: string; cuerpo: C },
): Promise<void> {
  const { patientId } = solicitud;
  try {
    const creado = await operacion.ejecutar(servicioPara(traceIdDe(response)), solicitud);
    const etiquetas = operacion.etiquetasDelLog?.(creado);
    registrarResultado(registrar, operacion.evento, response, patientId, 'ok', etiquetas);
    response.setHeader('Cache-Control', 'no-store');
    response.status(201).json(creado);
  } catch (error) {
    if (error instanceof PacienteNoEncontradoError) {
      rechazarNoEncontrado(response, registrar, operacion.evento);
      return;
    }
    const rechazo = operacion.rechazoPropioDe?.(error) ?? rechazoDeRegistro(error);
    if (rechazo === undefined) throw error;
    rechazar(registrar, operacion.evento, response, rechazo, patientId);
  }
}

export function crearRegistroHttp<S, C, R>(
  dependencias: DependenciasDelRegistro<S>,
  operacion: OperacionDeRegistro<S, C, R>,
) {
  const { registrar } = dependencias;
  return async (request: Request, response: Response): Promise<void> => {
    const patientId = idDePacienteSchema.safeParse(request.params['patientId']);
    const lectura = operacion.leerCuerpo(request.body);
    if (!lectura.valido) {
      const rechazo = cuerpoInvalidoDelCampo(lectura.campo);
      rechazar(registrar, operacion.evento, response, rechazo, patientId.data);
      return;
    }
    if (!patientId.success) {
      rechazarNoEncontrado(response, registrar, operacion.evento);
      return;
    }
    await ejecutarYResponder(dependencias, operacion, response, {
      patientId: patientId.data,
      cuerpo: lectura.cuerpo,
    });
  };
}
